import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { todayInBusinessTz } from "../src/utils/dateUtils";

// Pedido explícito del usuario: "una cotización que no fue aceptada no
// debería poder hacer nada referente a pagos o algo: solo se pueden avanzar
// cosas si está aceptada". Pagos, gastos y producción responden 409
// QUOTATION_NOT_ACTIVE fuera de Aceptada -> Finalizada.
describe("Cotización no aceptada: no se avanza nada", () => {
  let token: string;
  let companyId: number;

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    companyId = (await authedRequest(token).get("/access/me")).body.data.companyId;
  });

  // Se crea Pendiente a mano (no con el fixture) para no depender de su
  // estado por defecto.
  const createPendingQuotation = async () => {
    const api = authedRequest(token);
    const stamp = wordStamp();
    const client = await api.post("/client/create", { company_id: companyId, name: `ActiveRuleClient${stamp}` });
    const product = await api.post("/product/create", { company_id: companyId, name: `ActiveRuleProduct${stamp}`, price_unit: 10 });
    const created = await api.post("/quotation/create", {
      company_id: companyId,
      client_id: client.body.data.id,
      items: [{ product_id: product.body.data.id, quantity: 5, pricing_mode: "unit" }],
    });
    const detail = await api.get(`/quotation/find/${created.body.data.id}`);
    return {
      id: created.body.data.id as number,
      item: detail.body.data.items[0] as { id: number; stage_id: number | null },
    };
  };

  // Etapa siguiente en el orden de la empresa (globales + propias, por ref2).
  const nextStageId = async (currentStageId: number | null) => {
    const res = await authedRequest(token).get("/variable_general/list?category=production_stage&ignorePagination=true&admin=true");
    const stages = (res.body.data.data as { id: number; company_id: number | null; ref2: string | null }[])
      .filter((stage) => stage.company_id === null || stage.company_id === companyId)
      .sort((a, b) => Number(a.ref2 ?? 0) - Number(b.ref2 ?? 0));
    const index = stages.findIndex((stage) => stage.id === currentStageId);
    return stages[index + 1]?.id;
  };

  const tryMoney = async (quotationId: number) => {
    const api = authedRequest(token);
    const expense = await api.post(`/quotation/${quotationId}/expenses`, {
      description: "Gasto de prueba",
      amount: 5,
      spent_at: todayInBusinessTz(),
    });
    const payment = await api.post(`/quotation/${quotationId}/payments`, {
      amount: 5,
      method: "cash",
      paid_at: todayInBusinessTz(),
    });
    return { expense, payment };
  };

  it("una Pendiente no mueve su producción; ya aceptada, sí", async () => {
    const api = authedRequest(token);
    const { id, item } = await createPendingQuotation();
    const next = await nextStageId(item.stage_id);
    expect(next).toBeDefined();

    const blocked = await api.put(`/quotation/item/${item.id}/stage`, { stage_id: next });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("QUOTATION_NOT_ACTIVE");

    expect((await api.put(`/quotation/status/${id}`, { status: "accepted" })).status).toBe(200);
    const moved = await api.put(`/quotation/item/${item.id}/stage`, { stage_id: next });
    expect(moved.status).toBe(200);
  });

  it("una Pendiente no registra gastos ni pagos; ya aceptada, sí", async () => {
    const api = authedRequest(token);
    const { id } = await createPendingQuotation();

    const pending = await tryMoney(id);
    expect(pending.expense.status).toBe(409);
    expect(pending.expense.body.code).toBe("QUOTATION_NOT_ACTIVE");
    expect(pending.payment.status).toBe(409);
    expect(pending.payment.body.code).toBe("QUOTATION_NOT_ACTIVE");

    expect((await api.put(`/quotation/status/${id}`, { status: "accepted" })).status).toBe(200);
    const accepted = await tryMoney(id);
    expect(accepted.expense.status).toBe(201);
    expect(accepted.payment.status).toBe(201);
  });

  it("una Rechazada tampoco admite gastos, pagos ni producción", async () => {
    const api = authedRequest(token);
    const { id, item } = await createPendingQuotation();
    expect((await api.put(`/quotation/status/${id}`, { status: "rejected" })).status).toBe(200);

    const rejected = await tryMoney(id);
    expect(rejected.expense.status).toBe(409);
    expect(rejected.payment.status).toBe(409);
    const stage = await api.put(`/quotation/item/${item.id}/stage`, { stage_id: await nextStageId(item.stage_id) });
    expect(stage.status).toBe(409);
  });
});
