[Attempt #1]

# Fermi Competition Hub

A Duolingo-inspired web application for running the Fermi competition across schools, powered by Next.js and Supabase. Teachers can manage classes, distribute student credentials, collect submissions, and review performance while students complete the official question set inside a timed experience.

## Features

- **Teacher authentication** via Supabase email/password.
- **Class creation** with automatic class codes and credential generation for every student.
- **Live roster management** with inline name editing and credential reminders.
- **Response dashboard** showing 10 official Fermi questions, editable answers, confidence levels, and automatic scoring within ±50% tolerance.
- **Student quiz app** with a 40-minute timer, answer + confidence capture, and automatic syncing back to the teacher dashboard.
- **Supabase-backed data model** with SQL scripts and RPC helpers for secure student access.

## Project structure

```
.
├── app/
│   ├── layout.tsx             # Root layout with Nunito font
│   ├── page.tsx               # Teacher portal (auth + dashboard)
│   └── student/page.tsx       # Student-facing quiz experience
├── components/                # Reusable UI building blocks
├── lib/                       # Supabase client + helper utilities
├── types/                     # Database type definitions
├── supabase-schema.sql        # Full SQL schema, policies, and RPCs
├── README.md                  # This guide
└── package.json               # Dependencies and scripts
```

## Prerequisites

- Node.js 18+
- Supabase project

## Setup

1. **Clone the repository and install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

   > Teachers authenticate with Supabase Auth, so make sure email/password sign-in is enabled in the Supabase dashboard.

3. **Create the database schema**

   In the Supabase SQL editor, run the contents of [`supabase-schema.sql`](./supabase-schema.sql). It will:

   - Create tables (`profiles`, `classes`, `students`, `fermi_questions`, `student_responses`).
   - Seed 10 official Fermi questions (update the list as the competition evolves).
   - Configure Row Level Security policies for teachers and students.
   - Register helper RPC functions used by the student app to log in, update their profile, and submit answers safely.

   The script installs the `pgcrypto` extension (for `gen_random_uuid`) and creates triggers to maintain `updated_at` columns.

4. **Run the development server**

   ```bash
   npm run dev
   ```

   Visit <http://localhost:3000> for the teacher experience and <http://localhost:3000/student> for the student quiz.

## Teacher workflow

1. Sign up or sign in with your teacher email.
2. Create a class, choosing how many students will participate. The app generates class-specific usernames and passwords automatically (e.g., `FERMI-ABC12-01`).
3. Share credentials with students. You can revisit them anytime from the class card.
4. As students work, their responses appear instantly. You can edit answers or confidence percentages and override submissions if needed.
5. The dashboard shows how many questions each student answered within ±50% of the correct solution.

## Student workflow

1. Navigate to `/student` and log in with the provided username and password.
2. On first sign-in, supply a full name (teachers can also override it later).
3. Complete the 10-question set within the 40-minute timer, choosing both an answer and a confidence level (10–90%).
4. Submit answers at any time—the teacher immediately sees the data.

## Customisation tips

- Update the seeded Fermi questions in `supabase-schema.sql` to match the official competition set for your year.
- Adjust the tolerance logic inside [`lib/fermi.ts`](./lib/fermi.ts) if scoring criteria change.
- The UI styling lives in [`app/globals.css`](./app/globals.css) and follows a Nunito/blue-green palette inspired by Duolingo.

## Notes on security

- Student credentials are stored in plain text for demonstration purposes. For production, replace them with hashed values and consider issuing Supabase Auth users or one-time login links.
- The provided RPC functions (`student_login`, `get_student_responses`, `complete_student_profile`, `upsert_student_responses`) encapsulate credential checks so anonymous users cannot enumerate other records.
- Teachers interact with the database through Supabase Auth; the included RLS policies restrict access to their own classes and students.

## Scripts

- `npm run dev` – Start Next.js in development mode.
- `npm run build` – Build for production.
- `npm run start` – Run the production build.
- `npm run lint` – Lint the codebase with Next.js/ESLint.

## License

MIT – feel free to adapt the platform for your own Fermi competition events.
