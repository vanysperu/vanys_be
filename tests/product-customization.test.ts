import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";

/**
 * "Requiere personalización" por producto (pedido explícito del usuario:
 * "muchos productos no requieren personalizado"). Apagado por defecto en
 * productos nuevos.
 */
describe("Productos con y sin personalización", () => {
  let token: string;
  let companyId: number;
  let clientId: number;
  let techniqueId: number;

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    const api = authedRequest(token);
    companyId = (await api.get("/access/me")).body.data.companyId;
    clientId = (await api.post("/client/create", { company_id: companyId, name: `Pers${wordStamp()}` })).body.data.id;
    techniqueId = (
      await api.post("/customization-technique/create", {
        company_id: companyId,
        name: `PersTech${wordStamp()}`,
        price_unit: 1,
        price_hundred: 0.95,
      })
    ).body.data.id;
  });

  const createProduct = (extra: Record<string, unknown> = {}) =>
    authedRequest(token).post("/product/create", {
      company_id: companyId,
      name: `PersProd${wordStamp()}`,
      price_unit: 1.2,
      price_hundred: 0.9,
      ...extra,
    });

  const quote = (productId: number, item: Record<string, unknown> = {}) =>
    authedRequest(token).post("/quotation/create", {
      company_id: companyId,
      client_id: clientId,
      items: [{ product_id: productId, quantity: 10, pricing_mode: "hundred", ...item }],
    });

  it("un producto nuevo nace SIN personalización", async () => {
    const res = await createProduct();
    expect(res.status).toBe(201);
    expect(res.body.data.requires_customization).toBe(false);
  });

  it("sin personalización: se cotiza sin técnica y el precio es solo el del producto (0.90 × 10 = 9.00)", async () => {
    const product = await createProduct();
    const created = await quote(product.body.data.id);
    expect(created.status).toBe(201);

    const detail = await authedRequest(token).get(`/quotation/find/${created.body.data.id}`);
    const item = detail.body.data.items[0];
    expect(item.technique_id).toBeNull();
    expect(Number(item.unit_price)).toBe(0.9);
    expect(Number(item.subtotal)).toBe(9);
  });

  it("sin personalización: rechaza que se le mande una técnica", async () => {
    const product = await createProduct();
    const res = await quote(product.body.data.id, { technique_id: techniqueId });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no lleva personalización/);
  });

  it("con personalización: exige la técnica y suma su precio ((0.90 + 0.95) × 10 = 18.50)", async () => {
    const product = await createProduct({ requires_customization: true });
    expect(product.body.data.requires_customization).toBe(true);

    const missing = await quote(product.body.data.id);
    expect(missing.status).toBe(400);
    expect(missing.body.message).toMatch(/requiere una técnica/);

    const created = await quote(product.body.data.id, { technique_id: techniqueId });
    expect(created.status).toBe(201);
    expect(Number(created.body.data.subtotal)).toBe(18.5);
  });

  it("se puede encender o apagar al editar el producto", async () => {
    const api = authedRequest(token);
    const product = await createProduct();
    const productId: number = product.body.data.id;

    const updated = await api.put(`/product/update/${productId}`, { requires_customization: true });
    expect(updated.status).toBe(200);

    const list = await api.get(`/product/list?limit=200`);
    const found = list.body.data.data.find((row: { id: number }) => row.id === productId);
    expect(found.requires_customization).toBe(true);
  });

  it("el PDF se genera para una cotización sin ninguna técnica", async () => {
    const product = await createProduct();
    const created = await quote(product.body.data.id);
    const pdf = await authedRequest(token).get(`/quotation/${created.body.data.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/pdf/);
  });

  it("un SKU vacío (campo sin llenar) se acepta y se guarda como sin SKU", async () => {
    const res = await createProduct({ sku: "" });
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBeNull();
  });

  it("el body no puede forzar el id ni el estado al crear un producto", async () => {
    const res = await createProduct({ id: 999999, is_deleted: true });
    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe(999999);
    expect(res.body.data.is_deleted).toBe(false);
  });
});
