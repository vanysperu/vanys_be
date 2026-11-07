import request from "supertest";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Documentos de la empresa (reportes de QA): quitar el logo ya subido y el
 * formato del teléfono. Empresa desechable: nunca toca los datos del equipo.
 */
describe("Documentos de la empresa: logo y teléfono", () => {
  let ctx: CashClosingTestCompany;
  let superToken: string;

  const api = () => authedRequest(ctx.admin.token);
  const settings = async () => (await api().get("/company/my-document-settings")).body.data;
  const save = async (changes: object) => {
    const { business_name, address, phone, legal_terms_caption } = await settings();
    return api().put("/company/my-document-settings", {
      business_name,
      address: address ?? "",
      phone: phone ?? "",
      legal_terms_caption: legal_terms_caption ?? "",
      ...changes,
    });
  };
  const uploadLogo = async () => {
    const res = await request(BASE_URL)
      .post("/api/uploads/company-asset")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .attach("file", PNG_1X1, { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    return res.body.data.path as string;
  };
  const assetExists = async (publicPath: string) => {
    const fileName = publicPath.split("/").pop() ?? "";
    const rows = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM company_asset WHERE file_name = ?", [fileName]);
    return Number(rows[0]?.total) > 0;
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
  }, 60_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("quitar el logo deja la empresa sin logo y borra la imagen", async () => {
    const logo = await uploadLogo();
    expect((await save({ logo_url: logo })).status).toBe(200);
    expect((await settings()).logo_url).toBe(logo);

    expect((await save({ logo_url: null })).status).toBe(200);
    expect((await settings()).logo_url).toBeNull();
    expect(await assetExists(logo)).toBe(false);
  });

  it("guardar sin mandar logo_url no toca el logo", async () => {
    const logo = await uploadLogo();
    expect((await save({ logo_url: logo })).status).toBe(200);
    expect((await save({ address: "Av. Siempre Viva 123" })).status).toBe(200);
    expect((await settings()).logo_url).toBe(logo);
  });

  it("el teléfono solo acepta de 6 a 15 dígitos", async () => {
    for (const phone of ["12345", "1234567890123456", "1".repeat(40), "99 88 77 66", "abcdefgh"]) {
      expect((await save({ phone })).status).toBe(400);
    }
    expect((await save({ phone: "987654321" })).status).toBe(200);
    expect((await settings()).phone).toBe("987654321");
    // Vacío: es opcional.
    expect((await save({ phone: "" })).status).toBe(200);
  });
});
