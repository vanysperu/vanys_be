import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// PNG real de 1×1 (pasa la verificación de firma del cargador).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

interface MockupRow {
  id: number;
  quotation_item_id: number | null;
  file_name: string;
  mime_type: string;
  caption: string | null;
  uploaded_by: string | null;
}

/**
 * Pedido del usuario (21-nov): subir los mockups (diseños) a la cotización y
 * verlos ahí. Solo el equipo: el archivo sale solo con sesión y con el
 * alcance de la cotización. Dos empresas desechables (la segunda prueba que
 * otra empresa no los ve).
 */
describe("Cotización: mockups (diseños)", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let other: CashClosingTestCompany;
  let quotationId: number;
  let itemId: number;
  let otherItemId: number;
  const admin = () => authedRequest(ctx.admin.token);
  const upload = (token: string, id: number, fields: Record<string, string>, file = PNG, contentType = "image/png") => {
    const req = request(BASE_URL).post(`/api/quotation/${id}/mockups`).set("Authorization", `Bearer ${token}`);
    Object.entries(fields).forEach(([key, value]) => req.field(key, value));
    return req.attach("file", file, { filename: "mockup.png", contentType });
  };
  const list = async (token = ctx.admin.token) => authedRequest(token).get(`/quotation/${quotationId}/mockups?page=1&limit=20`);

  const newQuotation = async (company: CashClosingTestCompany): Promise<{ quotationId: number; itemId: number }> => {
    const api = authedRequest(company.admin.token);
    const stamp = wordStamp().slice(0, 6);
    const client = await api.post("/client/create", { company_id: company.companyId, name: `Cliente Mockup ${stamp}` });
    const product = await api.post("/product/create", { company_id: company.companyId, name: `Polo Mockup ${stamp}`, price_unit: 12 });
    const quotation = await api.post("/quotation/create", {
      company_id: company.companyId,
      business_unit_id: company.storeId,
      client_id: client.body.data.id,
      items: [{ product_id: product.body.data.id, quantity: 5, pricing_mode: "unit" }],
    });
    const detail = await api.get(`/quotation/find/${quotation.body.data.id}`);
    return { quotationId: quotation.body.data.id, itemId: detail.body.data.items[0].id };
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    other = await createCashClosingTestCompany(superToken);
    ({ quotationId, itemId } = await newQuotation(ctx));
    ({ itemId: otherItemId } = await newQuotation(other));
  }, 120_000);

  afterAll(async () => {
    for (const company of [ctx, other]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("el gestor de la tienda sube un diseño de un producto y se lista con quién lo subió", async () => {
    const res = await upload(ctx.gestor.token, quotationId, { quotation_item_id: String(itemId), caption: "Logo en el pecho" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ quotation_item_id: itemId, caption: "Logo en el pecho", mime_type: "image/png" });

    const rows = (await list()).body.data.data as MockupRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.uploaded_by).toContain("Cierre");
    const detail = await admin().get(`/quotation/find/${quotationId}`);
    expect((detail.body.data.events as { action: string }[]).some((event) => event.action === "mockup_added")).toBe(true);
  });

  it("el archivo sale solo con sesión, igual al subido", async () => {
    const rows = (await list()).body.data.data as MockupRow[];
    const file = await request(BASE_URL)
      .get(`/api/quotation/mockup/${rows[0]!.id}/file`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("image/png");
    expect(file.headers["cache-control"]).toContain("no-store");
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);
    expect((await request(BASE_URL).get(`/api/quotation/mockup/${rows[0]!.id}/file`)).status).toBe(401);
  });

  it("otra empresa no ve ni sube diseños de esta cotización", async () => {
    const rows = (await list()).body.data.data as MockupRow[];
    expect((await list(other.admin.token)).status).toBe(403);
    expect((await authedRequest(other.admin.token).get(`/quotation/mockup/${rows[0]!.id}/file`)).status).toBe(403);
    expect((await upload(other.admin.token, quotationId, {})).status).toBe(403);
  });

  it("rechaza un archivo que no es imagen/PDF y un producto de otra cotización", async () => {
    const fake = await upload(ctx.admin.token, quotationId, {}, Buffer.from("no soy una imagen"), "image/png");
    expect(fake.status).toBe(400);
    const wrongItem = await upload(ctx.admin.token, quotationId, { quotation_item_id: String(otherItemId) });
    expect(wrongItem.status).toBe(400);
    expect(wrongItem.body.code).toBe("MOCKUP_ITEM_INVALID");
  });

  it("quitar un diseño lo saca de la lista y su archivo deja de estar disponible", async () => {
    const rows = (await list()).body.data.data as MockupRow[];
    const removed = await admin().patch(`/quotation/mockup/${rows[0]!.id}/disable`);
    expect(removed.status).toBe(200);
    expect(((await list()).body.data.data as MockupRow[]).some((row) => row.id === rows[0]!.id)).toBe(false);
    expect((await admin().get(`/quotation/mockup/${rows[0]!.id}/file`)).status).toBe(404);
  });
});
