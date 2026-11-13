import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, createQuotationFixture, type CashClosingTestCompany } from "./helpers/fixtures";
import { notifyExpiringLots } from "../src/api/modules/inventory/services/jobs/expiring_lots.job";
import { DataBase } from "../src/database";
import { addDaysToDateOnly, todayInBusinessTz } from "../src/utils/dateUtils";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface DocumentDto {
  id: number;
  number: string;
  status: string;
  lines: { id: number; quantity: number; received_quantity: number | null }[];
}
interface StockRow {
  productId: number;
  color: string;
  byWarehouse: { warehouseId: number; quantity: number }[];
  total: number;
  avgCost: number | null;
}

/**
 * Sprint 2, ítem 2 (pedido del usuario): almacenes por tienda, ingresos,
 * salidas, transferencias, lotes y kardex. Cubre el "terminado cuando" del
 * plan §8. Empresa desechable con dos tiendas.
 */
describe("Almacenes e inventario", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let otherStoreId: number;
  let mainWarehouse: number;
  let otherWarehouse: number;
  let lotWarehouse: number;
  let productId: number;
  const stamp = wordStamp().slice(0, 6).toUpperCase();
  const today = todayInBusinessTz();
  const admin = () => authedRequest(ctx.admin.token);

  const createDocument = async (body: object) => {
    const res = await admin().post("/inventory/documents", { document_date: today, ...body });
    expect(res.status).toBe(201);
    return res.body.data as DocumentDto;
  };
  const post = (id: number) => admin().post(`/inventory/documents/${id}/post`);
  const stockOf = async (warehouseId: number) => {
    const res = await admin().get(`/inventory/stock?warehouseId=${warehouseId}&includeZero=true&searchTerm=${stamp}`);
    const row = (res.body.data.data as StockRow[]).find((entry) => entry.productId === productId);
    return row?.total ?? 0;
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    const store = await authedRequest(superToken).post("/business-unit/create", { company_id: ctx.companyId, business_code: `QI-${stamp}` });
    otherStoreId = store.body.data.id;
  }, 90_000);

  afterAll(async () => {
    await DataBase.instance.sequelize.close();
  });

  it("sin la funcionalidad, 403; el Super Administrador la prende", async () => {
    const res = await admin().get("/inventory/warehouses");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FEATURE_DISABLED");
    expect((await authedRequest(superToken).put(`/company-feature/${ctx.companyId}`, { features: { inventory: true } })).status).toBe(200);
  });

  it("almacenes: reglas de configuración (D5) y tiendas que usan almacén", async () => {
    const base = { allow_negative_stock: false, track_lots: false, track_expiry: false, expiry_alert_days: 30, block_expired: true, is_default: false };
    const both = await admin().post("/inventory/warehouses", { ...base, business_unit_id: ctx.storeId, code: "X1", name: "Mal", track_lots: true, allow_negative_stock: true });
    expect(both.status).toBe(400);
    expect(both.body.code).toBe("LOTS_AND_NEGATIVE");

    const main = await admin().post("/inventory/warehouses", { ...base, business_unit_id: ctx.storeId, code: "PRIN", name: "Principal" });
    expect(main.status).toBe(201);
    expect(main.body.data.is_default).toBe(true);
    mainWarehouse = main.body.data.id;
    otherWarehouse = (await admin().post("/inventory/warehouses", { ...base, business_unit_id: otherStoreId, code: "SUC2", name: "Sucursal 2" })).body.data.id;
    lotWarehouse = (
      await admin().post("/inventory/warehouses", { ...base, business_unit_id: ctx.storeId, code: "LOTES", name: "Con lotes", track_lots: true, track_expiry: true })
    ).body.data.id;

    const store = await admin().put(`/inventory/stores/${ctx.storeId}`, { inventory_enabled: true, inventory_exit_on: "delivered" });
    expect(store.status).toBe(200);
  });

  it("los productos nuevos manejan stock (D14); uno que no, no entra a un documento", async () => {
    const created = await admin().post("/product/create", { company_id: ctx.companyId, name: `Polo Stock ${stamp}`, price_unit: 20 });
    expect(created.body.data.tracks_stock).toBe(true);
    productId = created.body.data.id;

    const service = await admin().post("/product/create", { company_id: ctx.companyId, name: `Diseño ${stamp}`, price_unit: 50, tracks_stock: false });
    const refused = await admin().post("/inventory/documents", {
      doc_type: "entry",
      warehouse_id: mainWarehouse,
      reason_code: "opening",
      document_date: today,
      lines: [{ product_id: service.body.data.id, quantity: 1 }],
    });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("PRODUCT_WITHOUT_STOCK");
  });

  it("ingresos con costo: el promedio ponderado es por empresa (D3)", async () => {
    const first = await createDocument({ doc_type: "entry", warehouse_id: mainWarehouse, reason_code: "opening", lines: [{ product_id: productId, quantity: 10, unit_cost: 5 }] });
    expect((await post(first.id)).status).toBe(200);
    const second = await createDocument({ doc_type: "entry", warehouse_id: mainWarehouse, reason_code: "purchase", lines: [{ product_id: productId, quantity: 10, unit_cost: 7 }] });
    expect((await post(second.id)).body.data.status).toBe("posted");

    const stock = await admin().get(`/inventory/stock?warehouseId=${mainWarehouse}&searchTerm=${stamp}`);
    expect((stock.body.data.data as StockRow[])[0]).toMatchObject({ productId, total: 20, avgCost: 6 });
    // Lo confirmado no se edita.
    expect((await admin().put(`/inventory/documents/${first.id}`, { warehouse_id: mainWarehouse, reason_code: "opening", document_date: today, lines: [{ product_id: productId, quantity: 1 }] })).status).toBe(409);
  });

  it("dos salidas simultáneas que superan el stock: una pasa y la otra recibe 409", async () => {
    const a = await createDocument({ doc_type: "exit", warehouse_id: mainWarehouse, reason_code: "internal_use", lines: [{ product_id: productId, quantity: 15 }] });
    const b = await createDocument({ doc_type: "exit", warehouse_id: mainWarehouse, reason_code: "internal_use", lines: [{ product_id: productId, quantity: 15 }] });
    const results = await Promise.all([post(a.id), post(b.id)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(results.find((res) => res.status === 409)?.body.code).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(mainWarehouse)).toBe(5);
    // El que no pasó sigue en borrador y se anula.
    const pending = results.findIndex((res) => res.status === 409) === 0 ? a : b;
    expect((await admin().post(`/inventory/documents/${pending.id}/cancel`, { reason: "Sin stock" })).body.data.status).toBe("cancelled");
  });

  it("transferencia entre tiendas: queda en tránsito, recepción parcial y la diferencia se registra", async () => {
    const transfer = await createDocument({
      doc_type: "transfer",
      warehouse_id: mainWarehouse,
      target_warehouse_id: otherWarehouse,
      reason_code: "transfer",
      lines: [{ product_id: productId, quantity: 4 }],
    });
    expect((await admin().post(`/inventory/documents/${transfer.id}/dispatch`)).body.data.status).toBe("dispatched");
    expect(await stockOf(mainWarehouse)).toBe(1);
    const transit = await queryRows<{ on_hand: string }>(
      "SELECT b.on_hand FROM stock_balance b JOIN warehouse w ON w.id = b.warehouse_id WHERE w.company_id = ? AND w.is_transit = TRUE AND b.product_id = ?",
      [ctx.companyId, productId]
    );
    expect(Number(transit[0]?.on_hand)).toBe(4);

    // Con tránsito abierto, el origen no se deshabilita.
    expect((await admin().put(`/inventory/warehouses/${mainWarehouse}/disable`)).body.code).toBe("WAREHOUSE_HAS_STOCK");

    const lineId = transfer.lines[0]?.id;
    const partial = await admin().post(`/inventory/documents/${transfer.id}/receive`, { lines: [{ line_id: lineId, quantity: 3 }] });
    expect(partial.body.data.status).toBe("partially_received");
    expect(await stockOf(otherWarehouse)).toBe(3);

    const closed = await admin().post(`/inventory/documents/${transfer.id}/receive`, { lines: [{ line_id: lineId, quantity: 0 }], closeDifference: true });
    expect(closed.body.data.status).toBe("received");
    const transitAfter = await queryRows<{ on_hand: string }>(
      "SELECT b.on_hand FROM stock_balance b JOIN warehouse w ON w.id = b.warehouse_id WHERE w.company_id = ? AND w.is_transit = TRUE AND b.product_id = ?",
      [ctx.companyId, productId]
    );
    expect(Number(transitAfter[0]?.on_hand)).toBe(0);
  });

  it("anular un ingreso confirmado crea el movimiento inverso y el kardex cuadra con el saldo", async () => {
    const entry = await createDocument({ doc_type: "entry", warehouse_id: mainWarehouse, reason_code: "purchase", lines: [{ product_id: productId, quantity: 6, unit_cost: 6 }] });
    await post(entry.id);
    expect(await stockOf(mainWarehouse)).toBe(7);
    const cancelled = await admin().post(`/inventory/documents/${entry.id}/cancel`, { reason: "Se cargó dos veces" });
    expect(cancelled.body.data.status).toBe("cancelled");
    expect(await stockOf(mainWarehouse)).toBe(1);

    const kardex = await admin().get(`/inventory/kardex?productId=${productId}&warehouseId=${mainWarehouse}&page=1&limit=100`);
    expect(kardex.status).toBe(200);
    const rows = kardex.body.data.data as { document: { reason_code: string }; balance: number; quantityIn: number; quantityOut: number }[];
    expect(rows.at(-1)?.document.reason_code).toBe("reversal");
    expect(rows.at(-1)?.quantityOut).toBe(6);
    expect(kardex.body.data.closingBalance).toBe(1);
    expect(rows.at(-1)?.balance).toBe(1);
  });

  it("lotes: un perecible pide vencimiento, la salida usa el que vence primero (FEFO) y el lote por vencer avisa", async () => {
    const perishable = await admin().post("/product/create", { company_id: ctx.companyId, name: `Yogur ${stamp}`, price_unit: 3, is_perishable: true });
    const yogurt = perishable.body.data.id as number;
    const noExpiry = await createDocument({ doc_type: "entry", warehouse_id: lotWarehouse, reason_code: "purchase", lines: [{ product_id: yogurt, quantity: 5 }] });
    expect((await post(noExpiry.id)).body.code).toBe("LOT_EXPIRY_REQUIRED");

    const entry = await createDocument({
      doc_type: "entry",
      warehouse_id: lotWarehouse,
      reason_code: "purchase",
      lines: [
        { product_id: yogurt, quantity: 5, lot_code: "TARDE", expiry_date: addDaysToDateOnly(today, 90) },
        { product_id: yogurt, quantity: 5, lot_code: "PRONTO", expiry_date: addDaysToDateOnly(today, 5) },
      ],
    });
    expect((await post(entry.id)).status).toBe(200);
    const suggested = await admin().get(`/inventory/lots/suggest?warehouseId=${lotWarehouse}&productId=${yogurt}`);
    expect((suggested.body.data as { lotCode: string }[]).map((lot) => lot.lotCode)).toEqual(["PRONTO", "TARDE"]);

    const exit = await createDocument({ doc_type: "exit", warehouse_id: lotWarehouse, reason_code: "sample", lines: [{ product_id: yogurt, quantity: 3 }] });
    expect((await post(exit.id)).status).toBe(200);
    const left = await admin().get(`/inventory/lots/suggest?warehouseId=${lotWarehouse}&productId=${yogurt}`);
    expect(left.body.data).toEqual([
      expect.objectContaining({ lotCode: "PRONTO", quantity: 2 }),
      expect.objectContaining({ lotCode: "TARDE", quantity: 5 }),
    ]);

    await notifyExpiringLots();
    const reminders = await queryRows<{ message: string }>(
      "SELECT message FROM reminder WHERE recipient_user_id = ? AND title = 'Lotes por vencer' ORDER BY id DESC LIMIT 1",
      [ctx.admin.userId]
    );
    expect(reminders[0]?.message).toContain("PRONTO");
  });

  it("al marcar Entregada, sale el stock del almacén de la tienda (D4)", async () => {
    const { quotationId } = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    const detail = await admin().get(`/quotation/find/${quotationId}`);
    const soldProduct = detail.body.data.items[0].product_id as number;
    const quantity = Number(detail.body.data.items[0].quantity);
    const entry = await createDocument({ doc_type: "entry", warehouse_id: mainWarehouse, reason_code: "purchase", lines: [{ product_id: soldProduct, quantity: quantity + 2 }] });
    await post(entry.id);

    await queryRows("UPDATE quotation SET status = 'ready', business_unit_id = ? WHERE id = ?", [ctx.storeId, quotationId]);
    const delivered = await admin().put(`/quotation/status/${quotationId}`, { status: "delivered" });
    expect(delivered.status).toBe(200);

    const exits = await queryRows<{ status: string }>("SELECT status FROM stock_document WHERE quotation_id = ? AND doc_type = 'exit'", [quotationId]);
    expect(exits).toEqual([{ status: "posted" }]);
    const balance = await queryRows<{ on_hand: string }>("SELECT on_hand FROM stock_balance WHERE warehouse_id = ? AND product_id = ?", [mainWarehouse, soldProduct]);
    expect(Number(balance[0]?.on_hand)).toBe(2);
  });

  it("el Gestor opera su tienda pero no configura almacenes ni ve costos", async () => {
    const gestor = authedRequest(ctx.gestor.token);
    const stock = await gestor.get(`/inventory/stock?searchTerm=${stamp}`);
    expect(stock.status).toBe(200);
    expect((stock.body.data.data as StockRow[]).every((row) => row.avgCost === null)).toBe(true);
    expect((await gestor.post("/inventory/warehouses", { business_unit_id: ctx.storeId, code: "G1", name: "No" })).status).toBe(403);
    // Un almacén de otra tienda no es suyo para operar.
    const foreign = await gestor.post("/inventory/documents", {
      doc_type: "entry",
      warehouse_id: otherWarehouse,
      reason_code: "opening",
      document_date: today,
      lines: [{ product_id: productId, quantity: 1 }],
    });
    expect(foreign.status).toBe(403);
  });
});
