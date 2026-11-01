import { authedRequest, login, QA_COMPANY_ADMIN } from "./helpers/apiClient";
import { createQuotationFixture } from "./helpers/fixtures";

// Bug real encontrado en auditoría: nada impedía rechazar/cancelar una
// cotización que ya tenía pagos cobrados o compras reales hechas — el
// dinero/las compras quedaban "colgados" en una cotización cerrada sin
// ningún aviso.
describe("Rechazar/cancelar una cotización con dinero involucrado", () => {
  let token: string;
  let companyId: number;

  beforeAll(async () => {
    const auth = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = auth.token;
    const access = await authedRequest(token).get("/access/me");
    companyId = access.body.data.companyId;
  });

  it("una cotización pendiente no recibe pagos (el adelanto se cobra al aceptarla)", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId, { accepted: false });

    const payment = await api.post(`/quotation/${quotationId}/payments`, {
      amount: 10,
      method: "cash",
      paid_at: "2026-10-11",
    });
    expect(payment.status).toBe(409);
    expect(payment.body.code).toBe("QUOTATION_NOT_ACTIVE");
  });

  it("rechaza cancelar una cotización aceptada con un pago registrado", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId);

    const payment = await api.post(`/quotation/${quotationId}/payments`, {
      amount: 10,
      method: "cash",
      paid_at: "2026-10-11",
    });
    expect(payment.status).toBe(201);

    const res = await api.put(`/quotation/status/${quotationId}`, { status: "cancelled" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pagos registrados/i);
  });

  it("permite rechazar una cotización pending sin ningún pago", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId, { accepted: false });

    const res = await api.put(`/quotation/status/${quotationId}`, { status: "rejected" });
    expect(res.status).toBe(200);
  });
});
