export type ConfidenceLevel = 10 | 30 | 50 | 70 | 90;

export interface FermiQuestion {
  id: number;
  prompt: string;
  correct_answer: number;
  order_index: number;
}

export interface ClassRecord {
  id: string;
  name: string;
  teacher_id: string;
  created_at: string;
  expected_students?: number | null;
}

export interface StudentRecord {
  id: string;
  class_id: string;
  username: string;
  password: string;
  full_name: string | null;
  created_at: string;
}

export interface StudentAnswerRecord {
  id: string;
  student_id: string;
  question_id: number;
  answer: number | null;
  confidence: ConfidenceLevel | null;
  submitted_at: string | null;
  source: 'student' | 'teacher';
}
