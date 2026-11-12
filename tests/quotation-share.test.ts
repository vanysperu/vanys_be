import request from "supertest";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createQuotationFixture, createUnscopedCompanyAdmin } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// Lo único que puede ver el cliente: exactamente estos campos (los del PDF).
const PUBLIC_VIEW_KEYS = [
  "billingDocumentNumber",
  "billingName",
  "client",
  "code",
  "company",
  "createdAt",
  "igv",
  "includesDelivery",
  "includesDesign",
  "includesIgv",
  "items",
  "notes",
  "paymentAccounts",
  "productionDays",
  "status",
  "statusLabel",
  "store",
  "subtotal",
  "total",
  "validUntil",
];
const PUBLIC_ITEM_KEYS = ["color", "id", "igv", "productCode", "productName", "quantity", "sku", "subtotal", "techniqueName", "total", "unitPrice"];

const codeOf = (url: string) => String(url).split("/c/")[1] ?? "";
const publicView = (code: string) => request(BASE_URL).get(`/api/public/q/${code}`);
const publicPdf = (code: string) => request(BASE_URL).get(`/api/public/q/${code}/pdf`);

/**
 * Sprint 2, ítem 7 (pedido explícito del usuario): la cotización se comparte
 * con un enlace que se ve sin iniciar sesión, con un interruptor encendido por
 * defecto que al apagarse deja de mostrarla, y se manda por WhatsApp o correo.
 * Empresas y administradores desechables (nunca las cuentas QA del equipo).
 */
describe("Compartir la cotización", () => {
  let superToken: string;
  let admin: { token: string; userId: number; email: string };
  let otherAdmin: { token: string; userId: number; email: string };
  let quotationId: number;
  const stamp = String(Date.now());

  const adminApi = () => authedRequest(admin.token);

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const createCompany = async (suffix: string) => {
      const res = await authedRequest(superToken).post("/company/create", {
        ruc: `20${stamp.slice(-8)}${suffix}`,
        business_name: `Comparte ${suffix} ${stamp}`,
      });
      expect(res.status).toBe(201);
      return res.body.data.id as number;
    };
    const companyId = await createCompany("1");
    const otherCompanyId = await createCompany("2");
    admin = await createUnscopedCompanyAdmin(superToken, companyId);
    otherAdmin = await createUnscopedCompanyAdmin(superToken, otherCompanyId);
    quotationId = (await createQuotationFixture(admin.token, companyId)).quotationId;
  });

  it("el enlace nace encendido, con un código aleatorio y no con el número", async () => {
    const res = await adminApi().get(`/quotation/${quotationId}/public-link`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ enabled: true, viewCount: 0, firstViewedAt: null });
    const code = codeOf(res.body.data.url);
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(code).not.toContain(String(quotationId));

    // Pedirlo de nuevo devuelve el mismo enlace.
    const again = await adminApi().get(`/quotation/${quotationId}/public-link`);
    expect(again.body.data.url).toBe(res.body.data.url);
  });

  it("el cliente la ve sin sesión, solo con los datos del PDF, y queda registrada la vista", async () => {
    const code = codeOf((await adminApi().get(`/quotation/${quotationId}/public-link`)).body.data.url);
    const res = await publicView(code);
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toContain("noindex");
    expect(Object.keys(res.body.data).sort()).toEqual(PUBLIC_VIEW_KEYS);
    expect(Object.keys(res.body.data.items[0]).sort()).toEqual(PUBLIC_ITEM_KEYS);
    expect(res.body.data.code).toBe(`COT-${String(quotationId).padStart(4, "0")}`);
    // Nada interno: ni pagos, ni gastos, ni ganancia.
    const raw = JSON.stringify(res.body.data);
    for (const internal of ["total_paid", "expenses", "payments", "profit", "created_by", "company_id"]) {
      expect(raw).not.toContain(internal);
    }

    const pdf = await publicPdf(code);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    const link = await adminApi().get(`/quotation/${quotationId}/public-link`);
    expect(link.body.data.viewCount).toBeGreaterThanOrEqual(1);
    expect(link.body.data.firstViewedAt).not.toBeNull();
    const events = await queryRows<{ action: string }>(
      "SELECT action FROM quotation_event WHERE quotation_id = ? AND action = 'viewed_by_client'",
      [quotationId]
    );
    expect(events).toHaveLength(1);
  });

  it("apagado: el mismo enlace muestra 'no disponible' y el PDF da 404; encendido vuelve", async () => {
    const code = codeOf((await adminApi().get(`/quotation/${quotationId}/public-link`)).body.data.url);

    const off = await adminApi().put(`/quotation/${quotationId}/public-link`, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.enabled).toBe(false);
    const hidden = await publicView(code);
    expect(hidden.status).toBe(404);
    expect(hidden.body.code).toBe("PUBLIC_QUOTATION_UNAVAILABLE");
    expect((await publicPdf(code)).status).toBe(404);

    const on = await adminApi().put(`/quotation/${quotationId}/public-link`, { enabled: true });
    expect(on.body.data.enabled).toBe(true);
    expect((await publicView(code)).status).toBe(200);
  });

  it("'Generar enlace nuevo' anula el anterior", async () => {
    const before = codeOf((await adminApi().get(`/quotation/${quotationId}/public-link`)).body.data.url);
    const res = await adminApi().post(`/quotation/${quotationId}/public-link/regenerate`);
    expect(res.status).toBe(200);
    const after = codeOf(res.body.data.url);
    expect(after).not.toBe(before);
    expect(res.body.data.viewCount).toBe(0);
    expect((await publicView(before)).status).toBe(404);
    expect((await publicView(after)).status).toBe(200);
  });

  it("un código inválido no da pistas", async () => {
    const unknown = await publicView("AAAAAAAAAAAAAAAAAAAAAA");
    expect(unknown.status).toBe(404);
    const malformed = await publicView("123");
    expect([400, 404]).toContain(malformed.status);
  });

  it("por correo: queda en la cola con enlace, PDF y Responder a la empresa; y en el historial", async () => {
    const res = await adminApi().post(`/quotation/${quotationId}/share/email`, {
      to: `cliente.${stamp}@acme.test`,
      cc: "",
      subject: "Tu cotización",
      message: "Hola, te enviamos la cotización.\n\nSaludos.",
      attachPdf: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ includesLink: true });

    const [email] = await queryRows<{ template: string; category: string; to_email: string; subject: string }>(
      "SELECT template, category, to_email, subject FROM email_outbox WHERE related_type = 'quotation' AND related_id = ? ORDER BY id DESC LIMIT 1",
      [quotationId]
    );
    expect(email).toMatchObject({ template: "quotation", category: "quotation", to_email: `cliente.${stamp}@acme.test`, subject: "Tu cotización" });

    const [event] = await queryRows<{ description: string }>(
      "SELECT description FROM quotation_event WHERE quotation_id = ? AND action = 'shared_email' ORDER BY id DESC LIMIT 1",
      [quotationId]
    );
    expect(event?.description).toContain(`cliente.${stamp}@acme.test`);
    expect(event?.description).toContain("con PDF");
  });

  it("por correo: valida el destinatario", async () => {
    const res = await adminApi().post(`/quotation/${quotationId}/share/email`, {
      to: "no-es-un-correo",
      subject: "Tu cotización",
      message: "Hola",
      attachPdf: false,
    });
    expect(res.status).toBe(400);
  });

  it("por WhatsApp: queda en el historial", async () => {
    const res = await adminApi().post(`/quotation/${quotationId}/share/whatsapp`, { phone: "987654321" });
    expect(res.status).toBe(200);
    const [event] = await queryRows<{ description: string }>(
      "SELECT description FROM quotation_event WHERE quotation_id = ? AND action = 'shared_whatsapp' ORDER BY id DESC LIMIT 1",
      [quotationId]
    );
    expect(event?.description).toContain("987654321");
  });

  it("otra empresa no puede ver ni tocar el enlace", async () => {
    const other = authedRequest(otherAdmin.token);
    expect((await other.get(`/quotation/${quotationId}/public-link`)).status).toBe(403);
    expect((await other.put(`/quotation/${quotationId}/public-link`, { enabled: false })).status).toBe(403);
    expect((await other.post(`/quotation/${quotationId}/public-link/regenerate`)).status).toBe(403);
  });
});
