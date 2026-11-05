import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createPurchaseOrderFixture, createQuotationFixture, createUnscopedCompanyAdmin } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

/**
 * Facturas (pedido explícito del usuario): al comprar se marca si llevaba
 * factura y al cerrar una cotización si se emitió; el archivo se sube en el
 * momento o después ("faltan subir"). Dónde se guarda lo decide el Super
 * Administrador por empresa (sistema, Google Drive o ambos). Empresa y admin
 * desechables: nunca inicia sesión con las cuentas QA que el equipo usa a mano.
 */
describe("Facturas", () => {
  let superToken: string;
  let companyId: number;
  let companyName: string;
  let otherCompanyId: number;
  let adminToken: string;
  let adminId: number;
  let otherAdminToken: string;
  let quotationId: number;
  let purchaseInvoiceId: number;

  const superApi = () => authedRequest(superToken);
  const adminApi = () => authedRequest(adminToken);
  const setStorage = (system: boolean, drive: boolean) =>
    superApi().put(`/company/update/${companyId}`, { invoice_storage_system: system, invoice_storage_drive: drive });
  const upload = (invoiceId: number, data: Buffer, filename: string, contentType: string, token = adminToken) =>
    request(BASE_URL)
      .post(`/api/invoice/${invoiceId}/file`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", data, { filename, contentType });
  const listInvoices = async (query: string) => (await adminApi().get(`/invoice/list?${query}`)).body.data;

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const createCompany = async (suffix: string) => {
      const name = `Facturas ${suffix} ${wordStamp()}`;
      const res = await superApi().post("/company/create", { ruc: `20${String(Date.now()).slice(-8)}${suffix}`, business_name: name });
      return { id: res.body.data.id as number, name };
    };
    const company = await createCompany("1");
    companyId = company.id;
    companyName = company.name;
    otherCompanyId = (await createCompany("2")).id;
    const admin = await createUnscopedCompanyAdmin(superToken, companyId);
    adminToken = admin.token;
    adminId = admin.userId;
    otherAdminToken = (await createUnscopedCompanyAdmin(superToken, otherCompanyId)).token;

    const fixture = await createQuotationFixture(adminToken, companyId);
    quotationId = fixture.quotationId;
    const { itemId } = await createPurchaseOrderFixture(adminToken, companyId, adminId, quotationId, fixture.quotationItemId, 10);
    const purchase = await adminApi().post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 10,
      amount: 50,
      funding_source: "company",
      has_invoice: true,
    });
    expect(purchase.status).toBe(201);
    purchaseInvoiceId = purchase.body.data.invoice_id;
  });

  afterAll(async () => {
    // Los avisos de copia fallida de esta empresa no deben quedar como toasts.
    await queryRows("UPDATE reminder SET is_deleted = true WHERE message LIKE ?", [`%${companyName}%`]);
    for (const id of [companyId, otherCompanyId]) if (id) await superApi().put(`/company/disable/${id}`);
  });

  it("una compra con factura la deja en 'Faltan subir' hasta que se sube el archivo", async () => {
    expect(purchaseInvoiceId).toBeGreaterThan(0);
    const pending = await listInvoices("type=purchase&file=pending");
    expect(pending.data.map((invoice: { id: number }) => invoice.id)).toContain(purchaseInvoiceId);
    expect(pending.summary.pending_count).toBeGreaterThanOrEqual(1);
    expect(pending.data[0]).toMatchObject({ has_file: false, quotation_id: quotationId, type: "purchase" });

    const res = await upload(purchaseInvoiceId, PNG_1X1, "factura.png", "image/png");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ stored_in_system: true, drive_status: "none" });

    const uploaded = await listInvoices("type=purchase&file=uploaded");
    expect(uploaded.data.find((invoice: { id: number }) => invoice.id === purchaseInvoiceId)).toMatchObject({
      has_file: true,
      mime_type: "image/png",
      stored_in_system: true,
    });
  });

  it("el archivo solo se ve con sesión y de la propia empresa", async () => {
    const file = await request(BASE_URL).get(`/api/invoice/${purchaseInvoiceId}/file`).set("Authorization", `Bearer ${adminToken}`);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("image/png");
    expect(file.headers["cache-control"]).toContain("no-store");

    expect((await request(BASE_URL).get(`/api/invoice/${purchaseInvoiceId}/file`)).status).toBe(401);
    const foreign = await request(BASE_URL).get(`/api/invoice/${purchaseInvoiceId}/file`).set("Authorization", `Bearer ${otherAdminToken}`);
    expect(foreign.status).toBe(404);
    expect((await upload(purchaseInvoiceId, PNG_1X1, "f.png", "image/png", otherAdminToken)).status).toBe(404);
  });

  it("acepta PDF y rechaza archivos que no son foto ni PDF", async () => {
    expect((await upload(purchaseInvoiceId, PDF, "factura.pdf", "application/pdf")).status).toBe(200);
    expect((await upload(purchaseInvoiceId, Buffer.from("hola"), "nota.txt", "text/plain")).status).toBe(400);
    // Dice ser PDF pero no lo es.
    expect((await upload(purchaseInvoiceId, Buffer.from("no soy pdf"), "falso.pdf", "application/pdf")).status).toBe(400);
  });

  it("respeta dónde guarda facturas la empresa", async () => {
    await setStorage(false, false);
    const disabled = await upload(purchaseInvoiceId, PNG_1X1, "f.png", "image/png");
    expect(disabled.status).toBe(409);
    expect(disabled.body.code).toBe("INVOICE_STORAGE_DISABLED");

    // Solo Drive y sin Drive conectado: no se guarda en ningún lado.
    await setStorage(false, true);
    const driveOnly = await upload(purchaseInvoiceId, PNG_1X1, "f.png", "image/png");
    expect(driveOnly.status).toBe(409);
    expect(driveOnly.body.code).toBe("DRIVE_NOT_CONNECTED");

    // Sistema + Drive sin conectar: se guarda en el sistema y la copia queda
    // fallida (con aviso), sin perder la factura.
    await setStorage(true, true);
    const both = await upload(purchaseInvoiceId, PNG_1X1, "f.png", "image/png");
    expect(both.status).toBe(200);
    expect(both.body.data).toMatchObject({ stored_in_system: true, drive_status: "pending" });
    const retry = await adminApi().put(`/invoice/${purchaseInvoiceId}/drive-retry`);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({ copied: false, drive_status: "failed" });
    expect(retry.body.data.drive_error).toMatch(/Drive/);
    const failed = await listInvoices("drive=failed");
    expect(failed.summary.drive_failed_count).toBeGreaterThanOrEqual(1);
    const reminders = await queryRows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM reminder WHERE title = 'Factura no copiada a Google Drive' AND message LIKE ?",
      [`%${companyName}%`]
    );
    expect(Number(reminders[0]?.total)).toBeGreaterThan(0);

    await setStorage(true, false);
  });

  it("al cerrar la cotización se registra la factura emitida", async () => {
    const steps = ["design_pending", "in_process", "ready", "delivered"];
    for (const status of steps) {
      const moved = await adminApi().put(`/quotation/status/${quotationId}`, { status });
      expect(moved.status).toBe(200);
    }
    const closed = await adminApi().put(`/quotation/status/${quotationId}`, { status: "finished", invoice_issued: true });
    expect(closed.status).toBe(200);
    const issuedId = closed.body.data.invoice_id as number;
    expect(issuedId).toBeGreaterThan(0);

    const issued = await listInvoices("type=issued&file=pending");
    expect(issued.data.find((invoice: { id: number }) => invoice.id === issuedId)).toMatchObject({ type: "issued", has_file: false });
  });

  it("conectar Google Drive es solo del Super Administrador", async () => {
    const url = await superApi().get(`/google-drive/connect-url/${companyId}`);
    expect(url.status).toBe(200);
    const parsed = new URL(url.body.data.url);
    expect(parsed.hostname).toBe("accounts.google.com");
    expect(parsed.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("state")).toBeTruthy();

    expect((await adminApi().get(`/google-drive/connect-url/${companyId}`)).status).toBe(403);
    const status = await superApi().get(`/google-drive/status/${companyId}`);
    expect(status.body.data).toMatchObject({ configured: true, connected: false, storage_system: true, storage_drive: false });

    // Una vuelta de Google con un `state` inventado no conecta nada.
    const forged = await request(BASE_URL).get("/api/google-drive/callback?code=abc&state=inventado.firma");
    expect(forged.status).toBe(302);
    expect(forged.headers.location).toContain("drive=error");
  });
});
