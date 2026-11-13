import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createPurchaseOrderFixture, createQuotationFixture } from "./helpers/fixtures";

/**
 * Toda cotización se puede editar, en cualquier estado (pedido explícito del
 * usuario), sin descuadrar lo que ya está hecho: etapa, compras, pagos y precio
 * pactado de cada item.
 */
describe("Editar una cotización", () => {
  let token: string;
  let userId: number;
  let companyId: number;

  beforeAll(async () => {
    const session = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = session.token;
    userId = session.userId;
    companyId = (await authedRequest(token).get("/access/me")).body.data.companyId;
  });

  const loadQuotation = async (quotationId: number) => (await authedRequest(token).get(`/quotation/find/${quotationId}`)).body.data;
  const save = (quotationId: number, items: object[], extra: object = {}) =>
    authedRequest(token).put(`/quotation/${quotationId}/items`, { items, ...extra });

  const asInput = (item: { id: number; product_id: number; technique_id: number | null; pricing_mode: string; quantity: number }) => ({
    id: item.id,
    product_id: item.product_id,
    technique_id: item.technique_id,
    pricing_mode: item.pricing_mode,
    quantity: item.quantity,
  });

  const createProduct = async () =>
    (await authedRequest(token).post("/product/create", { company_id: companyId, name: `EditProd${wordStamp()}`, price_unit: 4 })).body.data.id as number;

  it("edita en un estado avanzado: conserva etapa y precio pactado, aunque el catálogo cambie", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId);
    const before = await loadQuotation(quotationId);
    const item = before.items[0];
    expect(Number(item.unit_price)).toBe(25);

    const board = await api.get("/production-workflow/board");
    const ordered = board.body.data.stages as { id: number }[];
    const nextStage = ordered[ordered.findIndex((stage) => stage.id === item.stage_id) + 1];
    const moved = await api.put(`/quotation/item/${item.id}/stage`, { stage_id: nextStage?.id });
    expect(moved.status).toBe(200);

    await api.put(`/product/update/${item.product_id}`, { price_unit: 99 });

    const newProductId = await createProduct();
    const res = await save(
      quotationId,
      [
        { ...asInput(item), quantity: 20 },
        { product_id: newProductId, technique_id: null, quantity: 2, pricing_mode: "unit" },
      ],
      { notes: "Cambió el pedido" }
    );
    expect(res.status).toBe(200);
    // 25 pactado × 20 + 4 × 2: cambiar la cantidad no recotiza con el catálogo.
    expect(res.body.data.total).toBe(508);

    const after = await loadQuotation(quotationId);
    expect(after.status).toBe("accepted");
    expect(after.notes).toBe("Cambió el pedido");
    expect(after.items).toHaveLength(2);
    expect(after.items[0]).toMatchObject({ id: item.id, stage_id: nextStage?.id, quantity: 20 });
    expect(Number(after.items[0].unit_price)).toBe(25);
    expect(after.events.some((event: { description: string }) => event.description.includes("→ S/ 508.00"))).toBe(true);
  });

  it("un item con orden de compra sigue en su orden, y no se puede quitar ni cambiar de producto", async () => {
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { purchaseOrderId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId, 10);
    const [item] = (await loadQuotation(quotationId)).items;
    const otherProductId = await createProduct();

    const removed = await save(quotationId, [{ product_id: otherProductId, technique_id: null, quantity: 1, pricing_mode: "unit" }]);
    expect(removed.status).toBe(409);
    expect(removed.body.code).toBe("QUOTATION_ITEM_HAS_PURCHASE_ORDER");

    const changed = await save(quotationId, [{ ...asInput(item), product_id: otherProductId, technique_id: null }]);
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe("QUOTATION_ITEM_HAS_PURCHASE_ORDER");

    // Cambiar la cantidad sí se puede y la orden queda intacta.
    const quantity = await save(quotationId, [{ ...asInput(item), quantity: 15 }]);
    expect(quantity.status).toBe(200);
    const order = await authedRequest(token).get(`/purchase-order/find/${purchaseOrderId}`);
    expect(order.status).toBe(200);
    expect(order.body.data.items).toHaveLength(1);
  });

  it("el total no puede quedar por debajo de lo cobrado", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId);
    const [item] = (await loadQuotation(quotationId)).items;
    await api.post(`/quotation/${quotationId}/payments`, { amount: 200, method: "cash", paid_at: "2026-10-11" });

    const res = await save(quotationId, [{ ...asInput(item), quantity: 2 }]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TOTAL_BELOW_PAID");
    expect((await loadQuotation(quotationId)).items[0].quantity).toBe(10);
  });

  it("también edita una cotización cerrada, y el IGV se recalcula", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId, { accepted: false });
    await api.put(`/quotation/status/${quotationId}`, { status: "rejected" });
    const [item] = (await loadQuotation(quotationId)).items;

    const res = await save(quotationId, [asInput(item)], { includes_igv: true });
    expect(res.status).toBe(200);
    expect(res.body.data.subtotal).toBe(250);
    expect(res.body.data.total).toBe(295);
  });

  it("la orden de compra trae color siempre, y la foto solo si la empresa tiene fotos habilitadas", async () => {
    const api = authedRequest(token);
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { purchaseOrderId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId, 10);
    const [item] = (await loadQuotation(quotationId)).items;
    const photo = "/uploads/company-assets/1/orden-de-prueba.png";
    await queryRows("UPDATE product SET image_path = ? WHERE id = ?", [photo, item.product_id]);
    await queryRows("UPDATE quotation_item SET color = ?, product_code = ? WHERE id = ?", ["Negro", "COD-1", item.id]);
    const [company] = await queryRows<{ product_images_enabled: number }>("SELECT product_images_enabled FROM company WHERE id = ?", [companyId]);
    const productOf = async () => {
      const order = (await api.get(`/purchase-order/find/${purchaseOrderId}`)).body.data;
      return order.items[0].quotationItem;
    };

    try {
      await queryRows("UPDATE company SET product_images_enabled = false WHERE id = ?", [companyId]);
      const hidden = await productOf();
      expect(hidden).toMatchObject({ color: "Negro", product_code: "COD-1" });
      expect(hidden.product).toMatchObject({ image_path: null, images_enabled: false });

      await queryRows("UPDATE company SET product_images_enabled = true WHERE id = ?", [companyId]);
      expect((await productOf()).product).toMatchObject({ image_path: photo, images_enabled: true });
    } finally {
      await queryRows("UPDATE company SET product_images_enabled = ? WHERE id = ?", [company?.product_images_enabled ?? 0, companyId]);
    }
  });

  it("rechaza un item de otra cotización o repetido", async () => {
    const first = await createQuotationFixture(token, companyId);
    const second = await createQuotationFixture(token, companyId);
    const [item] = (await loadQuotation(first.quotationId)).items;

    const foreign = await save(second.quotationId, [asInput(item)]);
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe("QUOTATION_ITEM_NOT_FOUND");

    const repeated = await save(first.quotationId, [asInput(item), asInput(item)]);
    expect(repeated.status).toBe(400);
    expect(repeated.body.code).toBe("QUOTATION_ITEM_NOT_FOUND");
  });
});
