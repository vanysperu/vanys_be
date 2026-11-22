// Modo enseñanza (21-nov). Las lecciones viven en el frontend (son pasos de
// pantalla); el backend guarda el avance y prepara los datos de práctica.

// Código de lección: minúsculas, números y guiones (ej. "first-quotation").
export const LESSON_CODE_PATTERN = /^[a-z0-9-]{2,60}$/;

// Datos que una lección necesita antes de empezar (una cotización lista para
// esa parte del proceso), creados en la empresa de práctica.
export const LESSON_PREPARATIONS = ["pending_quotation", "accepted_quotation"] as const;
export type LessonPreparation = (typeof LESSON_PREPARATIONS)[number];

export interface PracticeSessionResult {
  token: string;
  user: { fullName: string; email: string };
}

export interface PreparedLessonResult {
  quotation_id: number | null;
}

export interface SaveProgressInput {
  lessonCode: string;
  stepIndex: number;
  completed: boolean;
}

export interface LessonProgressDto {
  lesson_code: string;
  status: "in_progress" | "completed";
  step_index: number;
  completed_at: { date: string; time: string } | null;
}

export interface TeamMemberProgressDto {
  user_id: number;
  full_name: string;
  email: string;
  role_name: string | null;
  completed_lessons: string[];
  last_activity: { date: string; time: string } | null;
}

// Dueño real de una sesión: si la sesión es de un usuario de práctica, la
// persona y la empresa REALES detrás de él.
export interface PracticeOwner {
  realUserId: number;
  realCompanyId: number;
}
