import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

const hasPdfToText = spawnSync("pdftotext", ["-v"]).error === undefined;
const itWithPdfText = hasPdfToText ? it : it.skip;
const pdfText = (pdf: Buffer): string => {
  const dir = mkdtempSync(join(tmpdir(), "cci-pdf-"));
  const file = join(dir, "q.pdf");
  writeFileSync(file, pdf);
  const text = execFileSync("pdftotext", ["-layout", file, "-"]).toString("utf8");
  rmSync(dir, { recursive: true, force: true });
  return text;
};

interface Account {
  id: number;
  prefix_id: string;
  ref1: string;
  ref3: string | null;
}

/**
 * Pedido del usuario (21-nov): en Perú cada cuenta bancaria tiene dos números,
 * el del banco y el CCI (20 dígitos). Se cargan los dos y salen en la
 * cotización. Además, una cuenta de pago siempre es de una empresa (una
 * global les salía a todas: la cuenta "Pruebas" de producción). Empresa desechable.
 */
describe("Cuentas de pago: número y CCI", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let accountId: number;
  const admin = () => authedRequest(ctx.admin.token);
  const accountRow = async (id: number) => {
    const res = await admin().get("/variable_general/list?category=payment_account&ignorePagination=true&admin=true");
    return (res.body.data.data as Account[]).find((row) => row.id === id);
  };
  const createAccount = (body: Record<string, unknown>) =>
    admin().post("/variable_general/create", { category: "payment_account", title: "Cuenta de pago", company_id: ctx.companyId, ...body });

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
  }, 90_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("una cuenta bancaria guarda su número y su CCI (sin guiones)", async () => {
    const created = await createAccount({ prefix_id: "bank", name: `BCP CCI ${wordStamp().slice(0, 5)}`, ref1: "191-1234567-0-12", ref3: "002-191-001234567012-55" });
    expect(created.status).toBe(200);
    accountId = created.body.data.id;
    expect(await accountRow(accountId)).toMatchObject({ ref1: "191-1234567-0-12", ref3: "00219100123456701255" });
  });

  it("rechaza un CCI que no tiene 20 dígitos y un CCI en Yape", async () => {
    const short = await createAccount({ prefix_id: "bank", name: "BBVA corto", ref1: "0011-0123", ref3: "1234567890123456789" });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe("INVALID_PAYMENT_ACCOUNT_CCI");
    const wallet = await createAccount({ prefix_id: "yape", name: "Yape CCI", ref1: "987654321", ref3: "00219100123456701255" });
    expect(wallet.status).toBe(400);
    expect(wallet.body.code).toBe("INVALID_PAYMENT_ACCOUNT_CCI");
  });

  itWithPdfText("la cotización muestra el número de cuenta y el CCI", async () => {
    const stamp = wordStamp().slice(0, 6);
    const client = await admin().post("/client/create", { company_id: ctx.companyId, name: `Cliente CCI ${stamp}` });
    const product = await admin().post("/product/create", { company_id: ctx.companyId, name: `Polo CCI ${stamp}`, price_unit: 10 });
    const quotation = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: ctx.storeId,
      client_id: client.body.data.id,
      items: [{ product_id: product.body.data.id, quantity: 1, pricing_mode: "unit" }],
    });
    const res = await request(BASE_URL)
      .get(`/api/quotation/${quotation.body.data.id}/pdf`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const text = pdfText(res.body as Buffer);
    expect(text).toContain("Cta.: 191-1234567-0-12");
    expect(text).toContain("CCI: 00219100123456701255");
  });

  it("al editar, el CCI se cambia o se quita", async () => {
    expect((await admin().put(`/variable_general/update/${accountId}`, { ref3: "00211100123456701299" })).status).toBe(200);
    expect((await accountRow(accountId))?.ref3).toBe("00211100123456701299");
    expect((await admin().put(`/variable_general/update/${accountId}`, { ref3: null })).status).toBe(200);
    expect((await accountRow(accountId))?.ref3).toBeNull();
  });

  it("una cuenta de pago sin empresa (global) ya no se puede crear", async () => {
    const global = await authedRequest(superToken).post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta de pago",
      prefix_id: "yape",
      name: "Global de prueba",
      ref1: "987654321",
    });
    expect(global.status).toBe(400);
    expect(global.body.code).toBe("PAYMENT_ACCOUNT_COMPANY_REQUIRED");
  });
});
