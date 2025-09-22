"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { Database, Json } from "@/types/database.types";
import { calculateCorrectCount } from "@/lib/fermi";

const CONFIDENCE_OPTIONS = [10, 30, 50, 70, 90];
const QUIZ_DURATION_SECONDS = 40 * 60;

type Question = Database["public"]["Tables"]["fermi_questions"]["Row"];
type Student = Database["public"]["Tables"]["students"]["Row"];

type Stage = "login" | "profile" | "quiz" | "complete";

type ResponseDraft = Record<number, { answer: string; confidence: string }>;

type SubmissionSummary = {
  totalQuestions: number;
  correct: number;
};

export default function StudentQuizPage() {
  const supabase = getSupabaseBrowserClient();
  const [stage, setStage] = useState<Stage>("login");
  const [student, setStudent] = useState<Student | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<ResponseDraft>({});
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(QUIZ_DURATION_SECONDS);
  const [summary, setSummary] = useState<SubmissionSummary | null>(null);

  const fetchQuestions = async () => {
    const { data, error: questionError } = await supabase
      .from("fermi_questions")
      .select("*")
      .order("order_index", { ascending: true });

    if (questionError) {
      setError(questionError.message);
      return;
    }

    setQuestions(data ?? []);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const { data, error: loginError } = await supabase.rpc("student_login", {
      p_username: username.trim(),
      p_password: password.trim(),
    });

    if (loginError || !data) {
      setError("Invalid credentials. Check your username and password.");
      return;
    }

    const studentData = data;
    setStudent(studentData);
    setFullName(studentData.full_name ?? "");
    await fetchQuestions();

    const { data: responseData, error: responseError } = await supabase.rpc(
      "get_student_responses",
      {
        p_student_id: studentData.id,
        p_username: username.trim(),
        p_password: password.trim(),
      },
    );

    if (responseError) {
      setError(responseError.message);
      return;
    }

    setResponses(() => {
      const initial: ResponseDraft = {};
      (responseData ?? []).forEach((response) => {
        initial[response.question_id] = {
          answer: response.answer_value?.toString() ?? "",
          confidence: response.confidence?.toString() ?? "",
        };
      });
      return initial;
    });

    if (!studentData.first_login_completed || !studentData.full_name) {
      setStage("profile");
    } else {
      setStage("quiz");
    }
  };

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!student) return;

    const { error: updateError, data: profileData } = await supabase.rpc("complete_student_profile", {
      p_student_id: student.id,
      p_username: username.trim(),
      p_password: password.trim(),
      p_full_name: fullName.trim(),
    });

    if (updateError) {
      setError(updateError.message);
      return;
    }

    const updatedStudent = profileData ?? {
      ...student,
      full_name: fullName.trim() || null,
      first_login_completed: true,
    };
    setStudent(updatedStudent);
    setStage("quiz");
  };

  const handleChangeResponse = (
    questionId: number,
    field: "answer" | "confidence",
    value: string,
  ) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: {
        answer: field === "answer" ? value : prev[questionId]?.answer ?? "",
        confidence: field === "confidence" ? value : prev[questionId]?.confidence ?? "",
      },
    }));
  };

  const handleSubmit = useCallback(async () => {
    if (!student) return;

    const payload = questions.map((question) => {
      const draft = responses[question.id];
      const answerValue = draft?.answer ? Number(draft.answer) : null;
      const confidenceValue = draft?.confidence ? Number(draft.confidence) : null;
      const isAnswerFinite = typeof answerValue === "number" && Number.isFinite(answerValue);
      const isConfidenceFinite =
        typeof confidenceValue === "number" && Number.isFinite(confidenceValue);
      return {
        question_id: question.id,
        answer_value: isAnswerFinite ? answerValue : null,
        confidence: isConfidenceFinite ? confidenceValue : null,
      };
    });

    const { data, error: upsertError } = await supabase.rpc("upsert_student_responses", {
      p_student_id: student.id,
      p_username: username.trim(),
      p_password: password.trim(),
      p_payload: payload as Json,
    });

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    const updatedResponses = data ?? [];
    const correctCount = calculateCorrectCount(updatedResponses, questions);
    setSummary({ correct: correctCount, totalQuestions: questions.length });
    setStage("complete");
    if (typeof window !== "undefined") {
      localStorage.removeItem(`fermi-timer-${student.id}`);
    }
  }, [password, questions, responses, student, supabase, username]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    if (stage === "quiz" && student) {
      const storageKey = `fermi-timer-${student.id}`;
      const storedStart = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      const startTime = storedStart ? Number(storedStart) : Date.now();
      if (!storedStart && typeof window !== "undefined") {
        localStorage.setItem(storageKey, startTime.toString());
      }

      const tick = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(QUIZ_DURATION_SECONDS - elapsed, 0);
        setTimeRemaining(remaining);
        if (remaining === 0) {
          handleSubmit();
        }
      };

      tick();
      timer = setInterval(tick, 1000);

      return () => {
        if (timer) clearInterval(timer);
      };
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [handleSubmit, stage, student]);

  const renderLogin = () => (
    <div className="student-card">
      <h1>Fermi Competition</h1>
      <p className="student-card__subtitle">Enter the credentials from your teacher to begin.</p>
      <form className="auth-card__form" onSubmit={handleLogin}>
        <div className="form-field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="FERMI-01"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="studentPassword">Password</label>
          <input
            id="studentPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit">
          Start
        </button>
      </form>
    </div>
  );

  const renderProfile = () => (
    <div className="student-card">
      <h1>Welcome!</h1>
      <p className="student-card__subtitle">Let us know who you are before starting the questions.</p>
      <form className="auth-card__form" onSubmit={handleProfileSubmit}>
        <div className="form-field">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Jordan Smith"
            required
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit">
          Continue to questions
        </button>
      </form>
    </div>
  );

  const renderQuiz = () => (
    <div className="student-quiz">
      <header className="student-quiz__header">
        <div>
          <h1>Answer the official Fermi questions</h1>
          <p>Provide your best estimate and pick how confident you feel for each question.</p>
        </div>
        <div className="timer" role="timer" aria-live="polite">
          <span>Time remaining</span>
          <strong>{formatDuration(timeRemaining)}</strong>
        </div>
      </header>
      <ol className="question-list">
        {questions.map((question) => {
          const draft = responses[question.id] ?? { answer: "", confidence: "" };
          return (
            <li key={question.id} className="question-card">
              <h2>Question {question.order_index}</h2>
              <p className="question-text">{question.prompt}</p>
              <div className="question-actions">
                <label>
                  Your answer
                  <input
                    type="number"
                    className="inline-input"
                    value={draft.answer}
                    onChange={(event) => handleChangeResponse(question.id, "answer", event.target.value)}
                    placeholder="Enter your estimate"
                  />
                </label>
                <label>
                  Confidence
                  <select
                    className="inline-input"
                    value={draft.confidence}
                    onChange={(event) => handleChangeResponse(question.id, "confidence", event.target.value)}
                  >
                    <option value="">Select</option>
                    {CONFIDENCE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
          );
        })}
      </ol>
      {error && <div className="error-banner">{error}</div>}
      <footer className="student-quiz__footer">
        <button className="secondary-button" type="button" onClick={handleSubmit}>
          Submit answers
        </button>
        <p>Responses are saved instantly for your teacher.</p>
      </footer>
    </div>
  );

  const renderSummary = () => (
    <div className="student-card">
      <h1>Great work!</h1>
      {summary && (
        <p className="student-card__subtitle">
          You solved {summary.correct} out of {summary.totalQuestions} questions within ±50% of the
          correct answer.
        </p>
      )}
      <p>Your teacher can review all answers instantly.</p>
    </div>
  );

  return (
    <main className="student-layout">
      {stage === "login" && renderLogin()}
      {stage === "profile" && renderProfile()}
      {stage === "quiz" && renderQuiz()}
      {stage === "complete" && renderSummary()}
    </main>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
