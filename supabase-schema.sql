-- Enable required extensions
create extension if not exists "pgcrypto";

-- Profiles table links authenticated teachers to additional metadata
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- Teacher-created classes
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  class_code text not null unique,
  created_at timestamptz not null default now()
);

-- Student accounts generated for each class
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  username text not null unique,
  password text not null,
  full_name text,
  first_login_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Official competition questions managed centrally
create table if not exists public.fermi_questions (
  id serial primary key,
  prompt text not null,
  correct_answer numeric not null,
  order_index integer not null unique,
  created_at timestamptz not null default now()
);

-- Student responses captured either by teachers or the quiz
create table if not exists public.student_responses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  question_id integer not null references public.fermi_questions(id) on delete cascade,
  answer_value numeric,
  confidence integer,
  updated_at timestamptz not null default now(),
  constraint student_responses_student_question_key unique (student_id, question_id),
  constraint confidence_valid check (confidence is null or confidence in (10, 30, 50, 70, 90))
);

-- Seed questions (update the prompts/answers each year as needed)
insert into public.fermi_questions (prompt, correct_answer, order_index) values
  ('How many piano tuners work in New York City?', 125, 1),
  ('How many basketballs can fit inside a standard school bus?', 480, 2),
  ('What is the number of bricks in the Great Pyramid of Giza?', 2600000, 3),
  ('How many gallons of water flow over Niagara Falls every second?', 700000, 4),
  ('How many sheets of paper are used by a high school in one year?', 180000, 5),
  ('How many M&M''s would fit into an Olympic swimming pool?', 1100000000, 6),
  ('How many seconds old is a person who is 15 years old?', 473040000, 7),
  ('How many hairs are on an average human head?', 100000, 8),
  ('How many people are in the air flying on airplanes right now?', 500000, 9),
  ('How many pizzas are eaten in the United States each day?', 3000000, 10)
  on conflict (order_index) do update set
    prompt = excluded.prompt,
    correct_answer = excluded.correct_answer;

-- Row Level Security configuration
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_responses enable row level security;
alter table public.fermi_questions enable row level security;

-- Profiles: each teacher manages their own profile
create policy "Teachers can manage their profile" on public.profiles
  for all using (auth.uid() = id)
  with check (auth.uid() = id);

-- Classes: teachers can CRUD only their classes
create policy "Teachers manage their classes" on public.classes
  for all using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- Students: teachers can manage students belonging to their classes
create policy "Teachers manage their students" on public.students
  for all using (
    exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = auth.uid()
    )
  );

-- Student responses: teachers may view/edit submissions for their students
create policy "Teachers manage responses" on public.student_responses
  for all using (
    exists (
      select 1
      from public.students s
      join public.classes c on c.id = s.class_id
      where s.id = student_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.students s
      join public.classes c on c.id = s.class_id
      where s.id = student_id and c.teacher_id = auth.uid()
    )
  );

-- Allow everyone (teachers & students) to read the official question set
create policy "Public read access" on public.fermi_questions
  for select using (true);

-- Helper function to keep updated_at columns current
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_students_updated_at
before update on public.students
for each row execute procedure public.set_updated_at();

create trigger set_student_responses_updated_at
before update on public.student_responses
for each row execute procedure public.set_updated_at();

-- RPC: student login with generated credentials
create or replace function public.student_login(p_username text, p_password text)
returns public.students
language sql
security definer
set search_path = public
as $$
  select *
  from public.students
  where username = p_username
    and password = p_password
  limit 1;
$$;

grant execute on function public.student_login(text, text) to anon, authenticated;

-- RPC: fetch responses for a verified student
create or replace function public.get_student_responses(
  p_student_id uuid,
  p_username text,
  p_password text
)
returns setof public.student_responses
language sql
security definer
set search_path = public
as $$
  select sr.*
  from public.student_responses sr
  where sr.student_id = (
    select id
    from public.students
    where id = p_student_id
      and username = p_username
      and password = p_password
  );
$$;

grant execute on function public.get_student_responses(uuid, text, text) to anon, authenticated;

-- RPC: student completes their profile on first sign-in
create or replace function public.complete_student_profile(
  p_student_id uuid,
  p_username text,
  p_password text,
  p_full_name text
)
returns public.students
language sql
security definer
set search_path = public
as $$
  update public.students
  set full_name = nullif(p_full_name, ''),
      first_login_completed = true,
      updated_at = now()
  where id = p_student_id
    and username = p_username
    and password = p_password
  returning *;
$$;

grant execute on function public.complete_student_profile(uuid, text, text, text) to anon, authenticated;

-- RPC: upsert responses for a verified student account
create or replace function public.upsert_student_responses(
  p_student_id uuid,
  p_username text,
  p_password text,
  p_payload jsonb
)
returns setof public.student_responses
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_id uuid;
  item jsonb;
begin
  select id into verified_id
  from public.students
  where id = p_student_id
    and username = p_username
    and password = p_password;

  if verified_id is null then
    raise exception 'Invalid credentials';
  end if;

  if p_payload is null then
    return query select * from public.student_responses where student_id = verified_id;
  end if;

  for item in select * from jsonb_array_elements(p_payload)
  loop
    insert into public.student_responses (student_id, question_id, answer_value, confidence)
    values (
      verified_id,
      (item ->> 'question_id')::int,
      nullif(item ->> 'answer_value', '')::numeric,
      nullif(item ->> 'confidence', '')::int
    )
    on conflict (student_id, question_id)
    do update
      set answer_value = excluded.answer_value,
          confidence = excluded.confidence,
          updated_at = now();
  end loop;

  return query select * from public.student_responses where student_id = verified_id;
end;
$$;

grant execute on function public.upsert_student_responses(uuid, text, text, jsonb) to anon, authenticated;
