import request from "supertest";

// Los tests pegan contra el backend real ya corriendo en local (igual que
// la suite E2E de grulla_fe) — más simple y fiel que levantar la app
// Express sin servidor HTTP, y evita duplicar el bootstrap de Sequelize.
export const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4750";

export const QA_COMPANY_ADMIN = { email: "admin.qa@acme.test", password: "Test1234" };

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
