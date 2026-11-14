import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface DetailItem {
  id: number;
  product_id: number;
  is_excluded: boolean;
  subtotal: string | number;
}

/**
 * Pedido del usuario (14-nov): un producto que el cliente no aceptó se marca
 * como "no aceptado" sin editar la cotización. El equipo lo sigue viendo; el
 * cliente no (enlace público y PDF) y no suma al total. Se puede reactivar.
 * Empresa desechable.
 */
describe("Cotización: productos no aceptados", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let quotationId: number;
  let items: DetailItem[];
  const names: string[] = [];
  const admin = () => authedRequest(ctx.admin.token);
  const gestor = () => authedRequest(ctx.gestor.token);
  const detail = async () => (await admin().get(`/quotation/find/${quotationId}`)).body.data as { total: string; subtotal: string; items: DetailItem[] };
  const exclude = (itemId: number, excluded: boolean, api = gestor()) => api.put(`/quotation/item/${itemId}/excluded`, { excluded });

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    const stamp = wordStamp().slice(0, 6);
    const client = await admin().post("/client/create", { company_id: ctx.companyId, name: `Cliente Excl ${stamp}` });
    const products: number[] = [];
    for (const [name, price] of [
      [`Polo Excl ${stamp}`, 20],
      [`Gorra Excl ${stamp}`, 10],
      [`Taza Excl ${stamp}`, 5],
    ] as const) {
      names.push(name);
      products.push((await admin().post("/product/create", { company_id: ctx.companyId, name, price_unit: price })).body.data.id);
    }
    const quotation = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      business_unit_id: ctx.storeId,
      client_id: client.body.data.id,
      items: products.map((product_id) => ({ product_id, quantity: 10, pricing_mode: "unit" })),
    });
    quotationId = quotation.body.data.id;
    expect((await admin().put(`/quotation/status/${quotationId}`, { status: "accepted" })).status).toBe(200);
    items = (await detail()).items;
  }, 90_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("marcar un producto como no aceptado lo saca del total, queda visible para el equipo y en el historial", async () => {
    expect(Number((await detail()).total)).toBe(350);
    const gorra = items[1] as DetailItem;
    const res = await exclude(gorra.id, true);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ is_excluded: true, total: 250 });

    const after = await detail();
    expect(Number(after.total)).toBe(250);
    expect(after.items.find((item) => item.id === gorra.id)?.is_excluded).toBe(true);
    expect(after.items).toHaveLength(3);

    const events = await queryRows<{ action: string }>("SELECT action FROM quotation_event WHERE quotation_id = ? AND action = 'item_excluded'", [quotationId]);
    expect(events).toHaveLength(1);
    expect((await exclude(gorra.id, true)).body.code).toBe("ITEM_EXCLUSION_UNCHANGED");
  });

  it("el cliente no lo ve: el enlace público lista solo lo aceptado y su total", async () => {
    const link = await admin().get(`/quotation/${quotationId}/public-link`);
    const code = String(link.body.data.url).split("/c/")[1] ?? "";
    const view = await request(BASE_URL).get(`/api/public/q/${code}`);
    expect(view.status).toBe(200);
    const productNames = (view.body.data.items as { productName: string }[]).map((item) => item.productName);
    expect(productNames).toEqual([names[0], names[2]]);
    expect(Number(view.body.data.total)).toBe(250);
    const pdf = await request(BASE_URL).get(`/api/public/q/${code}/pdf`);
    expect(pdf.status).toBe(200);
  });

  it("no se compra ni se produce lo no aceptado", async () => {
    const gorra = items[1] as DetailItem;
    const order = await admin().post("/purchase-order/create", {
      company_id: ctx.companyId,
      quotation_id: quotationId,
      assigned_to: ctx.gestor.userId,
      items: [{ quotation_item_id: gorra.id, quantity: 10 }],
    });
    expect(order.status).toBe(409);
    expect(order.body.code).toBe("ITEM_EXCLUDED");
    const board = await admin().get("/production-workflow/board");
    const stageId = board.body.data.stages[1]?.id ?? board.body.data.stages[0]?.id;
    const moved = await gestor().put(`/quotation/item/${gorra.id}/stage`, { stage_id: stageId });
    expect(moved.status).toBe(409);
  });

  it("editar la cotización conserva la marca y el total sigue sin sumarlo", async () => {
    const current = await detail();
    const saved = await admin().put(`/quotation/${quotationId}/items`, {
      items: current.items.map((item) => ({ id: item.id, product_id: item.product_id, quantity: 10, pricing_mode: "unit" })),
    });
    expect(saved.status).toBe(200);
    expect(Number(saved.body.data.total)).toBe(250);
    expect((await detail()).items.filter((item) => item.is_excluded)).toHaveLength(1);
  });

  it("siempre queda al menos un producto aceptado", async () => {
    expect((await exclude(items[0]!.id, true)).status).toBe(200);
    const last = await exclude(items[2]!.id, true);
    expect(last.status).toBe(409);
    expect(last.body.code).toBe("LAST_ACCEPTED_ITEM");
    expect((await exclude(items[0]!.id, false)).status).toBe(200);
  });

  it("no baja el total por debajo de lo cobrado; reactivar lo devuelve al total", async () => {
    const paid = await admin().post(`/quotation/${quotationId}/payments`, { amount: 240, method: "cash", paid_at: "2026-11-14" });
    expect(paid.status).toBe(201);
    const blocked = await exclude(items[0]!.id, true);
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe("TOTAL_BELOW_PAID");

    const reactivated = await exclude(items[1]!.id, false);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.data.total).toBe(350);
    const events = await queryRows<{ action: string }>("SELECT action FROM quotation_event WHERE quotation_id = ? AND action = 'item_included'", [quotationId]);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("otra empresa no puede tocar el producto", async () => {
    const other = await createCashClosingTestCompany(superToken);
    const res = await authedRequest(other.admin.token).put(`/quotation/item/${items[2]!.id}/excluded`, { excluded: true });
    expect(res.status).toBe(404);
    await authedRequest(superToken).put(`/company/disable/${other.companyId}`);
  }, 60_000);
});
