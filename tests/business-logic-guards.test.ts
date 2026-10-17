import { authedRequest, login, QA_COMPANY_ADMIN } from "./helpers/apiClient";
import { createPurchaseOrderFixture, createQuotationFixture } from "./helpers/fixtures";

describe("Guardas de negocio encontradas en auditoría", () => {
  let token: string;
  let companyId: number;
  let userId: number;

  beforeAll(async () => {
    const auth = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = auth.token;
    userId = auth.userId;
    const access = await authedRequest(token).get("/access/me");
    companyId = access.body.data.companyId;
  });

  describe("Sobre-pago", () => {
    it("rechaza un pago que deja la cotización sobre-pagada", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);
      const quotation = await api.get(`/quotation/find/${quotationId}`);
      const total = Number(quotation.body.data.total);

      const res = await api.post(`/quotation/${quotationId}/payments`, {
        amount: total + 500,
        method: "cash",
        paid_at: "2026-10-11",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/sobre-pagada/i);
    });

    it("permite pagar exactamente el total (sin exceso)", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);
      const quotation = await api.get(`/quotation/find/${quotationId}`);
      const total = Number(quotation.body.data.total);

      const res = await api.post(`/quotation/${quotationId}/payments`, {
        amount: total,
        method: "cash",
        paid_at: "2026-10-11",
      });
      expect(res.status).toBe(201);
    });

    it("rechaza editar un pago si el nuevo monto deja la cotización sobre-pagada", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);
      const quotation = await api.get(`/quotation/find/${quotationId}`);
      const total = Number(quotation.body.data.total);

      const created = await api.post(`/quotation/${quotationId}/payments`, {
        amount: 10,
        method: "cash",
        paid_at: "2026-10-11",
      });
      const paymentId: number = created.body.data.id;

      const res = await api.put(`/payment/update/${paymentId}`, {
        amount: total + 1000,
        method: "cash",
        paid_at: "2026-10-11",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Sobre-compra (overbuy)", () => {
    it("rechaza una compra cuya cantidad excede lo que falta del item", async () => {
      const api = authedRequest(token);
      const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
      const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId, 10);

      const res = await api.post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 50,
        amount: 100,
        funding_source: "company",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/faltan|completamente comprado/i);
    });

    it("permite completar exactamente la cantidad pedida en varias compras parciales", async () => {
      const api = authedRequest(token);
      const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
      const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId, 10);

      const first = await api.post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 6,
        amount: 60,
        funding_source: "company",
      });
      expect(first.status).toBe(201);

      const second = await api.post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 4,
        amount: 40,
        funding_source: "company",
      });
      expect(second.status).toBe(201);

      // Una tercera compra, aunque sea de 1 unidad, ya no debe caber.
      const third = await api.post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 1,
        amount: 10,
        funding_source: "company",
      });
      expect(third.status).toBe(400);
    });

    it("dos compras parciales simultáneas que suman exactamente lo pedido dejan el item en 'purchased' (condición de carrera corregida)", async () => {
      const api = authedRequest(token);
      const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
      const { itemId, purchaseOrderId } = await createPurchaseOrderFixture(
        token,
        companyId,
        userId,
        quotationId,
        quotationItemId,
        10
      );

      // Antes del fix (sin lock FOR UPDATE), estas dos compras concurrentes
      // podían dejar el item en "pending" para siempre pese a sumar el 100%
      // de lo pedido — ver purchase_order_item_purchase.service.ts.
      const [first, second] = await Promise.all([
        api.post(`/purchase-order/item/${itemId}/purchases`, { quantity: 5, amount: 50, funding_source: "company" }),
        api.post(`/purchase-order/item/${itemId}/purchases`, { quantity: 5, amount: 50, funding_source: "company" }),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const order = await api.get(`/purchase-order/find/${purchaseOrderId}`);
      const item = order.body.data.items.find((row: { id: number }) => row.id === itemId);
      expect(item.status).toBe("purchased");

      const totalPurchased = item.purchases.reduce((sum: number, p: { quantity: number }) => sum + p.quantity, 0);
      expect(totalPurchased).toBe(10);
    });
  });

  describe("Deuda a personal — validación de tenant/estado del trabajador", () => {
    it("rechaza generar una deuda a nombre de un usuario que no existe", async () => {
      const api = authedRequest(token);
      const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
      const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);

      const res = await api.post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 1,
        amount: 10,
        funding_source: "employee",
        paid_by_user_id: 999999,
      });
      expect(res.status).toBe(400);
    });
  });
});
