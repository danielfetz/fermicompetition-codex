export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      classes: {
        Row: {
          id: string;
          teacher_id: string;
          name: string;
          class_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          name: string;
          class_code: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["classes"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "classes_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      fermi_questions: {
        Row: {
          id: number;
          prompt: string;
          correct_answer: number;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          prompt: string;
          correct_answer: number;
          order_index: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["fermi_questions"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      student_responses: {
        Row: {
          id: string;
          student_id: string;
          question_id: number;
          answer_value: number | null;
          confidence: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          question_id: number;
          answer_value?: number | null;
          confidence?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["student_responses"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "student_responses_student_id_fkey";
            columns: ["student_id"];
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_responses_question_id_fkey";
            columns: ["question_id"];
            referencedRelation: "fermi_questions";
            referencedColumns: ["id"];
          }
        ];
      };
      students: {
        Row: {
          id: string;
          class_id: string;
          username: string;
          password: string;
          full_name: string | null;
          first_login_completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          username: string;
          password: string;
          full_name?: string | null;
          first_login_completed?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["students"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey";
            columns: ["class_id"];
            referencedRelation: "classes";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
