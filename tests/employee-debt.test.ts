import { authedRequest, login, QA_COMPANY_ADMIN } from "./helpers/apiClient";
import { createPurchaseOrderFixture, createQuotationFixture } from "./helpers/fixtures";

describe("Origen de fondos de una compra + deudas a personal", () => {
  let token: string;
  let companyId: number;
  let userId: number;

  beforeAll(async () => {
    const auth = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = auth.token;
    userId = auth.userId;
    const api = authedRequest(token);
    const access = await api.get("/access/me");
    companyId = access.body.data.companyId;
  });

  it("una compra pagada con plata de la empresa NO genera deuda", async () => {
    const api = authedRequest(token);
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);

    const purchase = await api.post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 5,
      amount: 30,
      funding_source: "company",
    });
    expect(purchase.status).toBe(201);
    expect(purchase.body.data.funding_source).toBe("company");
    expect(purchase.body.data.paid_by_user_id).toBeNull();
  });

  it("una compra pagada con plata propia genera una deuda pendiente a nombre de quien la registró", async () => {
    const api = authedRequest(token);
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);

    const purchase = await api.post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 5,
      amount: 40,
      funding_source: "employee",
    });
    expect(purchase.status).toBe(201);
    expect(purchase.body.data.funding_source).toBe("employee");
    expect(purchase.body.data.paid_by_user_id).toBe(userId);

    const debts = await api.get("/employee-debt/list");
    expect(debts.status).toBe(200);
    const myDebt = debts.body.data.data.find((row: { user_id: number }) => row.user_id === userId);
    expect(myDebt).toBeDefined();
    expect(Number(myDebt.pending_amount)).toBeGreaterThanOrEqual(40);
  });

  it("rechaza funding_source inválido", async () => {
    const api = authedRequest(token);
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);

    const res = await api.post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 5,
      amount: 10,
      funding_source: "bitcoin",
    });
    expect(res.status).toBe(400);
  });

  it("marcar como pagado salda TODA la deuda pendiente de ese trabajador", async () => {
    const api = authedRequest(token);
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);

    await api.post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 5,
      amount: 25,
      funding_source: "employee",
    });

    const before = await api.get("/employee-debt/list");
    const debtBefore = before.body.data.data.find((row: { user_id: number }) => row.user_id === userId);
    expect(debtBefore).toBeDefined();

    const paid = await api.put(`/employee-debt/pay/${userId}`);
    expect(paid.status).toBe(200);

    const after = await api.get("/employee-debt/list");
    const debtAfter = after.body.data.data.find((row: { user_id: number }) => row.user_id === userId);
    expect(debtAfter).toBeUndefined();
  });
});
