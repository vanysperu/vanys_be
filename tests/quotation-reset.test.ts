import request from "supertest";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { isSystemOnlyResource } from "../src/core/rbac/systemOnlyModules";
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

const TODAY = limaToday();
const CURRENT_PERIOD = TODAY.slice(0, 7);
const CLOSED_PERIOD = shiftPeriod(CURRENT_PERIOD, -2);
const REASON = "Cotización de prueba registrada por error";

interface OrderFixture {
  quotationId: number;
  quotationItemId: number;
  itemId: number;
  orderId: number;
}

const count = async (sql: string, params: unknown[]): Promise<number> =>
  Number((await queryRows<{ total: number }>(`SELECT COUNT(*) AS total FROM ${sql}`, params))[0]?.total);

/**
 * Resetear una cotización (solo Super Administrador): vuelve a Pendiente y se
 * borra físicamente lo que generó, sin tocar lo que es de otras cotizaciones ni
 * un mes cerrado. Empresas desechables: nunca usa las cuentas QA del equipo.
 */
describe("Resetear una cotización", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;

  const superApi = () => authedRequest(superToken);
  const admin = () => authedRequest(ctx.admin.token);

  const createOrder = async (company: CashClosingTestCompany): Promise<OrderFixture> => {
    const fixture = await createQuotationFixture(company.admin.token, company.companyId);
    const { itemId, purchaseOrderId } = await createPurchaseOrderFixture(
      company.admin.token,
      company.companyId,
      company.admin.userId,
      fixture.quotationId,
      fixture.quotationItemId,
      10
    );
    return { ...fixture, itemId, orderId: purchaseOrderId };
  };

  const buy = async (itemId: number, body: object) => {
    const res = await admin().post(`/purchase-order/item/${itemId}/purchases`, { quantity: 5, amount: 50, funding_source: "company", ...body });
    expect(res.status).toBe(201);
    return res.body.data as { id: number; invoice_id: number | null };
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
  }, 60_000);

  afterAll(async () => {
    if (ctx?.companyId) await superApi().put(`/company/disable/${ctx.companyId}`);
  });

  describe("cotización con de todo", () => {
    let target: OrderFixture;
    let other: OrderFixture;
    let stageBefore: number;
    let sharedInvoiceId: number;
    let ownInvoiceId: number;
    let paymentId: number;
    let reimbursementId: number;
    let correctionsBefore: number;

    beforeAll(async () => {
      target = await createOrder(ctx);
      other = await createOrder(ctx);

      const payment = await admin().post(`/quotation/${target.quotationId}/payments`, { amount: 100, method: "cash", paid_at: TODAY });
      expect(payment.status).toBe(201);
      paymentId = payment.body.data.id;
      expect(
        (await admin().put(`/payment/update/${paymentId}`, { amount: 90, method: "cash", paid_at: TODAY, reason: "Se registró mal el monto" })).status
      ).toBe(200);
      expect(
        (await admin().post(`/quotation/${target.quotationId}/expenses`, { description: "Delivery", amount: 20, spent_at: TODAY })).status
      ).toBe(201);
      expect(
        (await admin().post("/cash-movement/create", { direction: "expense", category: "otro_egreso", amount: 15, occurred_at: TODAY, quotation_id: target.quotationId }))
          .status
      ).toBe(201);

      // Factura solo de esta cotización y factura compartida con otra.
      ownInvoiceId = (await buy(target.itemId, { quantity: 2, amount: 20, has_invoice: true })).invoice_id as number;
      sharedInvoiceId = (await buy(target.itemId, { quantity: 2, amount: 30, has_invoice: true })).invoice_id as number;
      await buy(other.itemId, { quantity: 2, amount: 40, has_invoice: true, invoice_id: sharedInvoiceId });

      // Compras con plata del trabajador en las dos cotizaciones, y UNA
      // reposición que cubre ambas deudas.
      await buy(target.itemId, { quantity: 2, amount: 60, funding_source: "employee", paid_by_user_id: ctx.admin.userId });
      await buy(other.itemId, { quantity: 2, amount: 25, funding_source: "employee", paid_by_user_id: ctx.admin.userId });
      const paid = await admin().put(`/employee-debt/pay/${ctx.admin.userId}`, { amount: 85 });
      expect(paid.status).toBe(200);
      reimbursementId = (await queryRows<{ id: number }>("SELECT id FROM employee_debt_payment WHERE user_id = ? ORDER BY id DESC LIMIT 1", [ctx.admin.userId]))[0]?.id as number;

      // Producción avanzada: al resetear vuelve a la primera etapa.
      const detail = await admin().get(`/quotation/find/${target.quotationId}`);
      stageBefore = detail.body.data.items[0].stage_id;
      const stages = await queryRows<{ id: number }>(
        "SELECT id FROM production_workflow_stage WHERE company_id = ? AND active = TRUE AND id <> ? ORDER BY position LIMIT 1",
        [ctx.companyId, stageBefore]
      );
      expect(stages).toHaveLength(1);
      await queryRows("UPDATE quotation_item SET stage_id = ? WHERE id = ?", [stages[0]?.id, target.quotationItemId]);
      correctionsBefore = await count("money_correction WHERE source_type = 'quotation_payment' AND source_id = ?", [paymentId]);
    }, 60_000);

    it("un administrador de empresa no puede ver ni hacer el reset", async () => {
      expect((await admin().get(`/quotation/${target.quotationId}/reset-preview`)).status).toBe(403);
      expect((await admin().put(`/quotation/${target.quotationId}/reset`, { reason: REASON })).status).toBe(403);
      expect((await authedRequest(ctx.gestor.token).put(`/quotation/${target.quotationId}/reset`, { reason: REASON })).status).toBe(403);
      expect(await count("quotation_payment WHERE quotation_id = ?", [target.quotationId])).toBe(1);
    });

    it("el botón solo le llega al Super Administrador y no se puede otorgar a un rol de empresa", async () => {
      expect((await superApi().get("/access/me")).body.data.buttons).toContain("cotizacion.reset.button");
      expect((await admin().get("/access/me")).body.data.buttons).not.toContain("cotizacion.reset.button");
      expect(isSystemOnlyResource("cotizacion", "cotizacion.reset.button")).toBe(true);
      expect(isSystemOnlyResource("cotizacion", "cotizacion.resetPreview.endpoint")).toBe(true);
      expect(isSystemOnlyResource("cotizacion", "cotizacion.profit.view.button")).toBe(false);
    });

    it("exige motivo", async () => {
      expect((await superApi().put(`/quotation/${target.quotationId}/reset`, {})).status).toBe(400);
    });

    it("la vista previa dice exactamente qué se va a borrar", async () => {
      const res = await superApi().get(`/quotation/${target.quotationId}/reset-preview`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        can_reset: true,
        blocked_reason: null,
        blocked_periods: [],
        summary: {
          payments: { count: 1, total: 90 },
          expenses: { count: 1, total: 20 },
          purchases: { count: 3, total: 110 },
          purchase_orders: 1,
          debts: { count: 1, total: 60 },
          reimbursements: { count: 1, total: 60 },
          cash_movements: { count: 1, total: 15 },
          invoices_deleted: 1,
          invoices_kept: 1,
        },
      });
      expect(correctionsBefore).toBe(1);
      // La vista previa no toca nada.
      expect(await count("quotation_payment WHERE quotation_id = ?", [target.quotationId])).toBe(1);
    });

    it("borra todo lo de la cotización y la deja en Pendiente", async () => {
      const res = await superApi().put(`/quotation/${target.quotationId}/reset`, { reason: REASON });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("pending");
      expect(res.body.data.valid_until >= TODAY).toBe(true);

      for (const [table, column] of [
        ["quotation_payment", "quotation_id"],
        ["quotation_expense", "quotation_id"],
        ["purchase_order", "quotation_id"],
        ["cash_movement", "quotation_id"],
      ] as const) {
        expect(await count(`${table} WHERE ${column} = ?`, [target.quotationId])).toBe(0);
      }
      expect(await count("purchase_order_item WHERE purchase_order_id = ?", [target.orderId])).toBe(0);
      expect(await count("purchase_order_item_purchase WHERE purchase_order_item_id = ?", [target.itemId])).toBe(0);
      expect(await count("money_correction WHERE source_type = 'quotation_payment' AND source_id = ?", [paymentId])).toBe(0);
      expect(await count("invoice WHERE id = ?", [ownInvoiceId])).toBe(0);

      const detail = await admin().get(`/quotation/find/${target.quotationId}`);
      expect(detail.body.data).toMatchObject({ status: "pending" });
      expect(Number(detail.body.data.total_paid)).toBe(0);
      expect(Number(detail.body.data.total)).toBe(250);
      expect(detail.body.data.items).toHaveLength(1);
      expect(detail.body.data.items[0].stage_id).toBe(stageBefore);
      expect(detail.body.data.payments).toHaveLength(0);
      expect(detail.body.data.expenses).toHaveLength(0);
    });

    it("no se vence esa noche: la vigencia se renueva", async () => {
      const rows = await queryRows<{ valid_until: string }>("SELECT DATE_FORMAT(valid_until, '%Y-%m-%d') AS valid_until FROM quotation WHERE id = ?", [
        target.quotationId,
      ]);
      expect((rows[0]?.valid_until ?? "") >= TODAY).toBe(true);
    });

    it("deja el rastro en el historial de la cotización", async () => {
      const detail = await admin().get(`/quotation/find/${target.quotationId}`);
      const event = (detail.body.data.events as { action: string; description: string }[]).find((row) => row.action === "quotation_reset");
      expect(event?.description).toContain("1 pago(s) (S/ 90.00)");
      expect(event?.description).toContain(REASON);
    });

    it("lo de la otra cotización sigue intacto: factura compartida, compras y deuda pagada", async () => {
      const invoice = await queryRows<{ quotation_id: number }>("SELECT quotation_id FROM invoice WHERE id = ?", [sharedInvoiceId]);
      expect(Number(invoice[0]?.quotation_id)).toBe(other.quotationId);
      const list = await admin().get("/invoice/list?type=purchase&limit=100");
      const shared = (list.body.data.data as { id: number; purchases: unknown[]; quotation_codes: string[] }[]).find((row) => row.id === sharedInvoiceId);
      expect(shared?.purchases).toHaveLength(1);
      expect(shared?.quotation_codes).toEqual([`COT-${String(other.quotationId).padStart(4, "0")}`]);

      // La reposición de 85 cubría 60 de esta cotización y 25 de la otra.
      const payment = await queryRows<{ amount: string }>("SELECT amount FROM employee_debt_payment WHERE id = ?", [reimbursementId]);
      expect(Number(payment[0]?.amount)).toBe(25);
      const allocations = await queryRows<{ amount: string }>("SELECT amount FROM employee_debt_payment_allocation WHERE employee_debt_payment_id = ?", [reimbursementId]);
      expect(allocations.map((row) => Number(row.amount))).toEqual([25]);
      const debts = await queryRows<{ status: string; paid_amount: string }>("SELECT status, paid_amount FROM employee_debt WHERE company_id = ? AND user_id = ?", [
        ctx.companyId,
        ctx.admin.userId,
      ]);
      expect(debts).toHaveLength(1);
      expect(debts[0]).toMatchObject({ status: "paid" });
    });

    it("Caja queda solo con lo de la otra cotización", async () => {
      const summary = await admin().get(`/cash-movement/month-summary?period=${CURRENT_PERIOD}`);
      // Compra de la empresa de la otra cotización (40) + reposición (25).
      expect(summary.body.data).toMatchObject({ income: 0, expenses: 65, result: -65 });
    });

    it("sin nada que borrar y en Pendiente, avisa", async () => {
      const res = await superApi().put(`/quotation/${target.quotationId}/reset`, { reason: REASON });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("QUOTATION_RESET_NOTHING");
    });

    it("la cotización vuelve a funcionar: se puede aceptar y cobrar de nuevo", async () => {
      expect((await admin().put(`/quotation/status/${target.quotationId}`, { status: "accepted" })).status).toBe(200);
      expect((await admin().post(`/quotation/${target.quotationId}/payments`, { amount: 10, method: "cash", paid_at: TODAY })).status).toBe(201);
    });
  });

  it("una cotización finalizada con factura emitida también vuelve a Pendiente", async () => {
    const order = await createOrder(ctx);
    for (const status of ["design_pending", "in_process", "ready", "delivered"]) {
      expect((await admin().put(`/quotation/status/${order.quotationId}`, { status })).status).toBe(200);
    }
    const closed = await admin().put(`/quotation/status/${order.quotationId}`, { status: "finished", invoice_issued: true });
    const issuedId = closed.body.data.invoice_id as number;
    const upload = await request(BASE_URL)
      .post(`/api/invoice/${issuedId}/file`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .attach("file", PNG_1X1, { filename: "emitida.png", contentType: "image/png" });
    expect(upload.status).toBe(200);

    expect((await superApi().put(`/quotation/${order.quotationId}/reset`, { reason: REASON })).status).toBe(200);
    expect(await count("invoice WHERE id = ?", [issuedId])).toBe(0);
    expect(await count("invoice_file WHERE invoice_id = ?", [issuedId])).toBe(0);
  });

  it("un pedido de la web sin cotizar no se resetea", async () => {
    const { quotationId } = await createQuotationFixture(ctx.admin.token, ctx.companyId, { accepted: false });
    await queryRows("UPDATE quotation SET status = 'quote_requested' WHERE id = ?", [quotationId]);
    const preview = await superApi().get(`/quotation/${quotationId}/reset-preview`);
    expect(preview.body.data.can_reset).toBe(false);
    const res = await superApi().put(`/quotation/${quotationId}/reset`, { reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("QUOTATION_RESET_NOT_QUOTED");
  });

  describe("mes de caja cerrado", () => {
    let closedCtx: CashClosingTestCompany;
    let quotationId: number;
    const closedApi = () => authedRequest(closedCtx.admin.token);

    beforeAll(async () => {
      closedCtx = await createCashClosingTestCompany(superToken);
      const opening = await closedApi().put("/cash-closing/opening", {
        start_period: CLOSED_PERIOD,
        openings: [{ payment_account_id: null, amount: 500 }],
        notes: "Saldo inicial",
      });
      expect(opening.status).toBe(200);
      quotationId = (await createQuotationFixture(closedCtx.admin.token, closedCtx.companyId)).quotationId;
      const payment = await closedApi().post(`/quotation/${quotationId}/payments`, { amount: 100, method: "cash", paid_at: `${CLOSED_PERIOD}-10` });
      expect(payment.status).toBe(201);
      expect((await closedApi().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Cierre" })).status).toBe(200);
    }, 60_000);

    afterAll(async () => {
      if (closedCtx?.companyId) await superApi().put(`/company/disable/${closedCtx.companyId}`);
    });

    it("se niega y no toca nada", async () => {
      const preview = await superApi().get(`/quotation/${quotationId}/reset-preview`);
      expect(preview.body.data).toMatchObject({ can_reset: false, blocked_periods: [CLOSED_PERIOD] });
      const res = await superApi().put(`/quotation/${quotationId}/reset`, { reason: REASON });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("QUOTATION_RESET_CLOSED_PERIOD");
      expect(await count("quotation_payment WHERE quotation_id = ?", [quotationId])).toBe(1);
    });

    it("reabriendo el mes se puede, y al volver a cerrar el mes cuadra", async () => {
      expect((await closedApi().put(`/cash-closing/reopen/${CLOSED_PERIOD}`, { reason: "Resetear una cotización de prueba" })).status).toBe(200);
      expect((await superApi().put(`/quotation/${quotationId}/reset`, { reason: REASON })).status).toBe(200);
      expect((await closedApi().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Re-cierre" })).status).toBe(200);
      const detail = await closedApi().get(`/cash-closing/find/${CLOSED_PERIOD}`);
      expect(detail.body.data.totals).toMatchObject({ opening: 500, income: 0, expense: 0, closing: 500 });
    });
  });

  // Lo anulado ya no suma, pero su ajuste sí: borrarlo cambiaría un mes cerrado.
  describe("fila anulada como ajuste de un mes cerrado", () => {
    let adjustedCtx: CashClosingTestCompany;
    let quotationId: number;
    let paymentId: number;
    const adjustedApi = () => authedRequest(adjustedCtx.admin.token);

    beforeAll(async () => {
      adjustedCtx = await createCashClosingTestCompany(superToken);
      const opening = await adjustedApi().put("/cash-closing/opening", {
        start_period: CLOSED_PERIOD,
        openings: [{ payment_account_id: null, amount: 500 }],
        notes: "Saldo inicial",
      });
      expect(opening.status).toBe(200);
      quotationId = (await createQuotationFixture(adjustedCtx.admin.token, adjustedCtx.companyId)).quotationId;
      const payment = await adjustedApi().post(`/quotation/${quotationId}/payments`, { amount: 100, method: "cash", paid_at: `${CLOSED_PERIOD}-10` });
      expect(payment.status).toBe(201);
      paymentId = payment.body.data.id;
      expect((await adjustedApi().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Cierre" })).status).toBe(200);
      expect((await adjustedApi().put(`/payment/disable/${paymentId}`, { reason: "Pago registrado por error" })).status).toBe(200);
      expect(await count("cash_adjustment_entry WHERE quotation_id = ?", [quotationId])).toBeGreaterThan(0);
    }, 60_000);

    afterAll(async () => {
      if (adjustedCtx?.companyId) await superApi().put(`/company/disable/${adjustedCtx.companyId}`);
    });

    it("sigue bloqueando el reset y no borra el ajuste", async () => {
      const legsBefore = await count("cash_adjustment_entry WHERE quotation_id = ?", [quotationId]);
      const preview = await superApi().get(`/quotation/${quotationId}/reset-preview`);
      expect(preview.body.data).toMatchObject({ can_reset: false, blocked_periods: [CLOSED_PERIOD] });

      const res = await superApi().put(`/quotation/${quotationId}/reset`, { reason: REASON });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("QUOTATION_RESET_CLOSED_PERIOD");
      expect(await count("cash_adjustment_entry WHERE quotation_id = ?", [quotationId])).toBe(legsBefore);
      expect(await count("quotation_payment WHERE id = ?", [paymentId])).toBe(1);
    });
  });
});
