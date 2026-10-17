import { authedRequest, login } from "./helpers/apiClient";
import { createQuotationFixture } from "./helpers/fixtures";

const QA_ADMIN = { email: "admin.qa@acme.test", password: "Test1234" };
const QA_GESTOR = { email: "gestor.qa@acme.test", password: "Test1234" };

// Un Gestor puede crear/listar pagos (ya lo prueba payment.test.ts
// implícitamente vía el admin) pero NUNCA editarlos ni anularlos — y no
// tiene ningún acceso al módulo "Deudas a personal" (exclusivo del
// Administrador de la empresa). Esto valida que el RBAC sembrado en
// 20261011100300-seed-payment-module.js / ...100400-seed-employee-debt...
// realmente bloquea del lado del backend, no solo que el frontend oculte
// el botón.
describe("RBAC — Gestor vs Administrador en los módulos nuevos", () => {
  let adminToken: string;
  let gestorToken: string;
  let companyId: number;

  beforeAll(async () => {
    const admin = await login(QA_ADMIN.email, QA_ADMIN.password);
    adminToken = admin.token;
    const gestor = await login(QA_GESTOR.email, QA_GESTOR.password);
    gestorToken = gestor.token;

    const access = await authedRequest(adminToken).get("/access/me");
    companyId = access.body.data.companyId;
  });

  it("Gestor puede listar pagos (payment.list.endpoint sí le fue otorgado)", async () => {
    const res = await authedRequest(gestorToken).get("/payment/list");
    expect(res.status).toBe(200);
  });

  it("Gestor recibe 403 al intentar editar o anular un pago", async () => {
    const adminApi = authedRequest(adminToken);
    const { quotationId } = await createQuotationFixture(adminToken, companyId);
    const created = await adminApi.post(`/quotation/${quotationId}/payments`, {
      amount: 30,
      method: "cash",
      paid_at: "2026-10-11",
    });
    const paymentId: number = created.body.data.id;

    const gestorApi = authedRequest(gestorToken);
    const updateRes = await gestorApi.put(`/payment/update/${paymentId}`, {
      amount: 999,
      method: "cash",
      paid_at: "2026-10-11",
    });
    expect(updateRes.status).toBe(403);

    const disableRes = await gestorApi.put(`/payment/disable/${paymentId}`);
    expect(disableRes.status).toBe(403);
  });

  it("Gestor recibe 403 en cualquier endpoint de /employee-debt (no tiene el módulo otorgado)", async () => {
    const gestorApi = authedRequest(gestorToken);

    const listRes = await gestorApi.get("/employee-debt/list");
    expect(listRes.status).toBe(403);

    const payRes = await gestorApi.put("/employee-debt/pay/1");
    expect(payRes.status).toBe(403);
  });

  it("Administrador sí puede editar/anular pagos y usar /employee-debt (control positivo)", async () => {
    const adminApi = authedRequest(adminToken);
    const { quotationId } = await createQuotationFixture(adminToken, companyId);
    const created = await adminApi.post(`/quotation/${quotationId}/payments`, {
      amount: 30,
      method: "cash",
      paid_at: "2026-10-11",
    });
    const paymentId: number = created.body.data.id;

    const updateRes = await adminApi.put(`/payment/update/${paymentId}`, {
      amount: 45,
      method: "cash",
      paid_at: "2026-10-11",
    });
    expect(updateRes.status).toBe(200);

    const listRes = await adminApi.get("/employee-debt/list");
    expect(listRes.status).toBe(200);
  });
});
