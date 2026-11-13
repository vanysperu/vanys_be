import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, createPurchaseOrderFixture, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

interface PendingRow {
  purchase_id: number;
  invoice_status: "pending" | "not_required";
  business_unit_id: number | null;
}

interface PendingList {
  data: PendingRow[];
  meta: { total: number };
  summary: { pending_count: number };
}

interface InvoiceRow {
  id: number;
  series_number: string | null;
  supplier_name: string | null;
  business_unit_id: number | null;
  has_file: boolean;
  purchases: { purchase_id: number }[];
}

/**
 * Sprint 2, ítem 3 — compras sin factura: "Sí, llega después", la bandeja con
 * su contador, registrar UNA factura para varias compras (con archivo) sin
 * motivo ni "Corregir compra", alcance de tienda y empresa (D8), aviso de
 * factura repetida, quitar compras y la transacción completa.
 * Empresas desechables: nunca usa las cuentas QA del equipo.
 */
describe("Compras sin factura (ítem 3)", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let otherCtx: CashClosingTestCompany;
  let storeBId: number;
  let supplierId: number;
  const gestorPurchases: number[] = [];
  let notRequiredPurchase: number;
  let storeBPurchase: number;
  let gestorInvoiceId: number;
  const quotationsOfGestor: number[] = [];
  const series = `F${String(Date.now()).slice(-3)}-${String(Date.now()).slice(-6)}`;

  const admin = () => authedRequest(ctx.admin.token);
  const gestor = () => authedRequest(ctx.gestor.token);

  // Cotización aceptada en la tienda pedida + orden de compra asignada al gestor.
  const createOrder = async (storeId: number) => {
    const stamp = wordStamp();
    const client = await admin().post("/client/create", { company_id: ctx.companyId, name: `ClienteFac${stamp}` });
    const product = await admin().post("/product/create", { company_id: ctx.companyId, name: `ProductoFac${stamp}`, price_unit: 20 });
    const quotation = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: storeId,
      client_id: client.body.data.id,
      items: [{ product_id: product.body.data.id, quantity: 10, pricing_mode: "unit" }],
    });
    const quotationId: number = quotation.body.data.id;
    expect((await admin().put(`/quotation/status/${quotationId}`, { status: "accepted" })).status).toBe(200);
    const detail = await admin().get(`/quotation/find/${quotationId}`);
    const { itemId } = await createPurchaseOrderFixture(ctx.admin.token, ctx.companyId, ctx.gestor.userId, quotationId, detail.body.data.items[0].id, 10);
    return { quotationId, itemId };
  };

  const buy = (token: string, itemId: number, body: object) =>
    authedRequest(token).post(`/purchase-order/item/${itemId}/purchases`, { quantity: 2, amount: 30, funding_source: "company", ...body });

  const statusOf = async (purchaseId: number) =>
    (await queryRows<{ invoice_status: string }>("SELECT invoice_status FROM purchase_order_item_purchase WHERE id = ?", [purchaseId]))[0]?.invoice_status;

  const pending = async (token: string, query = ""): Promise<PendingList> => {
    const res = await authedRequest(token).get(`/invoice/pending-purchases?limit=100${query}`);
    expect(res.status).toBe(200);
    return res.body.data as PendingList;
  };

  const invoices = async (token: string, query = ""): Promise<InvoiceRow[]> =>
    (await authedRequest(token).get(`/invoice/list?type=purchase&limit=100${query}`)).body.data.data as InvoiceRow[];

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    otherCtx = await createCashClosingTestCompany(superToken);
    const storeB = await authedRequest(superToken).post("/business-unit/create", {
      company_id: ctx.companyId,
      business_code: `QB-${wordStamp().slice(0, 6)}`,
    });
    expect(storeB.status).toBe(201);
    storeBId = storeB.body.data.id;
    const supplier = await admin().post("/supplier/create", { name: `Proveedor Facturas ${wordStamp()}`, document_number: `20${Date.now().toString().slice(-9)}` });
    expect(supplier.status).toBe(201);
    supplierId = supplier.body.data.id;
  }, 120_000);

  afterAll(async () => {
    for (const company of [ctx, otherCtx]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("el Gestor registra 3 compras con 'llega después' y una que no lleva factura", async () => {
    for (let index = 0; index < 3; index += 1) {
      const order = await createOrder(ctx.storeId);
      quotationsOfGestor.push(order.quotationId);
      const res = await buy(ctx.gestor.token, order.itemId, { invoice_pending: true });
      expect(res.status).toBe(201);
      expect(res.body.data.invoice_id).toBeNull();
      gestorPurchases.push(res.body.data.id);
      expect(await statusOf(res.body.data.id)).toBe("pending");
    }
    const order = await createOrder(ctx.storeId);
    const res = await buy(ctx.gestor.token, order.itemId, {});
    expect(res.status).toBe(201);
    notRequiredPurchase = res.body.data.id;
    expect(await statusOf(notRequiredPurchase)).toBe("not_required");

    const contradictory = await buy(ctx.gestor.token, order.itemId, { has_invoice: true, invoice_pending: true });
    expect(contradictory.status).toBe(400);
  }, 120_000);

  it("la bandeja muestra las pendientes con su contador; el interruptor suma las que no llevan factura", async () => {
    const list = await pending(ctx.gestor.token);
    expect(list.data.map((row) => row.purchase_id).sort()).toEqual([...gestorPurchases].sort());
    expect(list.summary.pending_count).toBe(3);

    const withAll = await pending(ctx.gestor.token, "&includeNotRequired=true");
    expect(withAll.data.map((row) => row.purchase_id)).toEqual(expect.arrayContaining([...gestorPurchases, notRequiredPurchase]));

    const summary = (await gestor().get("/invoice/list?limit=1")).body.data.summary;
    expect(summary.pending_purchases_count).toBe(3);
  });

  it("respeta el alcance: el Gestor no ve ni vincula compras de otra tienda; otra empresa no ve nada", async () => {
    const order = await createOrder(storeBId);
    const res = await buy(ctx.admin.token, order.itemId, { invoice_pending: true });
    expect(res.status).toBe(201);
    storeBPurchase = res.body.data.id;

    expect((await pending(ctx.gestor.token)).summary.pending_count).toBe(3);
    expect((await pending(ctx.admin.token)).summary.pending_count).toBe(4);
    expect((await pending(ctx.admin.token, `&storeId=${storeBId}`)).data.map((row) => row.purchase_id)).toEqual([storeBPurchase]);
    expect((await pending(otherCtx.admin.token)).summary.pending_count).toBe(0);

    const foreignStore = await gestor().post("/invoice/link-purchases", { purchase_ids: [storeBPurchase] });
    expect(foreignStore.status).toBe(404);
    const foreignCompany = await authedRequest(otherCtx.admin.token).post("/invoice/link-purchases", { purchase_ids: [gestorPurchases[0]] });
    expect(foreignCompany.status).toBe(404);
  }, 60_000);

  it("si una compra no se puede vincular, no queda nada vinculado (una sola transacción)", async () => {
    const [first, second, third] = gestorPurchases;
    const before = (await invoices(ctx.admin.token)).length;
    const mixed = await gestor().post("/invoice/link-purchases", { purchase_ids: [first, storeBPurchase] });
    expect(mixed.status).toBe(404);
    expect(await statusOf(first as number)).toBe("pending");
    expect((await invoices(ctx.admin.token)).length).toBe(before);

    const badSupplier = await gestor().post("/invoice/link-purchases", { purchase_ids: [first, second, third], supplier_id: 999999999 });
    expect(badSupplier.status).toBe(400);
    expect(await statusOf(second as number)).toBe("pending");
  });

  it("el Gestor crea UNA factura para las 3 compras, con archivo, sin motivo y sin Corregir", async () => {
    const res = await request(BASE_URL)
      .post("/api/invoice/link-purchases")
      .set("Authorization", `Bearer ${ctx.gestor.token}`)
      .field("purchase_ids", gestorPurchases.join(","))
      .field("supplier_id", String(supplierId))
      .field("series_number", series.toLowerCase())
      .field("issue_date", "2026-11-14")
      .field("currency", "PEN")
      .field("total", "90")
      .attach("file", PNG_1X1, { filename: "factura.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: true, file_uploaded: true, file_error: null });
    gestorInvoiceId = res.body.data.invoice_id;

    for (const purchaseId of gestorPurchases) expect(await statusOf(purchaseId)).toBe("linked");
    const list = await pending(ctx.gestor.token);
    expect(list.summary.pending_count).toBe(0);

    const [invoice] = await invoices(ctx.gestor.token, `&search=${encodeURIComponent(series)}`);
    expect(invoice).toMatchObject({ id: gestorInvoiceId, series_number: series, has_file: true, business_unit_id: ctx.storeId });
    expect(invoice?.purchases.map((line) => line.purchase_id).sort()).toEqual([...gestorPurchases].sort());

    // No es una corrección de dinero: queda como evento en el historial de cada cotización.
    const corrections = await queryRows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM money_correction WHERE company_id = ?",
      [ctx.companyId]
    );
    expect(Number(corrections[0]?.total)).toBe(0);
    const events = await queryRows<{ quotation_id: number }>(
      "SELECT quotation_id FROM quotation_event WHERE action = 'purchase_invoice_linked' AND quotation_id IN (?)",
      [quotationsOfGestor]
    );
    expect(events.map((row) => Number(row.quotation_id)).sort()).toEqual([...quotationsOfGestor].sort());
  }, 60_000);

  it("una compra ya vinculada no se vuelve a vincular", async () => {
    const res = await gestor().post("/invoice/link-purchases", { purchase_ids: [gestorPurchases[0]] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PURCHASE_ALREADY_INVOICED");
  });

  it("avisa si se repite proveedor + serie-número; con confirmación, deja registrarla", async () => {
    const body = { purchase_ids: [storeBPurchase], supplier_id: supplierId, series_number: series };
    const repeated = await admin().post("/invoice/link-purchases", body);
    expect(repeated.status).toBe(409);
    expect(repeated.body.code).toBe("INVOICE_DUPLICATE_NUMBER");
    expect(await statusOf(storeBPurchase)).toBe("pending");

    const confirmed = await admin().post("/invoice/link-purchases", { ...body, allow_duplicate: true });
    expect(confirmed.status).toBe(201);
    expect(await statusOf(storeBPurchase)).toBe("linked");
    // Se libera para la prueba de varias tiendas.
    const removed = await admin().put(`/invoice/${confirmed.body.data.invoice_id}/remove-purchase`, { purchase_id: storeBPurchase });
    expect(removed.status).toBe(200);
    expect(removed.body.data.invoice_deleted).toBe(true);
    expect(await statusOf(storeBPurchase)).toBe("pending");
  });

  it("un admin de empresa junta compras de varias tiendas; el Gestor no puede sumar a esa factura", async () => {
    const order = await createOrder(ctx.storeId);
    const storeAPurchase = (await buy(ctx.gestor.token, order.itemId, { invoice_pending: true })).body.data.id as number;
    const res = await admin().post("/invoice/link-purchases", { purchase_ids: [storeAPurchase, storeBPurchase] });
    expect(res.status).toBe(201);
    const invoiceId = res.body.data.invoice_id as number;
    const [invoice] = (await invoices(ctx.admin.token)).filter((row) => row.id === invoiceId);
    expect(invoice?.business_unit_id).toBeNull();

    const another = await createOrder(ctx.storeId);
    const gestorPurchase = (await buy(ctx.gestor.token, another.itemId, { invoice_pending: true })).body.data.id as number;
    const denied = await gestor().post("/invoice/link-purchases", { purchase_ids: [gestorPurchase], invoice_id: invoiceId });
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe("INVOICE_NOT_LINKABLE");

    // A una de su tienda sí: la que creó antes.
    const added = await gestor().post("/invoice/link-purchases", { purchase_ids: [gestorPurchase], invoice_id: gestorInvoiceId });
    expect(added.status).toBe(200);
    expect(added.body.data).toMatchObject({ created: false, invoice_id: gestorInvoiceId });
  }, 60_000);

  it("quitar una compra la devuelve a la bandeja; una factura con archivo se conserva", async () => {
    const [first] = gestorPurchases;
    const res = await gestor().put(`/invoice/${gestorInvoiceId}/remove-purchase`, { purchase_id: first });
    expect(res.status).toBe(200);
    expect(res.body.data.invoice_deleted).toBe(false);
    expect(await statusOf(first as number)).toBe("pending");
    expect((await pending(ctx.gestor.token)).data.map((row) => row.purchase_id)).toContain(first);

    const unlinked = await queryRows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM quotation_event WHERE action = 'purchase_invoice_unlinked' AND quotation_id = ?",
      [quotationsOfGestor[0]]
    );
    expect(Number(unlinked[0]?.total)).toBe(1);
  });

  it("los datos de la factura se completan después; un proveedor de otra empresa no se acepta", async () => {
    const foreignSupplier = await authedRequest(otherCtx.admin.token).post("/supplier/create", { name: `Ajeno ${wordStamp()}` });
    expect(foreignSupplier.status).toBe(201);
    const denied = await gestor().put(`/invoice/${gestorInvoiceId}/details`, { supplier_id: foreignSupplier.body.data.id });
    expect(denied.status).toBe(400);

    const saved = await gestor().put(`/invoice/${gestorInvoiceId}/details`, { supplier_id: supplierId, series_number: "E001-77", currency: "USD" });
    expect(saved.status).toBe(200);
    const [invoice] = await invoices(ctx.gestor.token, "&search=E001-77");
    expect(invoice).toMatchObject({ id: gestorInvoiceId, series_number: "E001-77" });
    expect((await invoices(ctx.gestor.token, `&supplierId=${supplierId}`)).map((row) => row.id)).toContain(gestorInvoiceId);

    const badFormat = await gestor().put(`/invoice/${gestorInvoiceId}/details`, { series_number: "factura 12" });
    expect(badFormat.status).toBe(400);
  });

  it("una compra anulada sale de la bandeja", async () => {
    const [first] = gestorPurchases;
    const annulled = await admin().put(`/purchase-order/purchase/disable/${first}`, { reason: "Prueba ítem 3" });
    expect(annulled.status).toBe(200);
    expect((await pending(ctx.admin.token)).data.map((row) => row.purchase_id)).not.toContain(first);
    const relink = await admin().post("/invoice/link-purchases", { purchase_ids: [first] });
    expect(relink.status).toBe(409);
    expect(relink.body.code).toBe("PURCHASE_ANNULLED");
  });
});
