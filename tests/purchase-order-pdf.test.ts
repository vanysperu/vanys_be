import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, createPurchaseOrderFixture, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

const hasPdfToText = spawnSync("pdftotext", ["-v"]).error === undefined;
const pdfText = (pdf: Buffer): string => {
  if (!hasPdfToText) return "";
  const dir = mkdtempSync(join(tmpdir(), "po-pdf-"));
  const file = join(dir, "po.pdf");
  writeFileSync(file, pdf);
  const text = execFileSync("pdftotext", ["-layout", file, "-"]).toString("utf8");
  rmSync(dir, { recursive: true, force: true });
  return text;
};

/**
 * Pedido del usuario (21-nov): el PDF de una orden de compra con qué comprar,
 * la foto y los datos de cada producto. Las fotos se guardan en WEBP y la
 * librería de PDF solo dibuja PNG/JPG: el backend las convierte con sharp.
 * Empresa desechable con fotos de producto habilitadas.
 */
describe("Orden de compra en PDF (con foto)", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let other: CashClosingTestCompany;
  let purchaseOrderId: number;
  let productName: string;
  const admin = () => authedRequest(ctx.admin.token);
  const getPdf = (token: string) =>
    request(BASE_URL)
      .get(`/api/purchase-order/${purchaseOrderId}/pdf`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    other = await createCashClosingTestCompany(superToken);
    expect((await authedRequest(superToken).put(`/company/update/${ctx.companyId}`, { product_images_enabled: true })).status).toBe(200);

    // Foto WEBP real (como las que sube el navegador).
    const webp = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#C0392B" } }).webp().toBuffer();
    const upload = await request(BASE_URL)
      .post("/api/product/image")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .field("company_id", String(ctx.companyId))
      .attach("file", webp, { filename: "polo.webp", contentType: "image/webp" });
    expect(upload.status).toBe(201);

    const stamp = wordStamp().slice(0, 6);
    productName = `Polo Compra ${stamp}`;
    const product = await admin().post("/product/create", {
      company_id: ctx.companyId,
      name: productName,
      sku: `PC${stamp}`.toUpperCase(),
      description: "Algodón peinado 30/1, cuello redondo",
      price_unit: 18,
      image_path: upload.body.data.path,
    });
    expect(product.status).toBeLessThan(300);
    const client = await admin().post("/client/create", { company_id: ctx.companyId, name: `Cliente Compra ${stamp}` });
    const quotation = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: ctx.storeId,
      client_id: client.body.data.id,
      items: [{ product_id: product.body.data.id, quantity: 50, pricing_mode: "unit" }],
    });
    const quotationId = quotation.body.data.id as number;
    expect((await admin().put(`/quotation/status/${quotationId}`, { status: "accepted" })).status).toBe(200);
    const detail = await admin().get(`/quotation/find/${quotationId}`);
    ({ purchaseOrderId } = await createPurchaseOrderFixture(ctx.admin.token, ctx.companyId, ctx.admin.userId, quotationId, detail.body.data.items[0].id, 50));
  }, 120_000);

  afterAll(async () => {
    for (const company of [ctx, other]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("entrega el PDF con la foto (convertida a JPG) y los datos del producto", async () => {
    const res = await getPdf(ctx.admin.token);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain(`orden-de-compra-${String(purchaseOrderId).padStart(4, "0")}.pdf`);
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    // La foto quedó dibujada como imagen JPG (DCTDecode) dentro del PDF.
    expect(pdf.includes(Buffer.from("/DCTDecode"))).toBe(true);
    if (!hasPdfToText) return;
    const text = pdfText(pdf);
    expect(text).toContain(`OC-${String(purchaseOrderId).padStart(4, "0")}`);
    expect(text).toContain(productName);
    // Sin tildes en lo que se busca: pdftotext de Git para Windows no saca UTF-8.
    expect(text).toContain("peinado 30/1, cuello redondo");
    expect(text).toContain("50");
  });

  it("sin fotos habilitadas, el PDF sale igual pero sin la foto", async () => {
    expect((await authedRequest(superToken).put(`/company/update/${ctx.companyId}`, { product_images_enabled: false })).status).toBe(200);
    const res = await getPdf(ctx.admin.token);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).includes(Buffer.from("/DCTDecode"))).toBe(false);
    expect((await authedRequest(superToken).put(`/company/update/${ctx.companyId}`, { product_images_enabled: true })).status).toBe(200);
  });

  it("otra empresa no puede ver el PDF (403)", async () => {
    expect((await getPdf(other.admin.token)).status).toBe(403);
  });
});
