import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

/**
 * Pedido del usuario (21-nov): el enlace de la cotización abre el PDF mismo
 * (el del botón "Ver PDF"). El PDF público aplica las mismas reglas que la
 * vista: enlace apagado o cotización incompleta → 404. Empresa desechable.
 */
describe("Enlace público: abre el PDF de la cotización", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let quotationId: number;
  let code: string;
  const admin = () => authedRequest(ctx.admin.token);
  const publicPdf = () => request(BASE_URL).get(`/api/public/q/${code}/pdf`);

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    const stamp = wordStamp().slice(0, 6);
    const client = await admin().post("/client/create", { company_id: ctx.companyId, name: `Cliente Enlace ${stamp}` });
    const product = await admin().post("/product/create", { company_id: ctx.companyId, name: `Polo Enlace ${stamp}`, price_unit: 15 });
    const quotation = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: ctx.storeId,
      client_id: client.body.data.id,
      items: [{ product_id: product.body.data.id, quantity: 4, pricing_mode: "unit" }],
    });
    quotationId = quotation.body.data.id;
    const link = await admin().get(`/quotation/${quotationId}/public-link`);
    expect(link.status).toBe(200);
    code = String(link.body.data.url).split("/c/")[1]!;
  }, 90_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("entrega el mismo PDF, en línea y con el nombre del sistema", async () => {
    const res = await publicPdf().buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toBe(`inline; filename="cotizacion-${String(quotationId).padStart(4, "0")}.pdf"`);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("con el enlace apagado responde 404", async () => {
    expect((await admin().put(`/quotation/${quotationId}/public-link`, { enabled: false })).status).toBe(200);
    const res = await publicPdf();
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PUBLIC_QUOTATION_UNAVAILABLE");
    expect((await admin().put(`/quotation/${quotationId}/public-link`, { enabled: true })).status).toBe(200);
    expect((await publicPdf()).status).toBe(200);
  });
});
