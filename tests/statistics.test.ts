import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { createUnscopedCompanyAdmin } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const QA_GESTOR = { email: "gestor.qa@acme.test", password: "Test1234" };

// Día de hoy en Lima (YYYY-MM-DD), desplazado `days` días.
const limaDate = (days = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

/**
 * Estadísticas con números EXACTOS: se arma una empresa nueva (sin datos de
 * otras pruebas) con un escenario conocido y se compara cada indicador con
 * el valor calculado a mano.
 *
 * Escenario (todo hoy):
 *   - Producto S/ 100 + técnica S/ 10 = S/ 110 por unidad.
 *   - Cotización A: 10 u. = S/ 1,100 → aceptada con adelanto en efectivo de
 *     S/ 400, y un gasto de S/ 150.
 *   - Cotización B: 5 u. = S/ 550 → rechazada.
 *   - Cotización C: 2 u. = S/ 220 → pendiente.
 *   - Caja manual: ingreso S/ 50, egreso S/ 30.
 */
describe("Módulo de estadísticas", () => {
  let token: string;
  let companyId: number;
  let clientId: number;
  let productId: number;
  let techniqueId: number;
  let quotationA: number;

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await authedRequest(superToken).post("/company/create", {
      ruc: `209${Date.now().toString().slice(-8)}`,
      business_name: `StatsCo ${wordStamp().slice(0, 8)}`,
    });
    companyId = company.body.data.id;
    token = (await createUnscopedCompanyAdmin(superToken, companyId)).token;

    const api = authedRequest(token);
    clientId = (await api.post("/client/create", { company_id: companyId, name: `StatsClient${wordStamp()}` })).body
      .data.id;
    productId = (
      await api.post("/product/create", {
        company_id: companyId,
        name: `StatsProduct${wordStamp()}`,
        price_unit: 100,
        requires_customization: true,
      })
    ).body.data.id;
    techniqueId = (
      await api.post("/customization-technique/create", {
        company_id: companyId,
        name: `StatsTechnique${wordStamp()}`,
        price_unit: 10,
      })
    ).body.data.id;

    const quote = async (quantity: number) =>
      (
        await api.post("/quotation/create", {
          company_id: companyId,
          client_id: clientId,
          items: [{ product_id: productId, technique_id: techniqueId, quantity, pricing_mode: "unit" }],
        })
      ).body.data.id as number;

    quotationA = await quote(10);
    const quotationB = await quote(5);
    await quote(2);

    const accepted = await api.put(`/quotation/status/${quotationA}`, {
      status: "accepted",
      advance_payment: { amount: 400, method: "cash", paid_at: limaDate() },
    });
    expect(accepted.status).toBe(200);
    const expense = await api.post(`/quotation/${quotationA}/expenses`, {
      description: "Compra de insumos",
      amount: 150,
      category: "compra",
      spent_at: limaDate(),
    });
    expect(expense.status).toBe(201);
    expect((await api.put(`/quotation/status/${quotationB}`, { status: "rejected" })).status).toBe(200);

    expect(
      (
        await api.post("/cash-movement/create", {
          direction: "income",
          category: "otro_ingreso",
          amount: 50,
          description: "Ingreso de prueba",
          occurred_at: limaDate(),
        })
      ).status
    ).toBe(201);
    expect(
      (
        await api.post("/cash-movement/create", {
          direction: "expense",
          category: "otro_egreso",
          amount: 30,
          description: "Egreso de prueba",
          occurred_at: limaDate(),
        })
      ).status
    ).toBe(201);
  });

  const overview = (query = "") => authedRequest(token).get(`/statistics/overview${query}`);

  it("indicadores del periodo, calculados exactamente", async () => {
    const res = await overview();
    expect(res.status).toBe(200);
    const kpis = res.body.data.kpis.current;

    expect(kpis).toMatchObject({
      quoted_count: 3,
      quoted_amount: 1870,
      won_count: 1,
      won_amount: 1100,
      lost_count: 1,
      pending_count: 1,
      conversion_rate: 0.5,
      average_ticket: 1100,
      collected: 400,
      other_income: 50,
      expenses: 180,
      net_cash: 270,
      margin_amount: 950,
    });
    expect(kpis.margin_rate).toBeCloseTo(950 / 1100, 4);
  });

  it("periodo por defecto: últimos 30 días, comparado con los 30 anteriores", async () => {
    const res = await overview();
    expect(res.body.data.period).toEqual({
      date_from: limaDate(-29),
      date_to: limaDate(),
      previous_from: limaDate(-59),
      previous_to: limaDate(-30),
      granularity: "day",
    });
    // El periodo anterior está vacío en una empresa nueva.
    expect(res.body.data.kpis.previous.quoted_count).toBe(0);
    expect(res.body.data.kpis.previous.conversion_rate).toBeNull();
  });

  it("lo de hoy aparece como 'periodo anterior' al mirar los próximos 30 días", async () => {
    const res = await overview(`?dateFrom=${limaDate(1)}&dateTo=${limaDate(30)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.current.collected).toBe(0);
    expect(res.body.data.kpis.previous.collected).toBe(400);
    expect(res.body.data.kpis.previous.quoted_count).toBe(3);
  });

  it("tendencia: un tramo por día, con los montos de hoy en el último", async () => {
    const res = await overview();
    const trend = res.body.data.trend as { bucket: string }[];
    expect(trend).toHaveLength(30);
    expect(trend[trend.length - 1]).toEqual({ bucket: limaDate(), quoted: 1870, won: 1100, income: 450, expenses: 180 });
  });

  it("con un rango largo agrupa por mes", async () => {
    const res = await overview(`?dateFrom=${limaDate(-120)}&dateTo=${limaDate()}`);
    expect(res.body.data.period.granularity).toBe("month");
    const trend = res.body.data.trend as { bucket: string; quoted: number }[];
    expect(trend.every((point) => /^\d{4}-\d{2}$/.test(point.bucket))).toBe(true);
    expect(trend[trend.length - 1]).toMatchObject({ bucket: limaDate().slice(0, 7), quoted: 1870 });
  });

  it("estado de las cotizaciones, rankings y cobros por cuenta", async () => {
    const data = (await overview()).body.data;
    const status = Object.fromEntries(
      (data.status_breakdown as { status: string; count: number; amount: number }[]).map((row) => [row.status, row])
    );
    expect(status.pending).toMatchObject({ count: 1, amount: 220 });
    expect(status.accepted).toMatchObject({ count: 1, amount: 1100 });
    expect(status.rejected).toMatchObject({ count: 1, amount: 550 });

    expect(data.top_clients).toEqual([expect.objectContaining({ client_id: clientId, amount: 1100, count: 1 })]);
    // Solo cuentan los items de cotizaciones aceptadas (no la rechazada ni la pendiente).
    expect(data.top_products).toEqual([expect.objectContaining({ product_id: productId, amount: 1100, units: 10 })]);
    expect(data.top_techniques).toEqual([
      expect.objectContaining({ technique_id: techniqueId, units: 10, quotations: 1 }),
    ]);
    expect(data.payments_by_account).toEqual([{ label: "Efectivo", amount: 400, count: 1 }]);
  });

  it("por cobrar por antigüedad: solo la aceptada, con su saldo", async () => {
    const aging = (await overview()).body.data.receivables_aging;
    expect(aging).toEqual([
      { bucket: "0-30", amount: 700, count: 1 },
      { bucket: "31-60", amount: 0, count: 0 },
      { bucket: "61-90", amount: 0, count: 0 },
      { bucket: "91+", amount: 0, count: 0 },
    ]);
  });

  it("rendimiento por vendedor", async () => {
    const sellers = (await overview()).body.data.sellers;
    expect(sellers).toEqual([
      expect.objectContaining({
        name: "Unscoped Admin",
        quoted_count: 3,
        quoted_amount: 1870,
        won_count: 1,
        won_amount: 1100,
        lost_count: 1,
        conversion_rate: 0.5,
        collected: 400,
      }),
    ]);
  });

  it("cuadra con Pagos recibidos y con Caja en el mismo periodo", async () => {
    const api = authedRequest(token);
    const range = `dateFrom=${limaDate(-29)}&dateTo=${limaDate()}`;
    const kpis = (await overview(`?${range}`)).body.data.kpis.current;

    const payments = await api.get(`/payment/list?limit=100&${range}`);
    const paymentsTotal = (payments.body.data.data as { amount: number }[]).reduce((sum, row) => sum + row.amount, 0);
    expect(kpis.collected).toBe(paymentsTotal);

    const cash = await api.get(`/cash-movement/list?limit=100&${range}`);
    const rows = cash.body.data.data as { direction: string; amount: number }[];
    const cashIncome = rows.filter((row) => row.direction === "income").reduce((sum, row) => sum + row.amount, 0);
    const cashExpenses = rows.filter((row) => row.direction === "expense").reduce((sum, row) => sum + row.amount, 0);
    expect(kpis.collected + kpis.other_income).toBe(cashIncome);
    expect(kpis.expenses).toBe(cashExpenses);
  });

  it("el Super Administrador puede elegir la empresa y ve los mismos números", async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const res = await authedRequest(superToken).get(`/statistics/overview?companyId=${companyId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.current).toMatchObject({ quoted_amount: 1870, collected: 400, expenses: 180 });
  });

  it("un usuario de empresa no puede mirar otra empresa pasando companyId", async () => {
    // El admin de la empresa nueva pide la empresa QA: se ignora y ve la suya.
    const res = await overview("?companyId=1");
    expect(res.body.data.kpis.current.quoted_amount).toBe(1870);
  });

  it("un Gestor no tiene acceso (es una vista de gestión)", async () => {
    const gestor = await login(QA_GESTOR.email, QA_GESTOR.password);
    const res = await authedRequest(gestor.token).get("/statistics/overview");
    expect(res.status).toBe(403);
  });

  it.each([
    ["fecha inicial posterior a la final", `?dateFrom=${limaDate()}&dateTo=${limaDate(-1)}`],
    ["solo una de las dos fechas", `?dateFrom=${limaDate(-5)}`],
    ["fecha que no existe", "?dateFrom=2026-02-30&dateTo=2026-03-10"],
    ["rango de más de 3 años", "?dateFrom=2020-01-01&dateTo=2026-01-01"],
  ])("rechaza %s", async (_label, query) => {
    const res = await overview(query);
    expect(res.status).toBe(400);
  });
});
