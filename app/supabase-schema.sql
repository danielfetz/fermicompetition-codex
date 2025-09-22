-- Enable required extensions
create extension if not exists "uuid-ossp";

-- Teachers manage their own classes (teachers are stored in auth.users)
create table if not exists public.classes (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  expected_students integer,
  created_at timestamptz not null default timezone('utc', now())
);

-- Students roster generated per class
create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid not null references public.classes (id) on delete cascade,
  username text not null unique,
  password text not null,
  full_name text,
  created_at timestamptz not null default timezone('utc', now())
);

-- Official Fermi questions shared across all schools
create table if not exists public.fermi_questions (
  id serial primary key,
  order_index integer not null unique,
  prompt text not null,
  correct_answer double precision not null
);

-- Answers submitted either by students or overridden by teachers
create table if not exists public.student_answers (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.students (id) on delete cascade,
  question_id integer not null references public.fermi_questions (id) on delete cascade,
  answer double precision,
  confidence integer,
  submitted_at timestamptz not null default timezone('utc', now()),
  source text not null default 'student',
  constraint student_answers_confidence_check check (confidence in (10, 30, 50, 70, 90)),
  constraint student_answers_source_check check (source in ('student', 'teacher')),
  constraint student_answers_unique unique (student_id, question_id)
);

-- Seed official competition questions
insert into public.fermi_questions (order_index, prompt, correct_answer) values
  (1, 'How many piano tuners work in New York City?', 200),
  (2, 'How many golf balls can fit inside a standard American school bus?', 500000),
  (3, 'How many litres of water fill an Olympic-sized swimming pool?', 2500000),
  (4, 'How many smartphone photos are taken worldwide each day?', 4500000000),
  (5, 'How many heartbeats does an average human experience in a lifetime?', 2500000000),
  (6, 'How many seconds are there in a calendar year?', 31536000),
  (7, 'How many leaves does a mature oak tree carry in summer?', 200000),
  (8, 'How many cups of coffee are consumed in the United States each day?', 400000000),
  (9, 'How many passengers pass through the world''s busiest airport in a year?', 110000000),
  (10, 'What is the total length in metres of DNA inside a single human cell?', 2)
  on conflict (order_index) do nothing;

-- Optional: basic row level security to keep teacher data scoped
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_answers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where polname = 'Teachers manage their classes' and tablename = 'classes' and schemaname = 'public'
  ) then
    create policy "Teachers manage their classes" on public.classes
      for all using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where polname = 'Teachers manage roster' and tablename = 'students' and schemaname = 'public'
  ) then
    create policy "Teachers manage roster" on public.students
      for all using (
        exists (
          select 1 from public.classes c
          where c.id = students.class_id and c.teacher_id = auth.uid()
        )
      ) with check (
        exists (
          select 1 from public.classes c
          where c.id = students.class_id and c.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where polname = 'Teachers manage answers' and tablename = 'student_answers' and schemaname = 'public'
  ) then
    create policy "Teachers manage answers" on public.student_answers
      for all using (
        exists (
          select 1 from public.students s
          join public.classes c on c.id = s.class_id
          where s.id = student_answers.student_id and c.teacher_id = auth.uid()
        )
      ) with check (
        exists (
          select 1 from public.students s
          join public.classes c on c.id = s.class_id
          where s.id = student_answers.student_id and c.teacher_id = auth.uid()
        )
      );
  end if;
end $$;

-- Allow unauthenticated access for student logins and submissions (limit scope to select and upsert)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where polname = 'Students can read roster' and tablename = 'students' and schemaname = 'public'
  ) then
    create policy "Students can read roster" on public.students
      for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where polname = 'Students can submit answers' and tablename = 'student_answers' and schemaname = 'public'
  ) then
    create policy "Students can submit answers" on public.student_answers
      for select using (true)
      with check (true);
  end if;
end $$;
