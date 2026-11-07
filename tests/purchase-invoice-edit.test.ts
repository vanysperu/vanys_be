import request from "supertest";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import {
  createCashClosingTestCompany,
  createPurchaseOrderFixture,
  createQuotationFixture,
  type CashClosingTestCompany,
} from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const limaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const shiftPeriod = (period: string, months: number): string => {
  const [year = 0, month = 1] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
};

const CURRENT_PERIOD = limaToday().slice(0, 7);
const CLOSED_PERIOD = shiftPeriod(CURRENT_PERIOD, -2);
const REASON = "Se registró mal la factura";

interface OrderFixture {
  quotationId: number;
  itemId: number;
}

interface InvoiceRow {
  id: number;
  has_file: boolean;
  quotation_id: number;
  description: string;
  purchases: { purchase_id: number }[];
}

const cot = (id: number) => `COT-${String(id).padStart(4, "0")}`;

/**
 * Compras hechas: corregir si llevaban factura y anular una compra devuelta
 * (pedido explícito del usuario), sin dañar Caja ni dejar facturas colgadas.
 * Empresas desechables: nunca usa las cuentas QA del equipo.
 */
describe("Compras hechas: factura al corregir y anular", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;

  const admin = () => authedRequest(ctx.admin.token);

  const createOrder = async (company: CashClosingTestCompany = ctx): Promise<OrderFixture> => {
    const fixture = await createQuotationFixture(company.admin.token, company.companyId);
    const { itemId } = await createPurchaseOrderFixture(
      company.admin.token,
      company.companyId,
      company.admin.userId,
      fixture.quotationId,
      fixture.quotationItemId,
      10
    );
    return { quotationId: fixture.quotationId, itemId };
  };

  const buy = async (itemId: number, body: object = {}, token = ctx.admin.token) => {
    const res = await authedRequest(token).post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 2,
      amount: 59,
      funding_source: "company",
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data as { id: number; invoice_id: number | null };
  };

  const correct = (purchaseId: number, body: object) =>
    admin().put(`/purchase-order/purchase/update/${purchaseId}`, { reason: REASON, ...body });

  const invoices = async () => (await admin().get("/invoice/list?type=purchase&limit=100")).body.data as { data: InvoiceRow[]; summary: { pending_count: number } };
  const invoiceById = async (id: number) => (await invoices()).data.find((row) => row.id === id);

  const uploadFile = async (invoiceId: number) => {
    const res = await request(BASE_URL)
      .post(`/api/invoice/${invoiceId}/file`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .attach("file", PNG_1X1, { filename: "factura.png", contentType: "image/png" });
    expect(res.status).toBe(200);
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
  }, 60_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  describe("corregir la factura de una compra", () => {
    it("a una compra sin factura se le crea una y queda en Faltan subir", async () => {
      const order = await createOrder();
      const purchase = await buy(order.itemId);
      const res = await correct(purchase.id, { has_invoice: true });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ invoice_created: true, changed_fields: [] });
      const invoice = await invoiceById(res.body.data.invoice_id);
      expect(invoice).toMatchObject({ has_file: false, quotation_id: order.quotationId });

      const found = await admin().get(`/purchase-order/purchase/find/${purchase.id}`);
      expect(found.body.data).toMatchObject({ invoice_id: res.body.data.invoice_id, invoice_has_file: false, invoice_purchases_count: 1 });
    });

    it("queda en el historial de la compra", async () => {
      const order = await createOrder();
      const purchase = await buy(order.itemId);
      expect((await correct(purchase.id, { has_invoice: true })).status).toBe(200);
      const history = await admin().get(`/purchase-order/purchase/${purchase.id}/corrections`);
      expect(history.body.data.data[0]).toMatchObject({
        previous_values: { invoice_status: "Sin factura" },
        new_values: { invoice_status: "Con factura" },
        reason: REASON,
      });
    });

    it("sin cambios responde NO_CHANGES", async () => {
      const order = await createOrder();
      const purchase = await buy(order.itemId, { has_invoice: true });
      const same = await correct(purchase.id, { has_invoice: true });
      expect(same.status).toBe(400);
      expect(same.body.code).toBe("NO_CHANGES");
      const none = await correct((await buy(order.itemId)).id, { has_invoice: false });
      expect(none.status).toBe(400);
    });

    it("quitar la factura de su única compra la borra", async () => {
      const order = await createOrder();
      const purchase = await buy(order.itemId, { has_invoice: true });
      const res = await correct(purchase.id, { has_invoice: false });
      expect(res.status).toBe(200);
      expect(res.body.data.invoice_id).toBeNull();
      expect(await invoiceById(purchase.invoice_id as number)).toBeUndefined();
    });

    it("quitarla de una factura con más compras la deja con las demás", async () => {
      const first = await createOrder();
      const second = await createOrder();
      const purchase = await buy(first.itemId, { has_invoice: true });
      const invoiceId = purchase.invoice_id as number;
      await buy(second.itemId, { has_invoice: true, invoice_id: invoiceId });

      expect((await correct(purchase.id, { has_invoice: false })).status).toBe(200);
      const invoice = await invoiceById(invoiceId);
      expect(invoice?.purchases).toHaveLength(1);
      // Ya no cubre la primera cotización: pasa a la que le queda.
      expect(invoice?.quotation_id).toBe(second.quotationId);
    });

    it("pasar una compra a otra factura une las dos, también con archivo", async () => {
      const order = await createOrder();
      const keep = await buy(order.itemId, { has_invoice: true });
      const merged = await buy(order.itemId, { has_invoice: true });
      await uploadFile(merged.invoice_id as number);

      const res = await correct(merged.id, { has_invoice: true, invoice_id: keep.invoice_id });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ invoice_id: keep.invoice_id, invoice_created: false });
      expect((await invoiceById(keep.invoice_id as number))?.purchases).toHaveLength(2);
      expect(await invoiceById(merged.invoice_id as number)).toBeUndefined();
    });

    it("no acepta una factura de otra empresa, y la compra no cambia", async () => {
      const otherCtx = await createCashClosingTestCompany(superToken);
      const foreign = await createOrder(otherCtx);
      const foreignPurchase = await buy(foreign.itemId, { has_invoice: true }, otherCtx.admin.token);

      const order = await createOrder();
      const purchase = await buy(order.itemId);
      const res = await correct(purchase.id, { has_invoice: true, invoice_id: foreignPurchase.invoice_id, amount: 70 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVOICE_NOT_LINKABLE");
      const found = await admin().get(`/purchase-order/purchase/find/${purchase.id}`);
      expect(found.body.data).toMatchObject({ amount: 59, invoice_id: null });
      await authedRequest(superToken).put(`/company/disable/${otherCtx.companyId}`);
    }, 60_000);

    it("cambiar monto y factura a la vez corrige los dos en una sola operación", async () => {
      const order = await createOrder();
      const purchase = await buy(order.itemId);
      const res = await correct(purchase.id, { has_invoice: true, amount: 118 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ changed_fields: ["amount"], invoice_created: true });
      const expense = await queryRows<{ amount: string }>(
        "SELECT qe.amount FROM quotation_expense qe INNER JOIN purchase_order_item_purchase pop ON pop.quotation_expense_id = qe.id WHERE pop.id = ?",
        [purchase.id]
      );
      expect(Number(expense[0]?.amount)).toBe(118);
    });
  });

  describe("anular una compra devuelta", () => {
    it("el dinero vuelve a Caja y el producto queda pendiente de comprar", async () => {
      const order = await createOrder();
      const before = (await admin().get(`/cash-movement/month-summary?period=${CURRENT_PERIOD}`)).body.data.expenses as number;
      const purchase = await buy(order.itemId, { quantity: 10, amount: 200 });
      const during = (await admin().get(`/cash-movement/month-summary?period=${CURRENT_PERIOD}`)).body.data.expenses as number;
      expect(during).toBe(before + 200);

      expect((await admin().put(`/purchase-order/purchase/disable/${purchase.id}`, {})).status).toBe(200);
      const after = (await admin().get(`/cash-movement/month-summary?period=${CURRENT_PERIOD}`)).body.data.expenses as number;
      expect(after).toBe(before);
      const item = await queryRows<{ status: string }>("SELECT status FROM purchase_order_item WHERE id = ?", [order.itemId]);
      expect(item[0]?.status).toBe("pending");
    });

    it("una factura sin archivo que solo cubría esa compra desaparece de Faltan subir", async () => {
      const order = await createOrder();
      const purchase = await buy(order.itemId, { has_invoice: true });
      const pendingBefore = (await invoices()).summary.pending_count;
      expect((await admin().put(`/purchase-order/purchase/disable/${purchase.id}`, {})).status).toBe(200);
      expect(await invoiceById(purchase.invoice_id as number)).toBeUndefined();
      expect((await invoices()).summary.pending_count).toBe(pendingBefore - 1);
    });

    it("una factura con archivo se conserva", async () => {
      const order = await createOrder();
      const purchase = await buy(order.itemId, { has_invoice: true });
      await uploadFile(purchase.invoice_id as number);
      expect((await admin().put(`/purchase-order/purchase/disable/${purchase.id}`, {})).status).toBe(200);
      expect(await invoiceById(purchase.invoice_id as number)).toMatchObject({ has_file: true, purchases: [] });
    });

    it("una factura con más compras sigue con las demás y pasa a la cotización que le queda", async () => {
      const first = await createOrder();
      const second = await createOrder();
      const purchase = await buy(first.itemId, { has_invoice: true });
      const invoiceId = purchase.invoice_id as number;
      await buy(second.itemId, { has_invoice: true, invoice_id: invoiceId });

      expect((await admin().put(`/purchase-order/purchase/disable/${purchase.id}`, {})).status).toBe(200);
      const invoice = await invoiceById(invoiceId);
      expect(invoice?.purchases).toHaveLength(1);
      expect(invoice?.quotation_id).toBe(second.quotationId);
      const listed = await admin().get(`/invoice/list?search=${encodeURIComponent(cot(second.quotationId))}`);
      expect(listed.body.data.data.map((row: InvoiceRow) => row.id)).toContain(invoiceId);
    });

    it("la lista de compras dice si llevan factura y las anuladas no se pueden corregir", async () => {
      const order = await createOrder();
      const purchase = await buy(order.itemId, { has_invoice: true });
      const quotation = await admin().get(`/quotation/find/${order.quotationId}`);
      const expense = (quotation.body.data.expenses as { purchase_id: number; purchase_funding_source: string }[]).find((row) => row.purchase_id === purchase.id);
      expect(expense?.purchase_funding_source).toBe("company");

      expect((await admin().put(`/purchase-order/purchase/disable/${purchase.id}`, {})).status).toBe(200);
      const res = await correct(purchase.id, { has_invoice: false });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PURCHASE_ANNULLED");
    });
  });

  describe("mes de caja cerrado", () => {
    let closedCtx: CashClosingTestCompany;
    let purchaseId: number;
    const closedApi = () => authedRequest(closedCtx.admin.token);

    beforeAll(async () => {
      closedCtx = await createCashClosingTestCompany(superToken);
      expect(
        (
          await closedApi().put("/cash-closing/opening", {
            start_period: CLOSED_PERIOD,
            openings: [{ payment_account_id: null, amount: 500 }],
            notes: "Saldo inicial",
          })
        ).status
      ).toBe(200);
      const order = await createOrder(closedCtx);
      purchaseId = (await buy(order.itemId, {}, closedCtx.admin.token)).id;
      // La compra se registra hoy: se lleva al mes que se va a cerrar.
      expect(
        (await closedApi().put(`/purchase-order/purchase/update/${purchaseId}`, { spent_at: `${CLOSED_PERIOD}-10`, reason: "Fecha real de la compra" })).status
      ).toBe(200);
      expect((await closedApi().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Cierre" })).status).toBe(200);
    }, 60_000);

    afterAll(async () => {
      if (closedCtx?.companyId) await authedRequest(superToken).put(`/company/disable/${closedCtx.companyId}`);
    });

    it("cambiar solo la factura no genera ajuste: no mueve dinero", async () => {
      const res = await closedApi().put(`/purchase-order/purchase/update/${purchaseId}`, { has_invoice: true, reason: REASON });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ kind: "correction", adjusted_period: null, invoice_created: true });
      const legs = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM cash_adjustment_entry WHERE company_id = ?", [closedCtx.companyId]);
      expect(Number(legs[0]?.total)).toBe(0);
    });

    it("anularla sí es un ajuste: el mes cerrado no cambia y la devolución cae en el mes abierto", async () => {
      const period = await closedApi().get(`/cash-closing/find/${CLOSED_PERIOD}`);
      expect(period.body.data.totals.expense).toBe(59);
      const withoutReason = await closedApi().put(`/purchase-order/purchase/disable/${purchaseId}`, {});
      expect(withoutReason.status).toBe(400);
      expect(withoutReason.body.code).toBe("ADJUSTMENT_REASON_REQUIRED");

      const res = await closedApi().put(`/purchase-order/purchase/disable/${purchaseId}`, { reason: "La compra se devolvió" });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });
      const after = await closedApi().get(`/cash-closing/find/${CLOSED_PERIOD}`);
      expect(after.body.data.totals).toMatchObject({ expense: 59, closing: period.body.data.totals.closing });
    });
  });
});
