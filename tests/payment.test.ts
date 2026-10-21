import { authedRequest, login, QA_COMPANY_ADMIN } from "./helpers/apiClient";
import { createQuotationFixture } from "./helpers/fixtures";

describe("Módulo de pagos", () => {
  let token: string;
  let companyId: number;

  beforeAll(async () => {
    const auth = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = auth.token;
    const api = authedRequest(token);
    const access = await api.get("/access/me");
    companyId = access.body.data.companyId;
  });

  it("registra un pago, aparece en /payment/list y suma a total_paid", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId);

    const created = await api.post(`/quotation/${quotationId}/payments`, {
      amount: 50,
      method: "cash",
      paid_at: "2026-10-11",
    });
    expect(created.status).toBe(201);
    const paymentId: number = created.body.data.id;

    // Acotado a esta cotización: con muchos pagos de otras corridas, el pago
    // (fechado 11/10) podía quedar fuera de la primera página.
    const list = await api.get(`/payment/list?quotationId=${quotationId}`);
    expect(list.status).toBe(200);
    const found = list.body.data.data.find((row: { id: number }) => row.id === paymentId);
    expect(found).toBeDefined();
    expect(Number(found.amount)).toBe(50);
    expect(found.is_deleted).toBe(false);

    const quotation = await api.get(`/quotation/find/${quotationId}`);
    expect(Number(quotation.body.data.total_paid)).toBe(50);
  });

  it("exige número de operación para métodos que no son efectivo", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId);

    const res = await api.post(`/quotation/${quotationId}/payments`, {
      amount: 50,
      method: "yape",
      paid_at: "2026-10-11",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("edita un pago y recalcula total_paid con el nuevo monto", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId);

    const created = await api.post(`/quotation/${quotationId}/payments`, {
      amount: 50,
      method: "cash",
      paid_at: "2026-10-11",
    });
    const paymentId: number = created.body.data.id;

    const updated = await api.put(`/payment/update/${paymentId}`, {
      amount: 120,
      method: "cash",
      paid_at: "2026-10-11",
    });
    expect(updated.status).toBe(200);

    const quotation = await api.get(`/quotation/find/${quotationId}`);
    expect(Number(quotation.body.data.total_paid)).toBe(120);
  });

  it("anula un pago, lo excluye de total_paid, y lo restaura al volver a togglearlo", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId);

    const created = await api.post(`/quotation/${quotationId}/payments`, {
      amount: 60,
      method: "cash",
      paid_at: "2026-10-11",
    });
    const paymentId: number = created.body.data.id;

    const disabled = await api.put(`/payment/disable/${paymentId}`);
    expect(disabled.status).toBe(200);

    const quotationAfterDisable = await api.get(`/quotation/find/${quotationId}`);
    expect(Number(quotationAfterDisable.body.data.total_paid)).toBe(0);

    const list = await api.get("/payment/list");
    const found = list.body.data.data.find((row: { id: number }) => row.id === paymentId);
    expect(found).toBeUndefined(); // is_deleted=true no sale en el listado por defecto

    const listWithDisabled = await api.get(`/payment/list?includeDisabled=true&quotationId=${quotationId}`);
    const foundDisabled = listWithDisabled.body.data.data.find((row: { id: number }) => row.id === paymentId);
    expect(foundDisabled.is_deleted).toBe(true);

    const restored = await api.put(`/payment/disable/${paymentId}`);
    expect(restored.status).toBe(200);

    const quotationAfterRestore = await api.get(`/quotation/find/${quotationId}`);
    expect(Number(quotationAfterRestore.body.data.total_paid)).toBe(60);
  });
});
