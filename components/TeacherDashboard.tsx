"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { Database } from "@/types/database.types";
import { calculateCorrectCount, formatConfidence } from "@/lib/fermi";
import LoadingState from "@/components/LoadingState";
import { v4 as uuid } from "uuid";

const CONFIDENCE_OPTIONS = [10, 30, 50, 70, 90];

type Question = Database["public"]["Tables"]["fermi_questions"]["Row"];
type StudentResponse = Database["public"]["Tables"]["student_responses"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"] & {
  student_responses: StudentResponse[];
};
type ClassRow = Database["public"]["Tables"]["classes"]["Row"] & {
  students: StudentRow[];
};

const mergeResponses = (
  existing: StudentResponse[],
  updates: StudentResponse[],
): StudentResponse[] => {
  const byQuestion = new Map<number, StudentResponse>();
  existing.forEach((response) => {
    byQuestion.set(response.question_id, response);
  });
  updates.forEach((response) => {
    byQuestion.set(response.question_id, response);
  });
  return Array.from(byQuestion.values());
};

type ClassFormValues = {
  name: string;
  studentCount: number;
};

type AddStudentResult = {
  username: string;
  password: string;
};

interface TeacherDashboardProps {
  session: Session;
  onSignOut: () => Promise<void>;
}

export default function TeacherDashboard({ session, onSignOut }: TeacherDashboardProps) {
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newClass, setNewClass] = useState<ClassFormValues>({
    name: "",
    studentCount: 10,
  });
  const [showCredentials, setShowCredentials] = useState<
    Record<string, AddStudentResult[]>
  >({});

  const teacherId = session.user.id;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [{ data: questionData, error: questionError }, { data: classData, error: classError }] =
        await Promise.all([
          supabase
            .from("fermi_questions")
            .select("*")
            .order("order_index", { ascending: true }),
          supabase
            .from("classes")
            .select(
              `id, name, class_code, created_at, students:students(*, student_responses:student_responses(*))`,
            )
            .eq("teacher_id", teacherId)
            .order("created_at", { ascending: true }),
        ]);

      if (questionError) {
        setError(questionError.message);
        setLoading(false);
        return;
      }

      if (classError) {
        setError(classError.message);
        setLoading(false);
        return;
      }

      setQuestions(questionData ?? []);
      const normalizedClasses = ((classData as ClassRow[]) ?? []).map((classEntry) => ({
        ...classEntry,
        students: (classEntry.students ?? []).map((student) => ({
          ...student,
          student_responses: student.student_responses ?? [],
        })),
      }));
      setClasses(normalizedClasses);
      setLoading(false);
    };

    fetchData();
  }, [supabase, teacherId]);

  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [classes]);

  const generateClassCode = () => {
    const prefix = "FERMI";
    const suffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return `${prefix}-${suffix.slice(0, 5)}`;
  };

  const generateCredentials = (
    classCode: string,
    count: number,
    offset = 0,
  ): AddStudentResult[] => {
    const credentials: AddStudentResult[] = [];
    for (let index = 1; index <= count; index += 1) {
      const number = offset + index;
      const username = `${classCode}-${String(number).padStart(2, "0")}`;
      const password = Math.random().toString(36).slice(-8);
      credentials.push({ username, password });
    }
    return credentials;
  };

  const persistStudents = async (
    classId: string,
    credentials: AddStudentResult[],
  ): Promise<StudentRow[]> => {
    const payload = credentials.map((credential) => ({
      id: uuid(),
      class_id: classId,
      username: credential.username,
      password: credential.password,
    }));

    const { data, error: insertError } = await supabase
      .from("students")
      .insert(payload)
      .select("*, student_responses:student_responses(*)");

    if (insertError) {
      throw insertError;
    }

    return ((data as StudentRow[]) ?? []).map((student) => ({
      ...student,
      student_responses: student.student_responses ?? [],
    }));
  };

  const handleCreateClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!newClass.name.trim()) {
      setError("Please provide a class name");
      return;
    }

    try {
      const classCode = generateClassCode();
      const { data, error: classError } = await supabase
        .from("classes")
        .insert({
          id: uuid(),
          teacher_id: teacherId,
          name: newClass.name.trim(),
          class_code: classCode,
        })
        .select()
        .single();

      if (classError || !data) {
        throw classError ?? new Error("Unable to create class");
      }

      const credentials = generateCredentials(classCode, newClass.studentCount, 0);
      const insertedStudents = await persistStudents(data.id, credentials);

      setShowCredentials((prev) => ({
        ...prev,
        [data.id]: credentials,
      }));

      setClasses((prev) => [
        ...prev,
        {
          ...(data as ClassRow),
          students: insertedStudents,
        },
      ]);

      setNewClass({ name: "", studentCount: newClass.studentCount });
    } catch (classCreationError) {
      setError(classCreationError instanceof Error ? classCreationError.message : "Unable to create class");
    }
  };

  const handleAddStudents = async (classId: string, count: number) => {
    if (count <= 0) return;

    const targetClass = classes.find((entry) => entry.id === classId);
    if (!targetClass) return;

    const credentials = generateCredentials(
      targetClass.class_code,
      count,
      targetClass.students.length,
    );

    try {
      const insertedStudents = await persistStudents(classId, credentials);
      setShowCredentials((prev) => ({
        ...prev,
        [classId]: credentials,
      }));
      setClasses((prev) =>
        prev.map((entry) =>
          entry.id === classId
            ? {
                ...entry,
                students: [...entry.students, ...insertedStudents],
              }
            : entry,
        ),
      );
    } catch (addStudentError) {
      setError(addStudentError instanceof Error ? addStudentError.message : "Unable to add students");
    }
  };

  const handleUpdateFullName = async (studentId: string, fullName: string) => {
    const { error: updateError } = await supabase
      .from("students")
      .update({ full_name: fullName.trim() || null })
      .eq("id", studentId);

    if (updateError) {
      setError(updateError.message);
    } else {
      setClasses((prev) =>
        prev.map((classEntry) => ({
          ...classEntry,
          students: classEntry.students.map((student) =>
            student.id === studentId ? { ...student, full_name: fullName.trim() || null } : student,
          ),
        })),
      );
    }
  };

  const handleSaveResponses = async (
    studentId: string,
    responses: Record<
      number,
      {
        answer: number | null;
        confidence: number | null;
      }
    >,
  ) => {
    const { data, error: upsertError } = await supabase
      .from("student_responses")
      .upsert(
        Object.entries(responses).map(([questionId, values]) => ({
          student_id: studentId,
          question_id: Number(questionId),
          answer_value: values.answer,
          confidence: values.confidence,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "student_id,question_id" },
      )
      .select("*");

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    const updatedResponses = (data as StudentResponse[]) ?? [];

    setClasses((prev) =>
      prev.map((classEntry) => ({
        ...classEntry,
        students: classEntry.students.map((student) =>
          student.id === studentId
            ? {
                ...student,
                student_responses: mergeResponses(student.student_responses, updatedResponses),
              }
            : student,
        ),
      })),
    );
  };

  if (loading) {
    return <LoadingState message="Loading your classes" />;
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1>Welcome back 👋</h1>
          <p>
            Build your classes, distribute student credentials, and keep track of the Fermi
            competition in one place.
          </p>
        </div>
        <button className="secondary-button" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <section className="dashboard__section">
        <h2>Create a class</h2>
        <form className="class-form" onSubmit={handleCreateClass}>
          <div className="form-field">
            <label htmlFor="className">Class name</label>
            <input
              id="className"
              value={newClass.name}
              onChange={(event) => setNewClass((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="7th Grade Explorers"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="studentCount">Number of students</label>
            <input
              id="studentCount"
              type="number"
              min={1}
              max={200}
              value={newClass.studentCount}
              onChange={(event) =>
                setNewClass((prev) => ({ ...prev, studentCount: Number(event.target.value) || 1 }))
              }
            />
          </div>
          <button className="primary-button" type="submit">
            Create class and generate credentials
          </button>
        </form>
      </section>
      <section className="dashboard__section">
        <h2>Your classes</h2>
        {sortedClasses.length === 0 ? (
          <p className="empty-state">
            No classes yet. Create one above to get started. The official Fermi questions will
            appear automatically once your students begin answering.
          </p>
        ) : (
          <div className="class-grid">
            {sortedClasses.map((classEntry) => (
              <ClassCard
                key={classEntry.id}
                classEntry={classEntry}
                questions={questions}
                showCredentials={showCredentials[classEntry.id]}
                onAddStudents={handleAddStudents}
                onUpdateFullName={handleUpdateFullName}
                onSaveResponses={handleSaveResponses}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface ClassCardProps {
  classEntry: ClassRow;
  questions: Question[];
  showCredentials?: AddStudentResult[];
  onAddStudents: (classId: string, count: number) => Promise<void> | void;
  onUpdateFullName: (studentId: string, fullName: string) => Promise<void> | void;
  onSaveResponses: (
    studentId: string,
    responses: Record<number, { answer: number | null; confidence: number | null }>,
  ) => Promise<void> | void;
}

function ClassCard({
  classEntry,
  questions,
  showCredentials,
  onAddStudents,
  onUpdateFullName,
  onSaveResponses,
}: ClassCardProps) {
  const [addCount, setAddCount] = useState(1);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const handleToggle = (studentId: string) => {
    setExpandedStudent((prev) => (prev === studentId ? null : studentId));
  };

  return (
    <article className="class-card">
      <header className="class-card__header">
        <div>
          <h3>{classEntry.name}</h3>
          <p>Class code: {classEntry.class_code}</p>
        </div>
        <div className="class-card__actions">
          <input
            type="number"
            min={1}
            max={100}
            value={addCount}
            onChange={(event) => setAddCount(Number(event.target.value) || 1)}
          />
          <button className="secondary-button" onClick={() => onAddStudents(classEntry.id, addCount)}>
            Add students
          </button>
        </div>
      </header>
      {showCredentials && showCredentials.length > 0 && (
        <div className="credential-banner">
          <h4>New student credentials</h4>
          <ul>
            {showCredentials.map((credential) => (
              <li key={credential.username}>
                <span>{credential.username}</span>
                <span className="credential-password">{credential.password}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="student-table">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Password</th>
              <th>Full name</th>
              <th>Correct answers</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {classEntry.students.map((student) => {
              const correctCount = calculateCorrectCount(student.student_responses, questions);
              return (
                <FragmentRow
                  key={student.id}
                  student={student}
                  correctCount={correctCount}
                  isExpanded={expandedStudent === student.id}
                  onToggle={() => handleToggle(student.id)}
                  onUpdateFullName={onUpdateFullName}
                  questions={questions}
                  onSaveResponses={onSaveResponses}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

interface FragmentRowProps {
  student: StudentRow;
  correctCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateFullName: (studentId: string, fullName: string) => Promise<void> | void;
  questions: Question[];
  onSaveResponses: (
    studentId: string,
    responses: Record<number, { answer: number | null; confidence: number | null }>,
  ) => Promise<void> | void;
}

function FragmentRow({
  student,
  correctCount,
  isExpanded,
  onToggle,
  onUpdateFullName,
  questions,
  onSaveResponses,
}: FragmentRowProps) {
  const [fullName, setFullName] = useState(student.full_name ?? "");

  return (
    <>
      <tr className={isExpanded ? "student-row student-row--expanded" : "student-row"}>
        <td>{student.username}</td>
        <td className="credential-password">{student.password}</td>
        <td>
          <input
            className="inline-input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            onBlur={() => onUpdateFullName(student.id, fullName)}
            placeholder="Student name"
          />
        </td>
        <td>
          <span className="badge badge--success">{correctCount} / {questions.length}</span>
        </td>
        <td>
          <button className="link-button" onClick={onToggle}>
            {isExpanded ? "Hide answers" : "View answers"}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="student-detail">
          <td colSpan={5}>
            <StudentResponsesEditor
              student={student}
              questions={questions}
              onSaveResponses={onSaveResponses}
            />
          </td>
        </tr>
      )}
    </>
  );
}

interface StudentResponsesEditorProps {
  student: StudentRow;
  questions: Question[];
  onSaveResponses: (
    studentId: string,
    responses: Record<number, { answer: number | null; confidence: number | null }>,
  ) => Promise<void> | void;
}

function StudentResponsesEditor({ student, questions, onSaveResponses }: StudentResponsesEditorProps) {
  const [draft, setDraft] = useState<Record<number, { answer: string; confidence: string }>>(() => {
    const initial: Record<number, { answer: string; confidence: string }> = {};
    student.student_responses.forEach((response) => {
      initial[response.question_id] = {
        answer: response.answer_value?.toString() ?? "",
        confidence: response.confidence?.toString() ?? "",
      };
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const initial: Record<number, { answer: string; confidence: string }> = {};
    student.student_responses.forEach((response) => {
      initial[response.question_id] = {
        answer: response.answer_value?.toString() ?? "",
        confidence: response.confidence?.toString() ?? "",
      };
    });
    setDraft(initial);
  }, [student.student_responses]);

  const handleChange = (
    questionId: number,
    field: "answer" | "confidence",
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      [questionId]: {
        answer: field === "answer" ? value : prev[questionId]?.answer ?? "",
        confidence: field === "confidence" ? value : prev[questionId]?.confidence ?? "",
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const payload = questions.reduce<Record<number, { answer: number | null; confidence: number | null }>>(
      (accumulator, question) => {
        const entry = draft[question.id];
        const answerValue = entry?.answer ? Number(entry.answer) : null;
        const confidenceValue = entry?.confidence ? Number(entry.confidence) : null;
        accumulator[question.id] = {
          answer: Number.isFinite(answerValue) ? answerValue : null,
          confidence: Number.isFinite(confidenceValue) ? confidenceValue : null,
        };
        return accumulator;
      },
      {},
    );

    await onSaveResponses(student.id, payload);
    setSaving(false);
    setMessage("Saved!");
    setTimeout(() => setMessage(null), 2500);
  };

  return (
    <div className="response-editor">
      <table>
        <thead>
          <tr>
            <th style={{ width: "40%" }}>Question</th>
            <th style={{ width: "30%" }}>Answer</th>
            <th style={{ width: "20%" }}>Confidence</th>
            <th style={{ width: "10%" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((question) => {
            const values = draft[question.id] ?? { answer: "", confidence: "" };
            const response = student.student_responses.find(
              (item) => item.question_id === question.id,
            );
            const isCorrect =
              response?.answer_value !== null &&
              Math.abs((response.answer_value ?? 0) - question.correct_answer) <=
                question.correct_answer * 0.5;

            return (
              <tr key={question.id}>
                <td>
                  <p className="question-text">{question.prompt}</p>
                  <p className="question-meta">Correct answer: {question.correct_answer.toLocaleString()}</p>
                </td>
                <td>
                  <input
                    type="number"
                    className="inline-input"
                    value={values.answer}
                    onChange={(event) => handleChange(question.id, "answer", event.target.value)}
                    placeholder="Enter answer"
                  />
                </td>
                <td>
                  <select
                    className="inline-input"
                    value={values.confidence}
                    onChange={(event) => handleChange(question.id, "confidence", event.target.value)}
                  >
                    <option value="">Select</option>
                    {CONFIDENCE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}%
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={isCorrect ? "badge badge--success" : "badge badge--muted"}>
                    {isCorrect ? "Correct" : "Pending"}
                  </span>
                  <p className="question-meta">{formatConfidence(response?.confidence)}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="response-editor__footer">
        <button className="primary-button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save answers"}
        </button>
        {message && <span className="save-message">{message}</span>}
      </div>
    </div>
  );
}
