import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import {
  createPurchaseOrderFixture,
  createQuotationFixture,
  createUnscopedCompanyAdmin,
} from "./helpers/fixtures";
import { queryRows } from "./helpers/db";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

/**
 * Deshabilitar un cliente/producto/técnica significa "ya no se usa", pero
 * nada impedía seguir cotizándolo por API (el formulario ya no lo ofrece,
 * la API sí lo aceptaba). Las cotizaciones viejas que lo referencian se
 * siguen viendo completas — solo se bloquea usarlo en una NUEVA.
 */
describe("Catálogo deshabilitado no se puede usar en cotizaciones nuevas", () => {
  let token: string;
  let companyId: number;

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    const access = await authedRequest(token).get("/access/me");
    companyId = access.body.data.companyId;
  });

  const buildCatalog = async () => {
    const api = authedRequest(token);
    const stamp = wordStamp();

    const client = await api.post("/client/create", { company_id: companyId, name: `CatClient${stamp}` });
    const product = await api.post("/product/create", {
      company_id: companyId,
      name: `CatProduct${stamp}`,
      price_unit: 20,
    });
    const technique = await api.post("/customization-technique/create", {
      company_id: companyId,
      name: `CatTechnique${stamp}`,
      price_unit: 5,
    });

    return {
      clientId: client.body.data.id as number,
      productId: product.body.data.id as number,
      techniqueId: technique.body.data.id as number,
    };
  };

  const createQuotationWith = (clientId: number, productId: number, techniqueId: number) =>
    authedRequest(token).post("/quotation/create", {
      company_id: companyId,
      client_id: clientId,
      items: [{ product_id: productId, technique_id: techniqueId, quantity: 10, pricing_mode: "unit" }],
    });

  it("rechaza cotizar un producto deshabilitado", async () => {
    const { clientId, productId, techniqueId } = await buildCatalog();
    await authedRequest(token).put(`/product/disable/${productId}`);

    const res = await createQuotationWith(clientId, productId, techniqueId);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/deshabilitad/i);
  });

  it("rechaza cotizar a un cliente deshabilitado", async () => {
    const { clientId, productId, techniqueId } = await buildCatalog();
    await authedRequest(token).put(`/client/disable/${clientId}`);

    const res = await createQuotationWith(clientId, productId, techniqueId);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/deshabilitad/i);
  });

  it("rechaza cotizar una técnica deshabilitada", async () => {
    const { clientId, productId, techniqueId } = await buildCatalog();
    await authedRequest(token).put(`/customization-technique/disable/${techniqueId}`);

    const res = await createQuotationWith(clientId, productId, techniqueId);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/deshabilitad/i);
  });

  it("sigue permitiendo cotizar cuando todo el catálogo está activo", async () => {
    const { clientId, productId, techniqueId } = await buildCatalog();

    const res = await createQuotationWith(clientId, productId, techniqueId);
    expect(res.status).toBe(201);
  });
});

/**
 * Marcar un item como "ya no es necesario" cuando ya tiene compras reales
 * dejaba el gasto huérfano: la plata ya salió (y si fue del trabajador, ya
 * se le generó la deuda), pero el item quedaba como si nunca se hubiera
 * necesitado.
 */
describe("Item de orden de compra con compras ya registradas", () => {
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

  it("no deja marcarlo 'no necesario' si ya tiene una compra", async () => {
    const api = authedRequest(token);
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId, 10);

    const purchase = await api.post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 4,
      amount: 50,
      funding_source: "company",
    });
    expect(purchase.status).toBe(201);

    const res = await api.put(`/purchase-order/item/${itemId}/status`, { status: "not_needed" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/compras registradas/i);
  });

  it("sí lo deja marcar 'no necesario' cuando no tiene ninguna compra", async () => {
    const api = authedRequest(token);
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId, 10);

    const res = await api.put(`/purchase-order/item/${itemId}/status`, { status: "not_needed" });
    expect(res.status).toBe(200);
  });
});

/**
 * Los importes se calculaban en punto flotante y se devolvían crudos: la
 * respuesta inmediata de "crear" mostraba 59.97000000000001 aunque la BD
 * guardara 59.97 (DECIMAL(10,2)), así que el número cambiaba al recargar.
 */
describe("Importes redondeados a 2 decimales", () => {
  let token: string;
  let companyId: number;

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    const access = await authedRequest(token).get("/access/me");
    companyId = access.body.data.companyId;
  });

  const decimalsOf = (value: number) => (String(value).split(".")[1] ?? "").length;

  it("no devuelve decimales basura al sumar producto + técnica", async () => {
    const api = authedRequest(token);
    const stamp = wordStamp();

    const client = await api.post("/client/create", { company_id: companyId, name: `RoundClient${stamp}` });
    // (0.1 + 0.2) * 3 = 0.9000000000000001 en punto flotante.
    const product = await api.post("/product/create", {
      company_id: companyId,
      name: `RoundProduct${stamp}`,
      price_unit: 0.1,
    });
    const technique = await api.post("/customization-technique/create", {
      company_id: companyId,
      name: `RoundTechnique${stamp}`,
      price_unit: 0.2,
    });

    const created = await api.post("/quotation/create", {
      company_id: companyId,
      client_id: client.body.data.id,
      includes_igv: true,
      items: [
        {
          product_id: product.body.data.id,
          technique_id: technique.body.data.id,
          quantity: 3,
          pricing_mode: "unit",
        },
      ],
    });

    expect(created.status).toBe(201);
    expect(decimalsOf(Number(created.body.data.subtotal))).toBeLessThanOrEqual(2);
    expect(decimalsOf(Number(created.body.data.total))).toBeLessThanOrEqual(2);

    // Y lo devuelto al crear debe coincidir con lo que quedó guardado.
    const detail = await api.get(`/quotation/find/${created.body.data.id}`);
    expect(Number(detail.body.data.subtotal)).toBe(Number(created.body.data.subtotal));
    expect(Number(detail.body.data.total)).toBe(Number(created.body.data.total));
  });
});

/**
 * Caja es un libro contable: antes el toggle de anular/reactivar solo
 * volteaba is_deleted y pisaba updated_by/updated_at, así que no quedaba
 * historial de quién sacó o devolvió un monto.
 */
describe("Trazabilidad de caja", () => {
  let token: string;

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
  });

  it("deja un registro en el historial por cada anulación y reactivación", async () => {
    const api = authedRequest(token);

    const movement = await api.post("/cash-movement/create", {
      direction: "expense",
      category: "otro_egreso",
      amount: 123.45,
      description: "Movimiento de prueba de trazabilidad",
      occurred_at: "2026-10-17",
    });
    expect(movement.status).toBe(201);
    const movementId = movement.body.data.id;

    const disabled = await api.put(`/cash-movement/disable/${movementId}`);
    expect(disabled.status).toBe(200);
    const reenabled = await api.put(`/cash-movement/disable/${movementId}`);
    expect(reenabled.status).toBe(200);

    // El módulo `logs` no tiene su router montado, así que el historial solo
    // se puede verificar leyendo la tabla (ver helpers/db.ts).
    const rows = await queryRows<{ action: string; description: string }>(
      "SELECT action, description FROM `log` WHERE module = ? AND description LIKE ? ORDER BY id ASC",
      ["cash_movement", `%#${movementId}%`]
    );

    expect(rows.length).toBe(2);
    expect(rows[0]?.description).toMatch(/Anuló/);
    expect(rows[1]?.description).toMatch(/Reactivó/);
    expect(rows.every((row) => row.description.includes("123.45"))).toBe(true);
  });
});

/**
 * `resolveBusinessUnitFilter` devuelve undefined para un admin de empresa,
 * y los controllers caían al business_unit_id del body SIN validarlo: un
 * admin de la Empresa A podía crear un cliente o un movimiento de caja
 * apuntando a una tienda de la Empresa B. El registro quedaba huérfano
 * (ninguna vista por tienda lo mostraba, pero los totales de empresa sí lo
 * sumaban).
 */
describe("business_unit_id del body no puede ser de otra empresa", () => {
  let adminToken: string;
  let companyId: number;
  let foreignBusinessUnitId: number;

  beforeAll(async () => {
    const scopedAccess = await authedRequest(
      (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token
    ).get("/access/me");
    companyId = scopedAccess.body.data.companyId;

    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const superApi = authedRequest(superToken);

    // Admin de empresa SIN tienda propia: es el único perfil al que el
    // backend le respeta el business_unit_id del body (a un admin atado a
    // una tienda se le fuerza la suya, que ya era lo correcto).
    adminToken = (await createUnscopedCompanyAdmin(superToken, companyId)).token;

    const company = await superApi.post("/company/create", {
      ruc: `808${Date.now().toString().slice(-8)}`,
      business_name: `ForeignCo ${wordStamp().slice(0, 8)}`,
    });
    const unit = await superApi.post("/business-unit/create", {
      company_id: company.body.data.id,
      business_code: `FOREIGN-${wordStamp().slice(0, 6)}`,
    });
    foreignBusinessUnitId = unit.body.data.id;
  });

  it("precondición: la tienda ajena existe", () => {
    expect(foreignBusinessUnitId).toBeGreaterThan(0);
  });

  it("rechaza crear un cliente en una tienda de otra empresa", async () => {
    const res = await authedRequest(adminToken).post("/client/create", {
      company_id: companyId,
      name: `Foreign${wordStamp().slice(0, 8)}`,
      business_unit_id: foreignBusinessUnitId,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/tienda/i);
  });

  it("rechaza crear un movimiento de caja en una tienda de otra empresa", async () => {
    const res = await authedRequest(adminToken).post("/cash-movement/create", {
      direction: "income",
      category: "otro_egreso",
      amount: 10,
      occurred_at: "2026-10-17",
      business_unit_id: foreignBusinessUnitId,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/tienda/i);
  });

  it("sigue permitiendo crear en la tienda propia", async () => {
    const units = await authedRequest(adminToken).get("/business-unit/list?page=1&limit=1");
    const ownBusinessUnitId = units.body.data.data[0].id;

    const res = await authedRequest(adminToken).post("/client/create", {
      company_id: companyId,
      name: `Own${wordStamp().slice(0, 8)}`,
      business_unit_id: ownBusinessUnitId,
    });

    expect(res.status).toBe(201);
  });
});
