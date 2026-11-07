import { authedRequest, login } from "./helpers/apiClient";

const QA_ADMIN = { email: process.env.QA_ADMIN_EMAIL ?? "admin.qa@acme.test", password: "Test1234" };
const QA_GESTOR = { email: "gestor.qa@acme.test", password: "Test1234" };

// Id que no existe: verifyAccess (RBAC) corre ANTES que los validators y que
// cualquier búsqueda, así que un Gestor recibe 403 sin importar el id ni el
// body, y un admin recibe cualquier otra cosa (400/404), nunca 403.
const MISSING_ID = 2147483000;

interface CorrectionRoute {
  label: string;
  method: "put";
  path: string;
  body: Record<string, unknown>;
}

// Todas las rutas de corrección/anulación nuevas (decisión 1: solo admins).
const CORRECTION_ROUTES: CorrectionRoute[] = [
  { label: "corregir pago", method: "put", path: `/payment/update/${MISSING_ID}`, body: { amount: 1, method: "cash", paid_at: "2026-10-11", reason: "Prueba RBAC" } },
  { label: "corregir gasto", method: "put", path: `/quotation/expense/update/${MISSING_ID}`, body: { amount: 1, reason: "Prueba RBAC" } },
  { label: "anular gasto", method: "put", path: `/quotation/expense/disable/${MISSING_ID}`, body: {} },
  { label: "corregir compra", method: "put", path: `/purchase-order/purchase/update/${MISSING_ID}`, body: { amount: 1, reason: "Prueba RBAC" } },
  { label: "anular compra", method: "put", path: `/purchase-order/purchase/disable/${MISSING_ID}`, body: {} },
  { label: "corregir deuda manual", method: "put", path: `/employee-debt/update/${MISSING_ID}`, body: { amount: 1, reason: "Prueba RBAC" } },
  { label: "corregir reposición", method: "put", path: `/employee-debt/payment/update/${MISSING_ID}`, body: { amount: 1, reason: "Prueba RBAC" } },
];

/**
 * RBAC de la corrección de dinero (decisión 1 del plan): corregir y anular lo
 * hacen SOLO administradores. El rol plantilla Gestor no recibe ninguno de
 * estos recursos, y el admin de empresa sí.
 */
describe("RBAC de corrección de dinero — Gestor vs Administrador", () => {
  let adminApi: ReturnType<typeof authedRequest>;
  let gestorApi: ReturnType<typeof authedRequest>;

  beforeAll(async () => {
    adminApi = authedRequest((await login(QA_ADMIN.email, QA_ADMIN.password)).token);
    gestorApi = authedRequest((await login(QA_GESTOR.email, QA_GESTOR.password)).token);
  });

  it.each(CORRECTION_ROUTES)("el Gestor recibe 403 al $label", async ({ path, body }) => {
    const res = await gestorApi.put(path, body);
    expect(res.status).toBe(403);
  });

  it.each(CORRECTION_ROUTES)("el Administrador NO recibe 403 al $label (el RBAC lo deja pasar)", async ({ path, body }) => {
    const res = await adminApi.put(path, body);
    // Pasó el RBAC: lo que responda después (404 por id inexistente o 400 del
    // validator) es otra capa.
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
