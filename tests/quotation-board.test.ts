import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { createQuotationFixture, createUnscopedCompanyAdmin } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
// status_changed_at guarda segundos: dos cambios en el mismo segundo empatan
// (y desempata el id). Antes de un cambio que tiene que quedar primero, se
// espera a que pase el segundo.
const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1100));

interface BoardColumn {
  status: string;
  total_count: number;
  total_amount: number;
  data: { id: number; total: string | number }[];
}

/**
 * Tablero de cotizaciones (pedido explícito del usuario: "cuando paso una
 * cotización del carrito a Pendiente no se lista"). Cada columna trae sus
 * propias cotizaciones, de la que cambió de estado más recientemente a la más
 * antigua, con su cantidad y monto reales. Empresa y admin desechables.
 */
describe("Tablero de cotizaciones", () => {
  let superToken: string;
  let companyId: number;
  let adminToken: string;
  let apiKeyId: number;
  let plainKey: string;

  const adminApi = () => authedRequest(adminToken);
  const column = async (status: string, query = "") => {
    const res = await adminApi().get(`/quotation/board${query}`);
    expect(res.status).toBe(200);
    return (res.body.data.columns as BoardColumn[]).find((entry) => entry.status === status)!;
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await authedRequest(superToken).post("/company/create", {
      ruc: `20${String(Date.now()).slice(-9)}`,
      business_name: `Tablero ${wordStamp()}`,
    });
    companyId = company.body.data.id;
    adminToken = (await createUnscopedCompanyAdmin(superToken, companyId)).token;
    const key = await authedRequest(superToken).post("/api-key/create", { company_id: companyId, name: "Jest tablero" });
    plainKey = key.body.data.plain_key;
    apiKeyId = key.body.data.id;
  });

  afterAll(async () => {
    if (apiKeyId) await authedRequest(superToken).put(`/api-key/disable/${apiKeyId}`);
    if (companyId) await authedRequest(superToken).put(`/company/disable/${companyId}`);
  });

  it("muestra arriba la cotización que acaba de llegar a la columna, con totales reales", async () => {
    const first = await createQuotationFixture(adminToken, companyId, { accepted: false });
    const second = await createQuotationFixture(adminToken, companyId, { accepted: false });
    const third = await createQuotationFixture(adminToken, companyId, { accepted: false });

    let pending = await column("pending");
    expect(pending.data.map((quotation) => quotation.id)).toEqual([third.quotationId, second.quotationId, first.quotationId]);
    expect(pending.total_count).toBe(3);
    expect(pending.total_amount).toBeCloseTo(pending.data.reduce((sum, quotation) => sum + Number(quotation.total), 0), 2);

    // La más antigua sale y vuelve a Pendiente: ahora va primera.
    await nextSecond();
    await adminApi().put(`/quotation/status/${first.quotationId}`, { status: "accepted" });
    expect((await column("accepted")).data.map((quotation) => quotation.id)).toEqual([first.quotationId]);
    await nextSecond();
    await adminApi().put(`/quotation/status/${first.quotationId}`, { status: "pending" });
    pending = await column("pending");
    expect(pending.data.map((quotation) => quotation.id)).toEqual([first.quotationId, third.quotationId, second.quotationId]);

    // Pocas por columna, pero el conteo sigue siendo el de toda la columna.
    const limited = await column("pending", "?perStatus=1");
    expect(limited.data).toHaveLength(1);
    expect(limited.total_count).toBe(3);
  });

  it("un pedido del carrito pasado a Pendiente aparece primero en Pendiente", async () => {
    const sku = `TAB-${Date.now()}`;
    await adminApi().post("/product/create", { company_id: companyId, name: `Tablero${wordStamp()}`, sku, price_unit: 5 });
    const web = await request(BASE_URL)
      .post("/api/public/quotation-request")
      .set("X-Api-Key", plainKey)
      .send({ client: { phone: `9${String(Date.now()).slice(-8)}` }, items: [{ sku, quantity: 3 }] });
    expect(web.status).toBe(201);
    const quotationId = web.body.data.quotation_id as number;
    expect((await column("quote_requested")).data[0]?.id).toBe(quotationId);

    await nextSecond();
    const moved = await adminApi().put(`/quotation/status/${quotationId}`, { status: "pending" });
    expect(moved.status).toBe(200);
    expect((await column("pending")).data[0]?.id).toBe(quotationId);
    expect((await column("quote_requested")).data.some((quotation) => quotation.id === quotationId)).toBe(false);
  });

  it("el listado ordena por el último cambio de estado y no falla con un orden desconocido", async () => {
    const sorted = await adminApi().get("/quotation/list?status=pending&orderBy=status_changed_at&orderDir=desc&limit=5");
    expect(sorted.status).toBe(200);
    const pending = await column("pending");
    expect(sorted.body.data.data.map((quotation: { id: number }) => quotation.id)).toEqual(
      pending.data.slice(0, 5).map((quotation) => quotation.id)
    );

    expect((await adminApi().get("/quotation/list?orderBy=no_existe")).status).toBe(200);
  });
});
