import request from "supertest";

// Los tests pegan contra el backend real ya corriendo en local (igual que
// la suite E2E de grulla_fe) — más simple y fiel que levantar la app
// Express sin servidor HTTP, y evita duplicar el bootstrap de Sequelize.
export const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4750";

// QA_ADMIN_EMAIL: correr las suites con otro admin de la misma empresa, para no
// cerrar la sesión de quien esté usando admin.qa (una sesión por usuario).
export const QA_COMPANY_ADMIN = { email: process.env.QA_ADMIN_EMAIL ?? "admin.qa@acme.test", password: "Test1234" };

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors?: unknown;
  code?: string;
}

/**
 * Activa un usuario recién creado con su enlace de invitación (Sprint 2: ya no
 * hay contraseña temporal "123456"). `createBody` es la respuesta de
 * POST /user/create, que trae el enlace en data.invitation.url (el token va
 * después de "#token="). Devuelve la sesión con la contraseña elegida.
 */
export async function activateInvitedUser(
  createBody: { data?: { invitation?: { url?: string } } },
  email: string,
  password = "Test1234"
): Promise<{ token: string; userId: number }> {
  const url = createBody.data?.invitation?.url ?? "";
  const token = decodeURIComponent(url.split("#token=")[1] ?? "");
  if (!token) throw new Error(`la respuesta de crear usuario no trae el enlace de invitación: ${JSON.stringify(createBody)}`);
  const completed = await request(BASE_URL).post("/api/password/link/complete").send({ token, password });
  if (completed.status !== 200) {
    throw new Error(`no se pudo activar la cuenta con el enlace: ${JSON.stringify(completed.body)}`);
  }
  return login(email, password);
}

export async function login(email: string, password: string): Promise<{ token: string; userId: number }> {
  const res = await request(BASE_URL).post("/api/signin").send({ email, password });
  if (res.status !== 200 || !res.body.success) {
    throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.Jwt as string, userId: res.body.data.UserId as number };
}

export function authedRequest(token: string) {
  return {
    get: (path: string) => request(BASE_URL).get(`/api${path}`).set("Authorization", `Bearer ${token}`),
    post: (path: string, body?: object) =>
      request(BASE_URL).post(`/api${path}`).set("Authorization", `Bearer ${token}`).send(body),
    put: (path: string, body?: object) =>
      request(BASE_URL).put(`/api${path}`).set("Authorization", `Bearer ${token}`).send(body),
    patch: (path: string, body?: object) =>
      request(BASE_URL).patch(`/api${path}`).set("Authorization", `Bearer ${token}`).send(body),
    delete: (path: string) => request(BASE_URL).delete(`/api${path}`).set("Authorization", `Bearer ${token}`),
  };
}

// Varios campos (nombre de cliente/producto/técnica) solo aceptan letras —
// se arma un sufijo "único" mapeando dígitos a letras, igual que wordStamp()
// en la suite E2E de Playwright (grulla_fe/e2e/helpers.ts).
export function wordStamp(): string {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const letters = "abcdefghij";
  return digits
    .split("")
    .map((digit) => letters[Number(digit)])
    .join("");
}
