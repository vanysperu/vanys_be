import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, createPurchaseOrderFixture, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface WarehouseOptions {
  available: boolean;
  reason: string | null;
  suggested_warehouse_id: number | null;
  warehouses: { id: number; business_unit_id: number | null; requires_expiry: boolean; track_lots: boolean }[];
}

/**
 * Plan §8.4: "Ingresar al almacén X" al registrar una compra. Las opciones
 * respetan la funcionalidad, que el producto maneje stock y el alcance de
 * tienda; un almacén con vencimientos pide la fecha para un perecible y, si
 * falta, no queda ni la compra ni el ingreso. Empresa desechable.
 */
describe("Compras: ingresar al almacén", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let storeBId: number;
  let mainWarehouse: number;
  let lotWarehouse: number;
  let storeBWarehouse: number;
  const stamp = wordStamp().slice(0, 6).toUpperCase();
  const admin = () => authedRequest(ctx.admin.token);

  // Cotización aceptada en la tienda A con un producto + su orden de compra.
  const createItem = async (product: object) => {
    const client = await admin().post("/client/create", { company_id: ctx.companyId, name: `ClienteAlm${wordStamp()}` });
    const created = await admin().post("/product/create", { company_id: ctx.companyId, name: `ProdAlm ${stamp} ${wordStamp().slice(0, 4)}`, price_unit: 10, ...product });
    expect(created.status).toBe(201);
    const quotation = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: ctx.storeId,
      client_id: client.body.data.id,
      items: [{ product_id: created.body.data.id, quantity: 10, pricing_mode: "unit" }],
    });
    const quotationId: number = quotation.body.data.id;
    expect((await admin().put(`/quotation/status/${quotationId}`, { status: "accepted" })).status).toBe(200);
    const detail = await admin().get(`/quotation/find/${quotationId}`);
    const { itemId } = await createPurchaseOrderFixture(ctx.admin.token, ctx.companyId, ctx.gestor.userId, quotationId, detail.body.data.items[0].id, 10);
    return { itemId, productId: created.body.data.id as number };
  };

  const options = async (token: string, itemId: number) => {
    const res = await authedRequest(token).get(`/purchase-order/item/${itemId}/warehouse-options`);
    expect(res.status).toBe(200);
    return res.body.data as WarehouseOptions;
  };

  const buy = (token: string, itemId: number, body: object) =>
    authedRequest(token).post(`/purchase-order/item/${itemId}/purchases`, { quantity: 2, amount: 30, funding_source: "company", ...body });

  const onHand = async (warehouseId: number, productId: number) =>
    Number(
      (await queryRows<{ total: number | null }>("SELECT SUM(on_hand) AS total FROM stock_balance WHERE warehouse_id = ? AND product_id = ?", [warehouseId, productId]))[0]
        ?.total ?? 0
    );

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    storeBId = (await authedRequest(superToken).post("/business-unit/create", { company_id: ctx.companyId, business_code: `QW-${stamp}` })).body.data.id;
  }, 90_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("sin inventario en la empresa no se ofrece", async () => {
    const { itemId } = await createItem({});
    expect(await options(ctx.admin.token, itemId)).toMatchObject({ available: false, reason: "inventory_disabled", warehouses: [] });
  });

  it("con almacenes, sugiere el predeterminado de la tienda; el Gestor solo ve los de su tienda", async () => {
    expect((await authedRequest(superToken).put(`/company-feature/${ctx.companyId}`, { features: { inventory: true } })).status).toBe(200);
    const base = { allow_negative_stock: false, track_lots: false, track_expiry: false, expiry_alert_days: 30, block_expired: true, is_default: false };
    mainWarehouse = (await admin().post("/inventory/warehouses", { ...base, business_unit_id: ctx.storeId, code: "PRIN", name: "Principal" })).body.data.id;
    lotWarehouse = (
      await admin().post("/inventory/warehouses", { ...base, business_unit_id: ctx.storeId, code: "LOTES", name: "Con lotes", track_lots: true, track_expiry: true })
    ).body.data.id;
    storeBWarehouse = (await admin().post("/inventory/warehouses", { ...base, business_unit_id: storeBId, code: "SUCB", name: "Sucursal B" })).body.data.id;
    expect((await admin().put(`/inventory/stores/${ctx.storeId}`, { inventory_enabled: true, inventory_exit_on: "delivered" })).status).toBe(200);

    const { itemId } = await createItem({});
    const forAdmin = await options(ctx.admin.token, itemId);
    expect(forAdmin.available).toBe(true);
    expect(forAdmin.suggested_warehouse_id).toBe(mainWarehouse);
    expect(forAdmin.warehouses.map((warehouse) => warehouse.id)).toEqual(expect.arrayContaining([mainWarehouse, lotWarehouse, storeBWarehouse]));
    // Los de la tienda de la cotización van primero.
    expect(forAdmin.warehouses[forAdmin.warehouses.length - 1]?.id).toBe(storeBWarehouse);

    const forGestor = await options(ctx.gestor.token, itemId);
    expect(forGestor.warehouses.map((warehouse) => warehouse.id).sort()).toEqual([mainWarehouse, lotWarehouse].sort());
  }, 60_000);

  it("la compra ingresa al almacén elegido con su costo; el Gestor no puede usar uno de otra tienda", async () => {
    const { itemId, productId } = await createItem({});
    const res = await buy(ctx.gestor.token, itemId, { warehouse_id: mainWarehouse });
    expect(res.status).toBe(201);
    expect(await onHand(mainWarehouse, productId)).toBe(2);
    const [entry] = await queryRows<{ reason_code: string; unit_cost: string }>(
      `SELECT d.reason_code, l.unit_cost FROM stock_document d JOIN stock_document_line l ON l.document_id = d.id
       WHERE d.warehouse_id = ? AND l.product_id = ?`,
      [mainWarehouse, productId]
    );
    expect(entry).toMatchObject({ reason_code: "purchase" });
    expect(Number(entry?.unit_cost)).toBe(15);

    const foreign = await buy(ctx.gestor.token, itemId, { warehouse_id: storeBWarehouse });
    expect(foreign.status).toBe(404);
  }, 60_000);

  it("perecible en un almacén con vencimientos: sin fecha no queda nada; con fecha, el lote", async () => {
    const { itemId, productId } = await createItem({ is_perishable: true });
    const perOptions = await options(ctx.admin.token, itemId);
    expect(perOptions.warehouses.find((warehouse) => warehouse.id === lotWarehouse)?.requires_expiry).toBe(true);
    expect(perOptions.warehouses.find((warehouse) => warehouse.id === mainWarehouse)?.requires_expiry).toBe(false);

    const missing = await buy(ctx.admin.token, itemId, { warehouse_id: lotWarehouse });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("LOT_EXPIRY_REQUIRED");
    const purchases = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM purchase_order_item_purchase WHERE purchase_order_item_id = ?", [itemId]);
    expect(Number(purchases[0]?.total)).toBe(0);

    const lotCode = `LT-${stamp}`;
    const ok = await buy(ctx.admin.token, itemId, { warehouse_id: lotWarehouse, lot_code: lotCode, expiry_date: "2027-06-30" });
    expect(ok.status).toBe(201);
    const [lot] = await queryRows<{ lot_code: string; expiry: string }>(
      "SELECT lot_code, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry FROM stock_lot WHERE company_id = ? AND product_id = ?",
      [ctx.companyId, productId]
    );
    expect(lot).toEqual({ lot_code: lotCode, expiry: "2027-06-30" });
    expect(await onHand(lotWarehouse, productId)).toBe(2);
  }, 60_000);

  it("un producto que no maneja stock no se ofrece", async () => {
    const { itemId } = await createItem({ tracks_stock: false });
    expect(await options(ctx.admin.token, itemId)).toMatchObject({ available: false, reason: "product_without_stock" });
  });
});
