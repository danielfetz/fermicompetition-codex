import type { Database } from "@/types/database.types";

type Question = Database["public"]["Tables"]["fermi_questions"]["Row"];

type StudentResponse = Database["public"]["Tables"]["student_responses"]["Row"];

export function calculateCorrectCount(
  responses: StudentResponse[],
  questions: Question[],
): number {
  const byQuestion = new Map<number, StudentResponse>();
  responses.forEach((response) => {
    byQuestion.set(response.question_id, response);
  });

  return questions.reduce((acc, question) => {
    const response = byQuestion.get(question.id);
    if (!response || response.answer_value === null) {
      return acc;
    }

    const tolerance = question.correct_answer * 0.5;
    const difference = Math.abs(response.answer_value - question.correct_answer);
    if (difference <= tolerance) {
      return acc + 1;
    }
    return acc;
  }, 0);
}

export function formatConfidence(confidence: number | null | undefined) {
  return confidence ? `${confidence}%` : "--";
}
