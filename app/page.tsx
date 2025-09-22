"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import TeacherAuthForm from "@/components/TeacherAuthForm";
import TeacherDashboard from "@/components/TeacherDashboard";
import LoadingState from "@/components/LoadingState";
import { useSupabaseBrowserClient } from "@/lib/useSupabaseBrowserClient";

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { client: supabase, error: supabaseError } = useSupabaseBrowserClient();

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    const fetchSession = async () => {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }
      setSession(activeSession);
      setIsLoading(false);
    };

    fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) {
        return;
      }
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = useCallback(async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setSession(null);
  }, [supabase]);

  if (supabaseError) {
    return (
      <main className="auth-layout">
        <div className="auth-card">
          <div className="auth-card__header">
            <h1>Fermi Competition Hub</h1>
            <p>We couldn&apos;t connect to the server. Please try again later.</p>
          </div>
          <p className="form-error">{supabaseError.message}</p>
        </div>
      </main>
    );
  }

  if (!supabase || isLoading) {
    return <LoadingState message="Preparing your dashboard" />;
  }

  if (!session) {
    return (
      <main className="auth-layout">
        <TeacherAuthForm
          onAuthenticated={(newSession) => setSession(newSession)}
          supabase={supabase}
        />
      </main>
    );
  }

  return (
    <main className="dashboard-layout">
      <TeacherDashboard session={session} onSignOut={handleSignOut} supabase={supabase} />
    </main>
  );
}
