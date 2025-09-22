import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import type {
  ClassRecord,
  ConfidenceLevel,
  FermiQuestion,
  StudentAnswerRecord,
  StudentRecord,
} from '../types';

interface AuthFormState {
  email: string;
  password: string;
  confirmPassword: string;
}

interface DraftAnswer {
  answer: number | null;
  confidence: ConfidenceLevel | null;
}

type DraftAnswerMap = Record<string, Record<number, DraftAnswer>>;
type StudentAnswerMap = Record<string, Record<number, StudentAnswerRecord>>;
type StudentCollection = Record<string, StudentRecord[]>;

const confidenceOptions: ConfidenceLevel[] = [10, 30, 50, 70, 90];

const TeacherDashboard = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [authView, setAuthView] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState<AuthFormState>({
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<StudentCollection>({});
  const [questions, setQuestions] = useState<FermiQuestion[]>([]);
  const [answersByStudent, setAnswersByStudent] = useState<StudentAnswerMap>({});
  const [draftAnswers, setDraftAnswers] = useState<DraftAnswerMap>({});
  const [isSavingClass, setIsSavingClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassSize, setNewClassSize] = useState(5);
  const [rosterMessage, setRosterMessage] = useState<string | null>(null);
  const [savingAnswers, setSavingAnswers] = useState<Record<string, boolean>>({});

  const resetAuthForm = () =>
    setAuthForm({
      email: '',
      password: '',
      confirmPassword: '',
    });

  const handleAuthInputChange = (key: keyof AuthFormState, value: string) => {
    setAuthForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    const syncSession = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      setSession(initialSession);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    void syncSession();

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!session?.user) return;
    setIsLoading(true);
    try {
      const [{ data: questionData, error: questionError }, { data: classData, error: classError }] =
        await Promise.all([
          supabase.from('fermi_questions').select('*').order('order_index', { ascending: true }),
          supabase
            .from('classes')
            .select('*')
            .eq('teacher_id', session.user.id)
            .order('created_at', { ascending: true }),
        ]);

      if (questionError) throw questionError;
      if (classError) throw classError;

      setQuestions(questionData ?? []);
      setClasses(classData ?? []);

      const classIds = (classData ?? []).map((cls) => cls.id);
      if (classIds.length === 0) {
        setStudentsByClass({});
        setAnswersByStudent({});
        setDraftAnswers({});
        return;
      }

      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('*')
        .in('class_id', classIds)
        .order('created_at', { ascending: true });

      if (studentError) throw studentError;

      const studentIds = (studentData ?? []).map((student) => student.id);
      let answerData: StudentAnswerRecord[] | null = [];
      if (studentIds.length > 0) {
        const { data, error } = await supabase
          .from('student_answers')
          .select('*')
          .in('student_id', studentIds);
        if (error) throw error;
        answerData = data;
      }

      const studentCollection: StudentCollection = {};
      (studentData ?? []).forEach((student) => {
        if (!studentCollection[student.class_id]) {
          studentCollection[student.class_id] = [];
        }
        studentCollection[student.class_id].push(student);
      });
      setStudentsByClass(studentCollection);

      const answerMap: StudentAnswerMap = {};
      (answerData ?? []).forEach((record) => {
        if (!answerMap[record.student_id]) {
          answerMap[record.student_id] = {};
        }
        answerMap[record.student_id][record.question_id] = record;
      });
      setAnswersByStudent(answerMap);

      const drafts: DraftAnswerMap = {};
      Object.entries(answerMap).forEach(([studentId, entries]) => {
        drafts[studentId] = {};
        Object.entries(entries).forEach(([questionId, entry]) => {
          drafts[studentId][Number(questionId)] = {
            answer: entry.answer,
            confidence: entry.confidence,
          };
        });
      });
      setDraftAnswers(drafts);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Unable to load dashboard', error);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    if (authView === 'sign-up' && authForm.password !== authForm.confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    try {
      if (authView === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
        });
        if (error) throw error;
      }
      resetAuthForm();
    } catch (error: any) {
      setAuthError(error.message ?? 'Unable to authenticate.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setClasses([]);
    setStudentsByClass({});
    setAnswersByStudent({});
    setDraftAnswers({});
  };

  const generateUsername = (className: string, index: number) => {
    const base = className.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'FERMI';
    const stamp = new Date().getTime().toString().slice(-4);
    return `${base}${stamp}-${String(index + 1).padStart(2, '0')}`;
  };

  const generatePassword = () => {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 6;
    let password = '';
    for (let i = 0; i < length; i += 1) {
      password += characters[Math.floor(Math.random() * characters.length)];
    }
    return password;
  };

  const handleCreateClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user) return;
    if (!newClassName.trim()) {
      setRosterMessage('Please provide a class name.');
      return;
    }
    if (newClassSize <= 0) {
      setRosterMessage('Number of students must be at least 1.');
      return;
    }

    setIsSavingClass(true);
    setRosterMessage(null);
    try {
      const { data: created, error } = await supabase
        .from('classes')
        .insert({
          name: newClassName.trim(),
          teacher_id: session.user.id,
          expected_students: newClassSize,
        })
        .select('*')
        .single();

      if (error) throw error;
      if (!created) throw new Error('Class could not be created.');

      const roster = Array.from({ length: newClassSize }, (_, index) => ({
        class_id: created.id,
        username: generateUsername(created.name, index),
        password: generatePassword(),
      }));
      const { data: insertedStudents, error: rosterError } = await supabase
        .from('students')
        .insert(roster)
        .select('*');
      if (rosterError) throw rosterError;

      setClasses((prev) => [...prev, created]);
      setStudentsByClass((prev) => ({
        ...prev,
        [created.id]: insertedStudents ?? [],
      }));
      setRosterMessage('Class roster created with generated student credentials.');
      setNewClassName('');
      setNewClassSize(5);
    } catch (error: any) {
      setRosterMessage(error.message ?? 'Unable to create the class.');
    } finally {
      setIsSavingClass(false);
    }
  };

  const handleStudentNameUpdate = async (studentId: string, fullName: string | null) => {
    try {
      const { error } = await supabase
        .from('students')
        .update({ full_name: fullName?.trim() || null })
        .eq('id', studentId);
      if (error) throw error;
      setStudentsByClass((prev) => {
        const updated: StudentCollection = {};
        Object.entries(prev).forEach(([classId, roster]) => {
          updated[classId] = roster.map((student) =>
            student.id === studentId ? { ...student, full_name: fullName?.trim() || null } : student
          );
        });
        return updated;
      });
      setRosterMessage('Student details updated.');
    } catch (error) {
      setRosterMessage('Could not update the student right now.');
    }
  };

  const updateDraftAnswer = (
    studentId: string,
    questionId: number,
    partial: Partial<DraftAnswer>
  ) => {
    setDraftAnswers((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? {}),
        [questionId]: {
          answer: partial.answer ?? prev[studentId]?.[questionId]?.answer ?? null,
          confidence: partial.confidence ?? prev[studentId]?.[questionId]?.confidence ?? null,
        },
      },
    }));
  };

  const handleSaveAnswers = async (studentId: string) => {
    const payload = Object.entries(draftAnswers[studentId] ?? {}).map(([questionId, entry]) => ({
      student_id: studentId,
      question_id: Number(questionId),
      answer: entry.answer,
      confidence: entry.confidence,
      source: 'teacher' as const,
    }));

    if (payload.length === 0) return;
    setSavingAnswers((prev) => ({ ...prev, [studentId]: true }));
    try {
      const { data, error } = await supabase
        .from('student_answers')
        .upsert(payload, { onConflict: 'student_id,question_id' })
        .select('*');
      if (error) throw error;

      setAnswersByStudent((prev) => {
        const updated = { ...prev };
        if (!updated[studentId]) updated[studentId] = {};
        data?.forEach((record) => {
          updated[studentId][record.question_id] = record;
        });
        return updated;
      });
      setDraftAnswers((prev) => {
        const next = { ...prev };
        if (!next[studentId]) next[studentId] = {};
        data?.forEach((record) => {
          next[studentId][record.question_id] = {
            answer: record.answer,
            confidence: record.confidence,
          };
        });
        return next;
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Unable to save answers for student', studentId, error);
    } finally {
      setSavingAnswers((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const scoreByStudent = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    const allStudentIds = new Set<string>();
    Object.values(studentsByClass).forEach((roster) => {
      roster.forEach((student) => allStudentIds.add(student.id));
    });

    allStudentIds.forEach((studentId) => {
      const records = answersByStudent[studentId] ?? {};
      let correct = 0;
      let total = 0;
      questions.forEach((question) => {
        const entry = records[question.id];
        if (entry?.answer != null && question.correct_answer != null) {
          total += 1;
          if (question.correct_answer === 0) {
            if (entry.answer === 0) correct += 1;
          } else {
            const deviation = Math.abs(entry.answer - question.correct_answer) / Math.abs(question.correct_answer);
            if (deviation <= 0.5) correct += 1;
          }
        }
      });
      map.set(studentId, { correct, total });
    });
    return map;
  }, [answersByStudent, questions, studentsByClass]);

  const renderAuthForm = () => (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{authView === 'sign-in' ? 'Teacher sign in' : 'Create a teacher account'}</h2>
        <button
          type="button"
          className="tab-button"
          onClick={() => {
            setAuthView(authView === 'sign-in' ? 'sign-up' : 'sign-in');
            setAuthError(null);
            resetAuthForm();
          }}
        >
          {authView === 'sign-in' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
      </div>
      <form className="grid" style={{ gap: '1rem' }} onSubmit={handleAuthSubmit}>
        <div className="grid two">
          <label htmlFor="teacher-email" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontWeight: 700, color: '#4338ca' }}>Email</span>
            <input
              id="teacher-email"
              type="email"
              value={authForm.email}
              onChange={(event) => handleAuthInputChange('email', event.target.value)}
              placeholder="teacher@school.edu"
              required
            />
          </label>
          <label
            htmlFor="teacher-password"
            style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}
          >
            <span style={{ fontWeight: 700, color: '#4338ca' }}>Password</span>
            <input
              id="teacher-password"
              type="password"
              value={authForm.password}
              onChange={(event) => handleAuthInputChange('password', event.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </label>
          {authView === 'sign-up' && (
            <label
              htmlFor="teacher-confirm"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}
            >
              <span style={{ fontWeight: 700, color: '#4338ca' }}>Confirm password</span>
              <input
                id="teacher-confirm"
                type="password"
                value={authForm.confirmPassword}
                onChange={(event) => handleAuthInputChange('confirmPassword', event.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </label>
          )}
        </div>
        {authError && (
          <div className="status-pill pending" role="alert">
            {authError}
          </div>
        )}
        <button type="submit" style={{ alignSelf: 'flex-start', padding: '0.8rem 1.5rem' }}>
          {authView === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );

  if (!session) {
    return renderAuthForm();
  }

  return (
    <div className="grid" style={{ gap: '1.5rem' }}>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Welcome back 👋</h2>
          <button type="button" onClick={handleSignOut} style={{ padding: '0.6rem 1.2rem' }}>
            Sign out
          </button>
        </div>
        <p style={{ color: '#4338ca', marginBottom: '1rem' }}>
          Organise your classes, share generated logins with students and monitor their Fermi
          responses in real-time. Questions are synchronised across the competition.
        </p>
        <form className="grid two" onSubmit={handleCreateClass} style={{ gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontWeight: 700, color: '#4338ca' }}>Class name</span>
            <input
              type="text"
              value={newClassName}
              onChange={(event) => setNewClassName(event.target.value)}
              placeholder="e.g. Grade 9 Blue"
              required
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontWeight: 700, color: '#4338ca' }}>Number of students</span>
            <input
              type="number"
              min={1}
              value={newClassSize}
              onChange={(event) => setNewClassSize(Number(event.target.value))}
            />
          </div>
          <button type="submit" disabled={isSavingClass} style={{ padding: '0.85rem 1.5rem' }}>
            {isSavingClass ? 'Creating...' : 'Generate class roster'}
          </button>
        </form>
        {rosterMessage && (
          <div
            className="status-pill"
            style={{ marginTop: '1rem', background: 'rgba(99, 102, 241, 0.2)', color: '#4338ca' }}
          >
            {rosterMessage}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="card">
          <p>Loading your classes and student progress...</p>
        </div>
      )}

      {classes.map((klass) => {
        const students = studentsByClass[klass.id] ?? [];
        return (
          <div key={klass.id} className="card" style={{ borderTop: '6px solid #6366f1' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>
                  {klass.name}
                </h3>
                <span className="badge">{students.length} students</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#6366f1', fontWeight: 700 }}>Competition questions</p>
                <p style={{ fontSize: '0.9rem', color: '#4338ca' }}>10 official Fermi challenges</p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Student username</th>
                    <th>Generated password</th>
                    <th>Full name</th>
                    <th>Correct answers</th>
                    <th>Manage answers</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const score = scoreByStudent.get(student.id);
                    const correctLabel = score
                      ? `${score.correct}/${score.total || questions.length}`
                      : `0/${questions.length}`;
                    return (
                      <tr key={student.id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{student.username}</div>
                        </td>
                        <td>
                          <code style={{ fontWeight: 700 }}>{student.password}</code>
                        </td>
                        <td>
                          <input
                            type="text"
                            defaultValue={student.full_name ?? ''}
                            placeholder="Add full name"
                            onBlur={(event) =>
                              handleStudentNameUpdate(student.id, event.target.value || null)
                            }
                          />
                        </td>
                        <td>
                          <div
                            className={`status-pill ${score && score.correct >= 6 ? 'success' : 'pending'}`}
                          >
                            {correctLabel}
                          </div>
                        </td>
                        <td>
                          <details>
                            <summary style={{ cursor: 'pointer', color: '#4f46e5', fontWeight: 700 }}>
                              Review responses
                            </summary>
                            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem' }}>
                              {questions.map((question) => {
                                const currentDraft = draftAnswers[student.id]?.[question.id] ?? {
                                  answer: undefined,
                                  confidence: undefined,
                                };
                                return (
                                  <div
                                    key={`${student.id}-${question.id}`}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '3fr repeat(2, minmax(120px, 1fr))',
                                      gap: '0.6rem',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <span style={{ fontWeight: 600 }}>{question.prompt}</span>
                                    <input
                                      type="number"
                                      placeholder="Student answer"
                                      value={currentDraft.answer ?? ''}
                                      onChange={(event) =>
                                        updateDraftAnswer(student.id, question.id, {
                                          answer: event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                        })
                                      }
                                    />
                                    <select
                                      value={currentDraft.confidence ?? ''}
                                      onChange={(event) =>
                                        updateDraftAnswer(student.id, question.id, {
                                          confidence: event.target.value
                                            ? (Number(event.target.value) as ConfidenceLevel)
                                            : null,
                                        })
                                      }
                                    >
                                      <option value="">Confidence %</option>
                                      {confidenceOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {option}%
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })}
                              <button
                                type="button"
                                style={{ justifySelf: 'flex-end', padding: '0.6rem 1.2rem' }}
                                onClick={() => handleSaveAnswers(student.id)}
                                disabled={!!savingAnswers[student.id]}
                              >
                                {savingAnswers[student.id] ? 'Saving...' : 'Save responses'}
                              </button>
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {classes.length === 0 && !isLoading && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h3 className="card-title">No classes yet</h3>
          <p style={{ color: '#4338ca' }}>
            Use the form above to register your first class. Student accounts are generated
            automatically with safe credentials and are ready for play.
          </p>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
