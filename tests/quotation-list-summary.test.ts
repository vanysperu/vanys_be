import { authedRequest, login, QA_COMPANY_ADMIN } from "./helpers/apiClient";

/**
 * Pedido explícito del usuario: "que los campos tomen la info que deben".
 * El Panel principal sumaba en el navegador las últimas 100 cotizaciones
 * (incluidas las pendientes) y mostraba otra cifra que "Por cobrar". Ahora
 * GET /quotation/list trae un `summary` calculado en la base, con el mismo
 * criterio del módulo receivable.
 */
describe("Resumen de la lista de cotizaciones (Panel principal)", () => {
  let token: string;

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
  });

  it("el saldo por cobrar coincide con el de la pantalla Por cobrar", async () => {
    const [quotations, receivables] = await Promise.all([
      authedRequest(token).get("/quotation/list?page=1&limit=1"),
      authedRequest(token).get("/receivable/list?page=1&limit=1"),
    ]);

    expect(quotations.status).toBe(200);
    expect(receivables.status).toBe(200);
    expect(quotations.body.data.summary.receivable_balance).toBeCloseTo(
      Number(receivables.body.data.summary.total_balance),
      2
    );
    expect(quotations.body.data.summary.receivable_count).toBe(Number(receivables.body.data.summary.quotation_count));
  });

  it("no depende de la página pedida (suma todo lo filtrado)", async () => {
    const [small, large] = await Promise.all([
      authedRequest(token).get("/quotation/list?page=1&limit=1"),
      authedRequest(token).get("/quotation/list?page=2&limit=100"),
    ]);

    expect(small.body.data.summary).toEqual(large.body.data.summary);
  });

  it("el resumen de vencidas respeta el filtro de estado", async () => {
    const expired = await authedRequest(token).get("/quotation/list?page=1&limit=1&status=expired");

    expect(expired.body.data.summary.expired_count).toBe(expired.body.data.meta.total);
    expect(expired.body.data.summary.receivable_count).toBe(0);
  });

  it("/access/me trae el id de la tienda del usuario (la nueva cotización la muestra fija)", async () => {
    const me = await authedRequest(token).get("/access/me");

    expect(me.status).toBe(200);
    expect(typeof me.body.data.businessUnitId === "number" || me.body.data.businessUnitId === null).toBe(true);
    if (me.body.data.businessUnitId !== null) expect(me.body.data.businessUnitName).toBeTruthy();
  });
});
