import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";

// Pedido mínimo de un producto (pedido explícito del usuario). Es informativo:
// se guarda en el producto, lo muestran la API pública y la cotización, y un
// pedido de la web por debajo del mínimo se recibe igual y queda marcado.

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

describe("Pedido mínimo de productos", () => {
  const stamp = wordStamp();
  let superToken: string;
  let companyId: number;
  let apiKeyId: number;
  let plainKey: string;

  const api = () => authedRequest(superToken);
  const bulk = (products: object[]) => request(BASE_URL).post("/api/public/products/bulk").set("X-Api-Key", plainKey).send({ products });
  const publicProduct = async (sku: string) => {
    const res = await request(BASE_URL).get(`/api/public/products?skus=${sku}`).set("X-Api-Key", plainKey);
    expect(res.status).toBe(200);
    return res.body.data.data[0] as { sku: string; min_order_quantity: number | null } | undefined;
  };
  const internalProduct = async (sku: string) => {
    const res = await api().get(`/product/list?page=1&limit=10&companyId=${companyId}&sku=${sku}`);
    expect(res.status).toBe(200);
    return res.body.data.data[0] as { id: number; min_order_quantity: number | null };
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await api().post("/company/create", { ruc: `20${String(Date.now()).slice(-9)}`, business_name: `Pedido minimo ${stamp}` });
    expect(company.status).toBe(201);
    companyId = Number(company.body.data.id);
    const key = await api().post("/api-key/create", { company_id: companyId, name: `Jest pedido mínimo ${stamp}` });
    expect(key.status).toBe(201);
    apiKeyId = key.body.data.id;
    plainKey = key.body.data.plain_key;
  }, 60_000);

  afterAll(async () => {
    if (apiKeyId) await api().put(`/api-key/disable/${apiKeyId}`);
    if (companyId) await api().put(`/company/disable/${companyId}`);
  });

  describe("en el sistema (pantalla de Productos)", () => {
    it("se guarda al crear, se conserva si no se manda y se quita con null", async () => {
      const created = await api().post("/product/create", {
        company_id: companyId,
        name: `Gorra minimo ${stamp}`,
        sku: "MIN-01",
        price_unit: 10,
        min_order_quantity: 100,
      });
      expect(created.status).toBe(201);
      const { id } = await internalProduct("MIN-01");
      expect((await internalProduct("MIN-01")).min_order_quantity).toBe(100);

      expect((await api().put(`/product/update/${id}`, { name: `Gorra minimo editada ${stamp}` })).status).toBe(200);
      expect((await internalProduct("MIN-01")).min_order_quantity).toBe(100);

      expect((await api().put(`/product/update/${id}`, { min_order_quantity: 250 })).status).toBe(200);
      expect((await internalProduct("MIN-01")).min_order_quantity).toBe(250);

      expect((await api().put(`/product/update/${id}`, { min_order_quantity: null })).status).toBe(200);
      expect((await internalProduct("MIN-01")).min_order_quantity).toBeNull();
    });

    it("sin mínimo por defecto", async () => {
      const created = await api().post("/product/create", { company_id: companyId, name: `Taza sin minimo ${stamp}`, sku: "MIN-02", price_unit: 5 });
      expect(created.status).toBe(201);
      expect((await internalProduct("MIN-02")).min_order_quantity).toBeNull();
    });

    it.each([0, -5, 1.5, 1000001, "cien"])("rechaza un mínimo inválido: %s", async (value) => {
      const res = await api().post("/product/create", {
        company_id: companyId,
        name: `Invalido ${stamp}`,
        sku: `MIN-BAD-${String(value).replace(/\W/g, "")}`,
        price_unit: 5,
        min_order_quantity: value,
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("en la API pública", () => {
    it("la subida masiva lo guarda y el catálogo lo devuelve", async () => {
      const res = await bulk([
        { sku: "MIN-10", name: "Termo con mínimo", price_unit: 20, min_order_quantity: 50 },
        { sku: "MIN-11", name: "Termo sin mínimo", price_unit: 20 },
      ]);
      expect(res.status).toBe(200);
      expect(res.body.data.summary.failed).toBe(0);
      expect((await publicProduct("MIN-10"))?.min_order_quantity).toBe(50);
      expect((await publicProduct("MIN-11"))?.min_order_quantity).toBeNull();
    });

    it("la subida masiva conserva el mínimo si no lo manda y lo quita con null", async () => {
      expect((await bulk([{ sku: "MIN-10", name: "Termo con mínimo editado" }])).status).toBe(200);
      expect((await publicProduct("MIN-10"))?.min_order_quantity).toBe(50);
      expect((await bulk([{ sku: "MIN-10", min_order_quantity: null }])).status).toBe(200);
      expect((await publicProduct("MIN-10"))?.min_order_quantity).toBeNull();
      expect((await bulk([{ sku: "MIN-10", min_order_quantity: 50 }])).status).toBe(200);
      expect((await publicProduct("MIN-10"))?.min_order_quantity).toBe(50);
    });

    it("la subida masiva rechaza un mínimo inválido", async () => {
      const res = await bulk([{ sku: "MIN-12", name: "Malo", price_unit: 1, min_order_quantity: 0 }]);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("un pedido de la web por debajo del mínimo se recibe y queda marcado", async () => {
      const res = await request(BASE_URL)
        .post("/api/public/quotation-request")
        .set("X-Api-Key", plainKey)
        .send({
          client: { phone: `9${String(Date.now()).slice(-8)}` },
          items: [
            { sku: "MIN-10", quantity: 30 },
            { sku: "MIN-11", quantity: 5 },
          ],
        });
      expect(res.status).toBe(201);
      const { quotation_id: quotationId, items_added: items, warnings } = res.body.data;
      const bySku = new Map(items.map((item: { sku: string }) => [item.sku, item]));
      expect(bySku.get("MIN-10")).toMatchObject({ quantity: 30, min_order_quantity: 50, below_min_order: true });
      expect(bySku.get("MIN-11")).toMatchObject({ quantity: 5, min_order_quantity: null, below_min_order: false });
      expect(warnings).toEqual(["Debajo del pedido mínimo: MIN-10 Termo con mínimo editado (se pidieron 30, mínimo 50)"]);

      // El equipo lo ve en la cotización: el item trae el mínimo y el Historial lo dice.
      const detail = (await api().get(`/quotation/find/${quotationId}`)).body.data;
      const item = detail.items.find((row: { product: { sku: string } }) => row.product.sku === "MIN-10");
      expect(item).toMatchObject({ quantity: 30, product: { min_order_quantity: 50 } });
      const created = detail.events.find((event: { action: string }) => event.action === "created");
      expect(created.description).toContain("Debajo del pedido mínimo: MIN-10");
    });

    it("en el mínimo o por encima no se marca", async () => {
      const res = await request(BASE_URL)
        .post("/api/public/quotation-request")
        .set("X-Api-Key", plainKey)
        .send({ client: { phone: `9${String(Date.now()).slice(-8)}` }, items: [{ sku: "MIN-10", quantity: 50 }] });
      expect(res.status).toBe(201);
      expect(res.body.data.items_added[0]).toMatchObject({ below_min_order: false, min_order_quantity: 50 });
      expect(res.body.data.warnings).toEqual([]);
    });
  });
});
