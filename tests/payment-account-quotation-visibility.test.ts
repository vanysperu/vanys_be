import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { createCashClosingTestCompany, createQuotationFixture, type CashClosingTestCompany } from "./helpers/fixtures";
import request from "supertest";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

// El texto del PDF no se puede leer sin una herramienta aparte: pdftotext viene
// con Git para Windows. Donde no esté, estas pruebas se omiten. Se mira el error
// de arranque, no el código de salida: "pdftotext -v" termina con 99 aunque exista.
const hasPdfToText = spawnSync("pdftotext", ["-v"]).error === undefined;
const itWithPdfText = hasPdfToText ? it : it.skip;

// Por archivo: la versión de Git para Windows no lee el PDF desde stdin.
const pdfText = (pdf: Buffer): string => {
  const dir = mkdtempSync(join(tmpdir(), "quotation-pdf-"));
  const file = join(dir, "quotation.pdf");
  writeFileSync(file, pdf);
  const text = execFileSync("pdftotext", ["-layout", file, "-"]).toString("utf8");
  rmSync(dir, { recursive: true, force: true });
  return text;
};

/**
 * Cuentas internas y externas (pedido explícito del usuario): una cuenta interna
 * no sale en el PDF de la cotización, pero se sigue usando para registrar dinero.
 */
describe("Cuentas de pago: cuáles salen en la cotización", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let quotationId: number;
  let externalId: number;
  let internalId: number;

  const admin = () => authedRequest(ctx.admin.token);
  const createAccount = async (name: string, ref1: string, extra: object = {}) => {
    const res = await admin().post("/variable_general/create", { category: "payment_account", title: "Cuenta de pago", prefix_id: "bank", name, ref1, ...extra });
    expect(res.status).toBe(200);
    return res.body.data as { id: number; show_in_quotation: boolean };
  };
  const accountRow = async (id: number) => {
    const res = await admin().get("/variable_general/list?category=payment_account&ignorePagination=true&admin=true");
    return (res.body.data.data as { id: number; show_in_quotation: boolean }[]).find((row) => row.id === id);
  };
  const quotationPdf = async (): Promise<Buffer> => {
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
    return res.body as Buffer;
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    quotationId = (await createQuotationFixture(ctx.admin.token, ctx.companyId)).quotationId;
    externalId = (await createAccount("Cuenta Cliente", "191-1111111")).id;
    internalId = (await createAccount("Cuenta Reservada", "191-2222222", { show_in_quotation: false })).id;
  }, 60_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("una cuenta nueva sale por defecto y se puede crear como interna", async () => {
    expect((await accountRow(externalId))?.show_in_quotation).toBe(true);
    expect((await accountRow(internalId))?.show_in_quotation).toBe(false);
  });

  itWithPdfText("el PDF solo muestra las cuentas externas", async () => {
    const text = pdfText(await quotationPdf());
    expect(text).toContain("191-1111111");
    expect(text).not.toContain("191-2222222");
  });

  it("cambiar solo la marca no toca el resto de la cuenta", async () => {
    const before = await admin().get(`/variable_general/detail/${externalId}`);
    expect((await admin().put(`/variable_general/update/${externalId}`, { show_in_quotation: false })).status).toBe(200);
    const after = await admin().get(`/variable_general/detail/${externalId}`);
    expect(after.body.data).toMatchObject({ name: before.body.data.name, ref1: before.body.data.ref1, prefix_id: "bank", show_in_quotation: false });
    expect((await admin().put(`/variable_general/update/${externalId}`, { show_in_quotation: true })).status).toBe(200);
  });

  itWithPdfText("al mostrarla u ocultarla, el PDF cambia", async () => {
    expect((await admin().put(`/variable_general/update/${internalId}`, { show_in_quotation: true })).status).toBe(200);
    expect(pdfText(await quotationPdf())).toContain("191-2222222");
    expect((await admin().put(`/variable_general/update/${internalId}`, { show_in_quotation: false })).status).toBe(200);
    expect(pdfText(await quotationPdf())).not.toContain("191-2222222");
  });

  itWithPdfText("sin ninguna cuenta externa, el PDF sale igual", async () => {
    expect((await admin().put(`/variable_general/update/${externalId}`, { show_in_quotation: false })).status).toBe(200);
    const text = pdfText(await quotationPdf());
    expect(text).not.toContain("191-1111111");
    expect(text).not.toContain("191-2222222");
    expect((await admin().put(`/variable_general/update/${externalId}`, { show_in_quotation: true })).status).toBe(200);
  });

  it("una cuenta interna se sigue usando para registrar dinero", async () => {
    const expense = await admin().post("/cash-movement/create", {
      direction: "expense",
      category: "otro_egreso",
      amount: 15,
      occurred_at: TODAY,
      payment_account_id: internalId,
    });
    expect(expense.status).toBe(201);
    expect(expense.body.data.payment_account_id).toBe(internalId);
  });

  it("valida el dato y otra empresa no puede cambiarla", async () => {
    expect((await admin().put(`/variable_general/update/${internalId}`, { show_in_quotation: "quizas" })).status).toBe(400);
    const other = await createCashClosingTestCompany(superToken);
    const res = await authedRequest(other.admin.token).put(`/variable_general/update/${internalId}`, { show_in_quotation: true });
    expect(res.status).toBe(404);
    expect((await accountRow(internalId))?.show_in_quotation).toBe(false);
    await authedRequest(superToken).put(`/company/disable/${other.companyId}`);
  });
});
