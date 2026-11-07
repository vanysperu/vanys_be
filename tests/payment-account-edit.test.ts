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

  // Reporte de QA: se guardaban números de Yape de 30 dígitos o que no
  // empezaban con 9.
  describe("formato del número", () => {
    const createAccount = (prefix: string, ref1: string) =>
      admin().post("/variable_general/create", {
        category: "payment_account",
        title: "Cuenta",
        prefix_id: prefix,
        name: `Cuenta ${prefix} ${ref1.slice(0, 12)}`,
        ref1,
        company_id: ctx.companyId,
      });

    it.each(["yape", "plin"])("%s exige 9 dígitos que empiecen con 9", async (prefix) => {
      for (const ref1 of ["123", "812345678", "98765432", "9876543210", "9".repeat(30), "98765432a", "987 654 321", ""]) {
        const res = await createAccount(prefix, ref1);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_PAYMENT_ACCOUNT_NUMBER");
      }
      expect((await createAccount(prefix, "987654321")).status).toBe(200);
    });

    it("una cuenta bancaria no tiene formato fijo", async () => {
      expect((await createAccount("bank", "191-0000000-0-00")).status).toBe(200);
    });

    it("no deja pasar una cuenta a Yape ni cambiarle el número por uno inválido", async () => {
      const created = await createAccount("bank", "191-1111111-1-11");
      const id = created.body.data.id as number;
      const change = (body: object) => admin().put(`/variable_general/update/${id}`, body);

      expect((await change({ prefix_id: "yape" })).status).toBe(400);
      expect((await change({ prefix_id: "yape", ref1: "912345678" })).status).toBe(200);
      expect((await change({ ref1: "12345" })).status).toBe(400);
    });

    it("una cuenta vieja con número inválido se sigue pudiendo editar sin tocar el número", async () => {
      const created = await createAccount("yape", "987654321");
      const id = created.body.data.id as number;
      const change = (body: object) => admin().put(`/variable_general/update/${id}`, body);
      // Simula datos previos a esta validación: la API ya no permite crearlos.
      await queryRows("UPDATE general_variable SET ref1 = ? WHERE id = ?", ["123", id]);

      expect((await change({ name: "Yape viejo" })).status).toBe(200);
      expect((await change({ show_in_quotation: false })).status).toBe(200);
      // El formulario manda siempre el número, aunque no haya cambiado.
      expect((await change({ prefix_id: "yape", name: "Yape viejo 2", ref1: "123" })).status).toBe(200);
      expect((await change({ ref1: "456" })).status).toBe(400);
    });
  });
});
