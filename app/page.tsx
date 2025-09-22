"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import TeacherAuthForm from "@/components/TeacherAuthForm";
import TeacherDashboard from "@/components/TeacherDashboard";
import LoadingState from "@/components/LoadingState";

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    const fetchSession = async () => {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();
      setSession(activeSession);
      setIsLoading(false);
    };

    fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (isLoading) {
    return <LoadingState message="Preparing your dashboard" />;
  }

  if (!session) {
    return (
      <main className="auth-layout">
        <TeacherAuthForm onAuthenticated={(newSession) => setSession(newSession)} />
      </main>
    );
  }

  return (
    <main className="dashboard-layout">
      <TeacherDashboard session={session} onSignOut={handleSignOut} />
    </main>
  );
}
