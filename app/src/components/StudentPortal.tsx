import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import type {
  ConfidenceLevel,
  FermiQuestion,
  StudentAnswerRecord,
  StudentRecord,
} from '../types';

interface DraftAnswer {
  answer: number | null;
  confidence: ConfidenceLevel | null;
}

interface Credentials {
  username: string;
  password: string;
}

type Phase = 'login' | 'instructions' | 'playing' | 'summary';

const confidenceOptions: ConfidenceLevel[] = [10, 30, 50, 70, 90];
const SECONDS_PER_ATTEMPT = 40 * 60;

const StudentPortal = () => {
  const [phase, setPhase] = useState<Phase>('login');
  const [credentials, setCredentials] = useState<Credentials>({ username: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FermiQuestion[]>([]);
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [fullName, setFullName] = useState('');
  const [draftAnswers, setDraftAnswers] = useState<Record<number, DraftAnswer>>({});
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(SECONDS_PER_ATTEMPT);
  const [timerActive, setTimerActive] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    const fetchQuestions = async () => {
      const { data, error } = await supabase
        .from('fermi_questions')
        .select('*')
        .order('order_index', { ascending: true });
      if (error) {
        // eslint-disable-next-line no-console
        console.error('Unable to fetch Fermi questions', error);
        return;
      }
      setQuestions(data ?? []);
    };

    void fetchQuestions();
  }, []);

  useEffect(() => {
    if (!timerActive) return;
    const interval = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [timerActive]);

  const answeredCount = useMemo(() => {
    return questions.reduce((count, question) => {
      const draft = draftAnswers[question.id];
      if (draft && draft.answer != null && draft.confidence != null) {
        return count + 1;
      }
      return count;
    }, 0);
  }, [draftAnswers, questions]);

  const formattedTimeLeft = useMemo(() => {
    const minutes = Math.floor(timeLeft / 60)
      .toString()
      .padStart(2, '0');
    const seconds = Math.floor(timeLeft % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [timeLeft]);

  const updateDraftAnswer = (questionId: number, partial: Partial<DraftAnswer>) => {
    setDraftAnswers((prev) => ({
      ...prev,
      [questionId]: {
        answer:
          partial.answer !== undefined
            ? partial.answer
            : prev[questionId]?.answer ?? null,
        confidence:
          partial.confidence !== undefined
            ? partial.confidence
            : prev[questionId]?.confidence ?? null,
      },
    }));
  };

  const computeScore = useCallback(
    (records: StudentAnswerRecord[] | null | undefined): { correct: number; total: number } => {
      if (!records) return { correct: 0, total: 0 };
      const lookup = new Map<number, StudentAnswerRecord>();
      records.forEach((entry) => lookup.set(entry.question_id, entry));
      let correct = 0;
      let total = 0;
      questions.forEach((question) => {
        const record = lookup.get(question.id);
        if (record?.answer != null && question.correct_answer != null) {
          total += 1;
          if (question.correct_answer === 0) {
            if (record.answer === 0) correct += 1;
          } else {
            const deviation = Math.abs(record.answer - question.correct_answer) / Math.abs(question.correct_answer);
            if (deviation <= 0.5) correct += 1;
          }
        }
      });
      return { correct, total };
    },
    [questions]
  );

  const buildRecordsFromDraft = useCallback(() => {
    return (
      questions
        .map((question) => {
          const draft = draftAnswers[question.id];
          if (!draft || draft.answer == null) return null;
          return {
            id: `${student?.id ?? 'draft'}-${question.id}`,
            student_id: student?.id ?? 'draft',
            question_id: question.id,
            answer: draft.answer,
            confidence: draft.confidence ?? null,
            submitted_at: null,
            source: 'student' as const,
          } satisfies StudentAnswerRecord;
        })
        .filter(Boolean) as StudentAnswerRecord[]
    );
  }, [draftAnswers, questions, student?.id]);

  const handleStudentLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setSubmissionMessage(null);
    setScore(null);

    const username = credentials.username.trim();
    const password = credentials.password.trim();

    try {
      const { data: studentRecord, error } = await supabase
        .from('students')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (error) throw error;
      if (!studentRecord) {
        setLoginError('We could not find that username. Please check with your teacher.');
        return;
      }
      if (studentRecord.password !== password) {
        setLoginError('Incorrect password.');
        return;
      }

      setStudent(studentRecord);
      setFullName(studentRecord.full_name ?? '');
      setPhase('instructions');
      setTimeLeft(SECONDS_PER_ATTEMPT);
      setTimerActive(false);
      setAutoSubmitted(false);

      const { data: answersData, error: answersError } = await supabase
        .from('student_answers')
        .select('*')
        .eq('student_id', studentRecord.id);
      if (answersError) throw answersError;

      const initialDraft: Record<number, DraftAnswer> = {};
      answersData?.forEach((entry) => {
        initialDraft[entry.question_id] = {
          answer: entry.answer,
          confidence: entry.confidence,
        };
      });
      setDraftAnswers(initialDraft);
      if (answersData && answersData.length > 0) {
        setScore(computeScore(answersData));
      }
    } catch (error: any) {
      setLoginError(error.message ?? 'Unable to sign in right now.');
    }
  };

  const persistStudentName = useCallback(
    async (studentId: string, name: string | null) => {
      const { error } = await supabase
        .from('students')
        .update({ full_name: name })
        .eq('id', studentId);
      if (error) throw error;
    },
    []
  );

  const handleSubmitAnswers = useCallback(
    async (auto = false) => {
      if (!student) return;
      setIsSubmitting(true);
      setSubmissionMessage(null);
      try {
        if (fullName.trim() && fullName.trim() !== (student.full_name ?? '')) {
          await persistStudentName(student.id, fullName.trim());
          setStudent((prev) => (prev ? { ...prev, full_name: fullName.trim() } : prev));
        }

        const payload = questions
          .map((question) => ({
            student_id: student.id,
            question_id: question.id,
            answer: draftAnswers[question.id]?.answer ?? null,
            confidence: draftAnswers[question.id]?.confidence ?? null,
            source: 'student' as const,
          }))
          .filter((entry) => entry.answer !== null || entry.confidence !== null);

        if (payload.length === 0) {
          setSubmissionMessage('Add at least one answer before submitting.');
          setIsSubmitting(false);
          return;
        }

        const { data, error } = await supabase
          .from('student_answers')
          .upsert(payload, { onConflict: 'student_id,question_id' })
          .select('*');
        if (error) throw error;

        setScore(computeScore(data));
        setSubmissionMessage(auto ? 'Time is up! Your responses were auto-submitted.' : 'Responses saved.');
        setPhase('summary');
        setTimerActive(false);
      } catch (error: any) {
        setSubmissionMessage(error.message ?? 'We could not save your answers right now.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [computeScore, draftAnswers, fullName, persistStudentName, questions, student]
  );

  useEffect(() => {
    if (!timerActive || timeLeft > 0) return;
    if (autoSubmitted) return;
    setAutoSubmitted(true);
    void handleSubmitAnswers(true);
  }, [autoSubmitted, handleSubmitAnswers, timeLeft, timerActive]);

  if (phase === 'login') {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Enter the competition arena</h2>
          <span className="badge">Student login</span>
        </div>
        <form className="grid" style={{ gap: '1rem' }} onSubmit={handleStudentLogin}>
          <div className="grid two">
            <label htmlFor="student-username" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontWeight: 700, color: '#4338ca' }}>Username</span>
              <input
                id="student-username"
                type="text"
                required
                value={credentials.username}
                onChange={(event) =>
                  setCredentials((prev) => ({ ...prev, username: event.target.value }))
                }
                placeholder="Provided by your teacher"
              />
            </label>
            <label htmlFor="student-password" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontWeight: 700, color: '#4338ca' }}>Password</span>
              <input
                id="student-password"
                type="password"
                required
                value={credentials.password}
                onChange={(event) =>
                  setCredentials((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="Secret code"
              />
            </label>
          </div>
          {loginError && (
            <div className="status-pill pending" role="alert">
              {loginError}
            </div>
          )}
          <button type="submit" style={{ alignSelf: 'flex-start', padding: '0.8rem 1.6rem' }}>
            Start
          </button>
        </form>
      </div>
    );
  }

  if (!student) {
    return null;
  }

  if (phase === 'instructions') {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Ready to play, {fullName || student.username}?</h2>
          <span className="badge">40 minutes • 10 questions</span>
        </div>
        <div className="grid" style={{ gap: '1rem' }}>
          <p style={{ color: '#4338ca' }}>
            When you press <strong>Begin challenge</strong> the 40 minute timer starts. Provide your
            best estimation for each Fermi question and pick the confidence level you feel matches
            your response.
          </p>
          <label htmlFor="student-full-name" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontWeight: 700, color: '#4338ca' }}>Display name</span>
            <input
              id="student-full-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Tell us who you are (optional)"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setPhase('playing');
              setTimerActive(true);
              setSubmissionMessage(null);
              setTimeLeft(SECONDS_PER_ATTEMPT);
              setScore(null);
              setAutoSubmitted(false);
            }}
            style={{ padding: '0.85rem 1.8rem', justifySelf: 'flex-start' }}
          >
            Begin challenge
          </button>
          {score && score.total > 0 && (
            <div className="status-pill" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#312e81' }}>
              You already have recorded answers. Starting again lets you update them before the
              timer ends.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'summary') {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Great work, {fullName || student.username}!</h2>
          <span className="badge">Submission stored</span>
        </div>
        {score ? (
          <div className="grid" style={{ gap: '1rem' }}>
            <p style={{ color: '#4338ca' }}>
              You answered <strong>{score.correct}</strong> out of{' '}
              <strong>{questions.length}</strong> questions within ±50% of the official solution.
            </p>
            <div className="progress-bar">
              <span style={{ width: `${(score.correct / questions.length) * 100}%` }} />
            </div>
            {submissionMessage && (
              <div className="status-pill" style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#047857' }}>
                {submissionMessage}
              </div>
            )}
        <button
          type="button"
          onClick={() => {
            setPhase('instructions');
            setTimerActive(false);
            setTimeLeft(SECONDS_PER_ATTEMPT);
            setAutoSubmitted(false);
          }}
          style={{ padding: '0.75rem 1.6rem', justifySelf: 'flex-start' }}
        >
          Review / Edit responses
        </button>
          </div>
        ) : (
          <p>We were unable to calculate your score, but your responses were saved.</p>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'grid', gap: '1.2rem' }}>
      <div className="card-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <h2 className="card-title">Challenge in progress</h2>
          <div className="timer">
            ⏱️ <span>{formattedTimeLeft}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#4338ca', fontWeight: 700 }}>Answered: {answeredCount}/{questions.length}</p>
          <div className="progress-bar" style={{ width: '180px', marginLeft: 'auto' }}>
            <span style={{ width: `${(answeredCount / Math.max(questions.length, 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="grid" style={{ gap: '1rem' }}>
        {questions.map((question, index) => {
          const draft = draftAnswers[question.id] ?? { answer: null, confidence: null };
          return (
            <div
              key={question.id}
              className="card"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(129,140,248,0.2))',
                borderRadius: '18px',
                boxShadow: 'none',
                padding: '1.2rem 1.4rem',
              }}
            >
              <div className="badge" style={{ marginBottom: '0.6rem' }}>
                Question {index + 1}
              </div>
              <p style={{ fontWeight: 700, color: '#1e1b4b', marginBottom: '0.8rem' }}>{question.prompt}</p>
              <div className="grid two" style={{ gap: '0.8rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontWeight: 700, color: '#4338ca' }}>Your answer</span>
                  <input
                    type="number"
                    value={draft.answer ?? ''}
                    placeholder="e.g. 1200"
                    onChange={(event) =>
                      updateDraftAnswer(question.id, {
                        answer: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontWeight: 700, color: '#4338ca' }}>Confidence</span>
                  <select
                    value={draft.confidence ?? ''}
                    onChange={(event) =>
                      updateDraftAnswer(question.id, {
                        confidence: event.target.value
                          ? (Number(event.target.value) as ConfidenceLevel)
                          : null,
                      })
                    }
                  >
                    <option value="">Select %</option>
                    {confidenceOptions.map((level) => (
                      <option key={level} value={level}>
                        {level}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {submissionMessage && (
        <div className="status-pill" style={{ background: 'rgba(251, 191, 36, 0.2)', color: '#b45309' }}>
          {submissionMessage}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => {
            setScore(computeScore(buildRecordsFromDraft()));
            setSubmissionMessage(
              'This is a preview of your current answers. Press "Submit" to store them.'
            );
            setPhase('summary');
            setTimerActive(false);
          }}
          style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#4338ca', padding: '0.75rem 1.5rem' }}
        >
          Review summary
        </button>
        <button
          type="button"
          onClick={() => void handleSubmitAnswers(false)}
          disabled={isSubmitting}
          style={{ padding: '0.85rem 1.8rem' }}
        >
          {isSubmitting ? 'Saving...' : 'Submit answers'}
        </button>
      </div>
    </div>
  );
};

export default StudentPortal;
