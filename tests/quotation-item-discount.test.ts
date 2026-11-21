import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// pdftotext viene con Git para Windows; donde no esté, la prueba del PDF se omite.
const hasPdfToText = spawnSync("pdftotext", ["-v"]).error === undefined;
const itWithPdfText = hasPdfToText ? it : it.skip;
const pdfText = (pdf: Buffer): string => {
  const dir = mkdtempSync(join(tmpdir(), "quotation-discount-"));
  const file = join(dir, "quotation.pdf");
  writeFileSync(file, pdf);
  const text = execFileSync("pdftotext", ["-layout", file, "-"]).toString("utf8");
  rmSync(dir, { recursive: true, force: true });
  return text;
};

interface DetailItem {
  id: number;
  product_id: number;
  technique_id: number | null;
  pricing_mode: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  discount_type: string | null;
  discount_value: string | null;
  list_unit_price: string | null;
}

/**
 * Pedido del usuario (21-nov): dos descuentos opcionales por producto en la
 * cotización: por % ("20%") y directo ("que quede en S/ X" por unidad). El
 * precio unitario guardado es el final; el de lista queda aparte. Al editar,
 * el descuento se recalcula sobre el precio pactado (no sobre el catálogo
 * actual). Empresa desechable.
 */
describe("Cotización: descuentos por producto", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let clientId: number;
  let poloId: number;
  let gorraId: number;
  let tazaId: number;
  let quotationId: number;
  const admin = () => authedRequest(ctx.admin.token);
  const detail = async () =>
    (await admin().get(`/quotation/find/${quotationId}`)).body.data as { subtotal: string; total: string; items: DetailItem[] };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    const stamp = wordStamp().slice(0, 6);
    clientId = (await admin().post("/client/create", { company_id: ctx.companyId, name: `Cliente Desc ${stamp}` })).body.data.id;
    const product = async (name: string, price: number) =>
      (await admin().post("/product/create", { company_id: ctx.companyId, name: `${name} ${stamp}`, price_unit: price })).body.data.id as number;
    poloId = await product("Polo Desc", 25);
    gorraId = await product("Gorra Desc", 25);
    tazaId = await product("Taza Desc", 10);
  }, 90_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("crea con 20% y con precio final; el total ya trae el descuento", async () => {
    const created = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: ctx.storeId,
      client_id: clientId,
      includes_igv: false,
      items: [
        { product_id: poloId, quantity: 10, pricing_mode: "unit", discount_type: "percent", discount_value: 20 },
        { product_id: gorraId, quantity: 4, pricing_mode: "unit", discount_type: "final_price", discount_value: 18 },
        { product_id: tazaId, quantity: 3, pricing_mode: "unit" },
      ],
    });
    expect(created.status).toBe(201);
    quotationId = created.body.data.id;

    const { items, subtotal, total } = await detail();
    const [polo, gorra, taza] = items;
    expect(Number(polo!.unit_price)).toBe(20);
    expect(Number(polo!.list_unit_price)).toBe(25);
    expect(polo!.discount_type).toBe("percent");
    expect(Number(polo!.subtotal)).toBe(200);
    expect(Number(gorra!.unit_price)).toBe(18);
    expect(Number(gorra!.list_unit_price)).toBe(25);
    expect(Number(gorra!.subtotal)).toBe(72);
    expect(taza!.discount_type).toBeNull();
    expect(taza!.list_unit_price).toBeNull();
    expect(Number(subtotal)).toBe(302);
    expect(Number(total)).toBe(302);
  });

  it("rechaza un precio final mayor o igual al de lista y un % de 100", async () => {
    const base = { company_id: ctx.companyId, business_unit_id: ctx.storeId, client_id: clientId };
    const higher = await admin().post("/quotation/create", {
      ...base,
      items: [{ product_id: poloId, quantity: 1, pricing_mode: "unit", discount_type: "final_price", discount_value: 25 }],
    });
    expect(higher.status).toBe(400);
    expect(higher.body.code).toBe("INVALID_DISCOUNT");
    const full = await admin().post("/quotation/create", {
      ...base,
      items: [{ product_id: poloId, quantity: 1, pricing_mode: "unit", discount_type: "percent", discount_value: 100 }],
    });
    expect(full.status).toBe(400);
    const missing = await admin().post("/quotation/create", {
      ...base,
      items: [{ product_id: poloId, quantity: 1, pricing_mode: "unit", discount_type: "percent" }],
    });
    expect(missing.status).toBe(400);
  });

  itWithPdfText("el PDF muestra precio de lista, descuento y el ahorro total", async () => {
    const res = await request(BASE_URL)
      .get(`/api/quotation/${quotationId}/pdf`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const text = pdfText(res.body as Buffer);
    expect(text).toContain("P. lista");
    expect(text).toContain("Desc.");
    // pdftotext escribe el signo "−" como "-": se aceptan los dos.
    expect(text).toMatch(/[-−]20%/);
    expect(text).toMatch(/[-−]S\/ 7\.00/);
    // (25−20)×10 + (25−18)×4 = 78, en el cuadro de totales.
    expect(text).toContain("Descuento");
    expect(text).toMatch(/[-−]S\/ 78\.00/);
  });

  it("al editar: cambia el % sobre el precio pactado y se puede quitar", async () => {
    // El catálogo sube después de cotizar: no debe afectar a lo ya pactado.
    expect((await admin().put(`/product/update/${poloId}`, { price_unit: 30 })).status).toBe(200);
    const { items } = await detail();
    const asInput = (item: DetailItem) => ({
      id: item.id,
      product_id: item.product_id,
      technique_id: item.technique_id,
      pricing_mode: item.pricing_mode,
      quantity: item.quantity,
    });
    const saved = await admin().put(`/quotation/${quotationId}/items`, {
      items: [
        { ...asInput(items[0]!), discount_type: "percent", discount_value: 10 },
        { ...asInput(items[1]!), discount_type: null, discount_value: null },
        asInput(items[2]!),
      ],
    });
    expect(saved.status).toBe(200);
    const after = await detail();
    const [polo, gorra] = after.items;
    // 25 pactado (no 30 del catálogo) − 10% = 22.50
    expect(Number(polo!.unit_price)).toBe(22.5);
    expect(Number(polo!.list_unit_price)).toBe(25);
    expect(Number(gorra!.unit_price)).toBe(25);
    expect(gorra!.discount_type).toBeNull();
    expect(gorra!.list_unit_price).toBeNull();
    expect(Number(after.subtotal)).toBe(22.5 * 10 + 25 * 4 + 10 * 3);
  });
});
