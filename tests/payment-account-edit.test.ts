import request from "supertest";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

interface AccountRow {
  id: number;
  prefix_id: string;
  name: string;
  ref1: string | null;
  ref2: string | null;
}

/**
 * Editar una cuenta de pago desde "Documentos de la empresa" (pedido explícito
 * del usuario): nombre, tipo, número y QR, incluido quitarlo. Empresas
 * desechables: nunca usa las cuentas QA del equipo.
 */
describe("Cuentas de pago: editar", () => {
  let ctx: CashClosingTestCompany;
  let otherCtx: CashClosingTestCompany;

  const admin = () => authedRequest(ctx.admin.token);
  const update = (body: object, token = ctx.admin.token) => authedRequest(token).put(`/variable_general/update/${ctx.bankAccountId}`, body);
  const account = async () => {
    const res = await admin().get("/variable_general/list?category=payment_account&ignorePagination=true&admin=true");
    return (res.body.data.data as AccountRow[]).find((row) => row.id === ctx.bankAccountId) as AccountRow;
  };
  const uploadQr = async () => {
    const res = await request(BASE_URL)
      .post("/api/uploads/company-asset")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .attach("file", PNG_1X1, { filename: "qr.png", contentType: "image/png" });
    expect(res.status).toBeLessThan(300);
    return res.body.data.path as string;
  };
  const assetExists = async (publicPath: string) => {
    const fileName = publicPath.split("/").pop() ?? "";
    const rows = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM company_asset WHERE file_name = ?", [fileName]);
    return Number(rows[0]?.total) > 0;
  };

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    otherCtx = await createCashClosingTestCompany(superToken);
  }, 60_000);

  afterAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    for (const company of [ctx, otherCtx]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("cambia nombre, tipo y número", async () => {
    const res = await update({ prefix_id: "yape", name: "Yape caja", ref1: "999111222" });
    expect(res.status).toBe(200);
    expect(await account()).toMatchObject({ prefix_id: "yape", name: "Yape caja", ref1: "999111222" });
  });

  it("cambiar el QR borra la imagen anterior y quitarlo deja la cuenta sin QR", async () => {
    const firstQr = await uploadQr();
    expect((await update({ ref2: firstQr })).status).toBe(200);
    expect((await account()).ref2).toBe(firstQr);

    const secondQr = await uploadQr();
    expect((await update({ ref2: secondQr })).status).toBe(200);
    expect((await account()).ref2).toBe(secondQr);
    expect(await assetExists(firstQr)).toBe(false);

    expect((await update({ ref2: null })).status).toBe(200);
    expect((await account()).ref2).toBeNull();
    expect(await assetExists(secondQr)).toBe(false);
  });

  it("guardar sin tocar el QR lo conserva", async () => {
    const qr = await uploadQr();
    expect((await update({ ref2: qr })).status).toBe(200);
    expect((await update({ name: "Yape principal" })).status).toBe(200);
    expect(await account()).toMatchObject({ name: "Yape principal", ref2: qr });
  });

  it("otra empresa no puede editarla", async () => {
    const res = await update({ name: "Intruso" }, otherCtx.admin.token);
    expect(res.status).toBe(404);
    expect((await account()).name).toBe("Yape principal");
  });
});
