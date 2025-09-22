# Fermi Quest Arena

A Duolingo-inspired web application that streamlines the Fermi competition for teachers and students. Teachers can register classes, auto-generate student credentials, monitor submissions and override answers. Students receive a playful timed interface to tackle the 10 official Fermi questions with confidence ratings.

## Tech stack

- [React 18](https://react.dev/) with [Vite](https://vitejs.dev/) for a fast SPA experience.
- [Supabase](https://supabase.com/) (Postgres + Auth) for authentication, data storage and realtime-friendly APIs.
- TypeScript for safer data modelling.
- Simple handcrafted CSS to echo Duolingo''s rounded, colourful aesthetic while enforcing the `Nunito` font.

## Getting started

1. **Install dependencies**

   ```bash
   cd app
   npm install
   ```

2. **Configure Supabase**

   - Create a Supabase project and grab the project URL plus the anonymous public API key.
   - Apply the schema in [`supabase-schema.sql`](app/supabase-schema.sql) via the SQL editor.
   - Copy `.env.example` to `.env` and fill in your credentials:

     ```bash
     cp .env.example .env
     # edit .env
     ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

   Vite defaults to http://localhost:5173 (configured in `vite.config.ts`).

4. **Create a teacher account**

   Use the teacher portal tab to sign up with email + password. This uses Supabase Auth; the authenticated session scopes class data to your user ID.

5. **Add classes and students**

   - Register a class name and the number of participating students.
   - Unique usernames/passwords are generated automatically and displayed in the roster table for easy distribution.
   - Teacher can optionally tag each student with a full name or let students provide one at their first login.

6. **Run the student competition**

   Students switch to the “Student Arena” tab, enter their credentials and launch a 40-minute timed challenge. Answers plus confidence levels flow straight into the same Supabase tables, so teachers see updates live.

7. **Override or review answers**

   Teachers expand any student row to tweak answers, update confidence levels, and instantly recalculate scores (±50% of the official answer counts as correct).

## Supabase schema

The schema file creates four tables and a set of policies:

- `classes`: mapped to `auth.users` for teacher ownership.
- `students`: generated credentials per class.
- `fermi_questions`: pre-seeded with the ten official competition questions.
- `student_answers`: stores every attempt with the confidence percentage and submission source (student vs teacher override).

Row-level security keeps roster data scoped to the authenticated teacher while allowing anonymous access needed for the lightweight student login. For production deployments, consider hashing student passwords and replacing the anonymous read policies with a secure RPC based flow.

## Scripts

- `npm run dev` – Start Vite in development mode.
- `npm run build` – Type-check and create an optimized production bundle.
- `npm run preview` – Preview the production bundle locally.

## Notes & future improvements

- Student passwords are stored as plaintext for demonstration simplicity; Supabase edge functions or auth-linked secondary users would harden this in production.
- Timer state currently lives client-side. Hooking into Supabase''s realtime or edge workers would allow proctoring multi-device attempts.
- Consider enabling Supabase realtime on `student_answers` and using subscriptions to push updates to teachers instantly.

## Font licensing

Nunito is loaded via Google Fonts and licensed under the SIL Open Font License, making it safe for competition usage.
