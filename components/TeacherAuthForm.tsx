"use client";

import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { Database } from "@/types/database.types";

interface Props {
  onAuthenticated: (session: Session) => void;
}

type FormState = "sign-in" | "sign-up";

type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];

export default function TeacherAuthForm({ onAuthenticated }: Props) {
  const [formState, setFormState] = useState<FormState>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseBrowserClient();

  const toggleFormState = () => {
    setFormState((prev) => (prev === "sign-in" ? "sign-up" : "sign-in"));
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    if (formState === "sign-in") {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !data.session) {
        setError(signInError?.message ?? "Unable to sign in");
      } else {
        onAuthenticated(data.session);
      }
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError || !data.session) {
        setError(signUpError?.message ?? "Unable to sign up");
      } else {
        const profile: ProfileInsert = {
          id: data.user!.id,
          full_name: fullName || null,
        };
        await supabase.from("profiles").upsert(profile);
        onAuthenticated(data.session);
      }
    }

    setSubmitting(false);
  };

  return (
    <div className="auth-card">
      <div className="auth-card__header">
        <h1>Fermi Competition Hub</h1>
        <p>Manage your classes, questions, and student performance.</p>
      </div>
      <form className="auth-card__form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teacher@example.com"
          />
        </div>
        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </div>
        {formState === "sign-up" && (
          <div className="form-field">
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Ms. Taylor"
            />
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Please wait..."
            : formState === "sign-in"
            ? "Sign in"
            : "Create account"}
        </button>
      </form>
      <p className="auth-card__toggle">
        {formState === "sign-in" ? "Need an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="link-button"
          onClick={toggleFormState}
          disabled={isSubmitting}
        >
          {formState === "sign-in" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
