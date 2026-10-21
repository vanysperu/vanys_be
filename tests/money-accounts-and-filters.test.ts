import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { createPurchaseOrderFixture, createQuotationFixture } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface CashRow {
  source: string;
  source_id: number;
  quotation_id: number | null;
  payment_account_id: number | null;
  payment_account_name: string | null;
  paid_by_employee_name: string | null;
  reimbursement_status: "pending" | "paid" | null;
  reimbursed_at: string | null;
}

/**
 * Cambios pedidos por el usuario sobre dinero (cuentas, caja, deudas),
 * precios de técnica por escala y filtros de listados.
 */
describe("Cuentas de dinero, precios de técnica y filtros", () => {
  let token: string;
  let userId: number;
  let companyId: number;
  let accountId: number;
  let accountName: string;

  beforeAll(async () => {
    const auth = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = auth.token;
    userId = auth.userId;
    companyId = (await authedRequest(token).get("/access/me")).body.data.companyId;

    accountName = `Banco Test ${wordStamp().slice(0, 8)}`;
    const account = await authedRequest(token).post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta",
      prefix_id: "bank",
      name: accountName,
      ref1: "191-0000000-0-00",
      company_id: companyId,
    });
    // variable_general/create responde 200 (contrato ya existente del módulo).
    expect(account.status).toBe(200);
    accountId = account.body.data.id;
  });

  // La cuenta de prueba se deshabilita al final: una cuenta activa hace
  // obligatorio elegir cuenta en los pagos no-efectivo del resto de suites.
  afterAll(async () => {
    await authedRequest(token).put(`/variable_general/disable/${accountId}`);
  });

  describe("Precio de técnica por escala (igual que producto)", () => {
    it("(precio ciento del producto + precio ciento de la técnica) × cantidad — jabón 0.90 + serigrafía 0.95 × 10 = 18.50", async () => {
      const api = authedRequest(token);
      const stamp = wordStamp();
      const client = await api.post("/client/create", { company_id: companyId, name: `Jabon${stamp}` });
      const product = await api.post("/product/create", {
        company_id: companyId,
        name: `Jabon${stamp}`,
        price_unit: 1.2,
        price_hundred: 0.9,
        requires_customization: true,
      });
      const technique = await api.post("/customization-technique/create", {
        company_id: companyId,
        name: `Serigrafia${stamp}`,
        price_unit: 1.5,
        price_hundred: 0.95,
      });
      expect(technique.status).toBe(201);

      const created = await api.post("/quotation/create", {
        company_id: companyId,
        client_id: client.body.data.id,
        items: [
          { product_id: product.body.data.id, technique_id: technique.body.data.id, quantity: 10, pricing_mode: "hundred" },
        ],
      });
      expect(created.status).toBe(201);

      const detail = await api.get(`/quotation/find/${created.body.data.id}`);
      const item = detail.body.data.items[0];
      expect(Number(item.unit_price)).toBe(1.85);
      expect(Number(item.subtotal)).toBe(18.5);
    });

    it("rechaza cotizar en una escala para la que la técnica no tiene precio", async () => {
      const api = authedRequest(token);
      const stamp = wordStamp();
      const client = await api.post("/client/create", { company_id: companyId, name: `NoTier${stamp}` });
      const product = await api.post("/product/create", {
        company_id: companyId,
        name: `NoTier${stamp}`,
        price_unit: 2,
        price_thousand: 0.5,
        requires_customization: true,
      });
      const technique = await api.post("/customization-technique/create", {
        company_id: companyId,
        name: `NoTierTech${stamp}`,
        price_unit: 1,
      });

      const res = await api.post("/quotation/create", {
        company_id: companyId,
        client_id: client.body.data.id,
        items: [
          { product_id: product.body.data.id, technique_id: technique.body.data.id, quantity: 1000, pricing_mode: "thousand" },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/técnica .* no tiene cargado un precio por millar/i);
    });

    it("exige al menos un precio al crear una técnica", async () => {
      const res = await authedRequest(token).post("/customization-technique/create", {
        company_id: companyId,
        name: `SinPrecio${wordStamp()}`,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Pagos recibidos: a qué cuenta entró el dinero", () => {
    it("exige la cuenta cuando el pago no es en efectivo y la empresa tiene cuentas", async () => {
      const { quotationId } = await createQuotationFixture(token, companyId);
      const res = await authedRequest(token).post(`/quotation/${quotationId}/payments`, {
        amount: 10,
        method: "yape",
        operation_number: "OP123",
        paid_at: "2026-10-18",
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PAYMENT_ACCOUNT_REQUIRED");
    });

    it("guarda la cuenta, la muestra en el listado y permite filtrar por ella", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);
      const created = await api.post(`/quotation/${quotationId}/payments`, {
        amount: 15,
        method: "transfer",
        operation_number: "OP456",
        paid_at: "2026-10-18",
        payment_account_id: accountId,
      });
      expect(created.status).toBe(201);
      const paymentId: number = created.body.data.id;

      const byAccount = await api.get(`/payment/list?limit=100&paymentAccountId=${accountId}`);
      const found = byAccount.body.data.data.find((row: { id: number }) => row.id === paymentId);
      expect(found?.payment_account_name).toBe(accountName);

      const onlyCash = await api.get("/payment/list?limit=100&paymentAccountId=cash");
      expect(onlyCash.body.data.data.some((row: { id: number }) => row.id === paymentId)).toBe(false);
    });

    it("rechaza una cuenta de otra empresa", async () => {
      const superApi = authedRequest((await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token);
      const company = await superApi.post("/company/create", {
        ruc: `207${Date.now().toString().slice(-8)}`,
        business_name: `AccountCo ${wordStamp().slice(0, 8)}`,
      });
      const foreign = await superApi.post("/variable_general/create", {
        category: "payment_account",
        title: "Cuenta",
        prefix_id: "bank",
        name: "Cuenta ajena",
        ref1: "000",
        company_id: company.body.data.id,
      });
      expect(foreign.status).toBe(200);

      const { quotationId } = await createQuotationFixture(token, companyId);
      const res = await authedRequest(token).post(`/quotation/${quotationId}/payments`, {
        amount: 10,
        method: "transfer",
        operation_number: "OP789",
        paid_at: "2026-10-18",
        payment_account_id: foreign.body.data.id,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("Caja: cuenta de ingresos/egresos y reposición a trabajadores", () => {
    it("un movimiento manual guarda su cuenta y se puede filtrar por cuenta", async () => {
      const api = authedRequest(token);
      const created = await api.post("/cash-movement/create", {
        direction: "income",
        category: "otro_ingreso",
        amount: 77.7,
        description: "Ingreso a banco de prueba",
        occurred_at: "2026-10-18",
        payment_account_id: accountId,
      });
      expect(created.status).toBe(201);
      const movementId: number = created.body.data.id;

      const list = await api.get(`/cash-movement/list?limit=100&source=manual&paymentAccountId=${accountId}`);
      const row = (list.body.data.data as CashRow[]).find((item) => item.source_id === movementId);
      expect(row?.payment_account_name).toBe(accountName);

      const cashOnly = await api.get("/cash-movement/list?limit=100&source=manual&paymentAccountId=cash");
      expect((cashOnly.body.data.data as CashRow[]).some((item) => item.source_id === movementId)).toBe(false);
    });

    it("el gasto pagado por un trabajador dice quién lo pagó, y al reponerle queda la fecha y la cuenta", async () => {
      const api = authedRequest(token);
      const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
      const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);
      const purchase = await api.post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 5,
        amount: 33,
        funding_source: "employee",
      });
      expect(purchase.status).toBe(201);

      const findExpense = async () => {
        const list = await api.get(`/cash-movement/list?limit=100&source=quotation_expense&quotationId=${quotationId}`);
        return (list.body.data.data as CashRow[])[0];
      };

      const before = await findExpense();
      expect(before?.paid_by_employee_name).toBeTruthy();
      expect(before?.reimbursement_status).toBe("pending");

      const paid = await api.put(`/employee-debt/pay/${userId}`, { payment_account_id: accountId });
      expect(paid.status).toBe(200);

      const after = await findExpense();
      expect(after?.reimbursement_status).toBe("paid");
      expect(after?.reimbursed_at).toBeTruthy();
      expect(after?.payment_account_name).toBe(accountName);
    });
  });

  describe("Deudas a personal: filtro de estado", () => {
    it("por defecto lista solo pendientes; 'paid' muestra a quien ya se le repuso", async () => {
      const api = authedRequest(token);
      const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
      const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);
      await api.post(`/purchase-order/item/${itemId}/purchases`, { quantity: 2, amount: 12, funding_source: "employee" });

      const pending = await api.get(`/employee-debt/list?userId=${userId}`);
      expect(pending.body.data.data.some((row: { user_id: number }) => row.user_id === userId)).toBe(true);

      await api.put(`/employee-debt/pay/${userId}`, {});

      const pendingAfter = await api.get(`/employee-debt/list?userId=${userId}`);
      expect(pendingAfter.body.data.data.some((row: { user_id: number }) => row.user_id === userId)).toBe(false);

      const paid = await api.get(`/employee-debt/list?status=paid&userId=${userId}`);
      const row = paid.body.data.data.find((item: { user_id: number }) => item.user_id === userId);
      expect(Number(row?.paid_amount)).toBeGreaterThanOrEqual(12);
      expect(row?.last_paid_at).toBeTruthy();
    });
  });

  describe("Teléfono de cliente: entre 6 y 9 dígitos", () => {
    it.each([
      ["12345", 400],
      ["1234567890", 400],
      ["123456", 201],
      ["987654321", 201],
    ])("teléfono %s → %i", async (phone, expected) => {
      const res = await authedRequest(token).post("/client/create", {
        company_id: companyId,
        name: `Phone${wordStamp()}`,
        phone,
      });
      expect(res.status).toBe(expected);
    });
  });

  describe("Filtros de listados", () => {
    it("filtra clientes por estado (activo/inactivo)", async () => {
      const api = authedRequest(token);
      const name = `Estado${wordStamp()}`;
      const client = await api.post("/client/create", { company_id: companyId, name });
      await api.put(`/client/disable/${client.body.data.id}`);

      const inactive = await api.get(`/client/list?name=${name}&status=inactive`);
      expect(inactive.body.data.data).toHaveLength(1);
      const active = await api.get(`/client/list?name=${name}&status=active`);
      expect(active.body.data.data).toHaveLength(0);
    });

    it("filtra cotizaciones por rango de fecha de emisión", async () => {
      const api = authedRequest(token);
      const { quotationId } = await createQuotationFixture(token, companyId);

      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
      const inRange = await api.get(`/quotation/list?limit=100&dateFrom=${today}&dateTo=${today}`);
      expect(inRange.body.data.data.some((row: { id: number }) => row.id === quotationId)).toBe(true);

      const past = await api.get("/quotation/list?limit=100&dateFrom=2020-01-01&dateTo=2020-01-31");
      expect(past.body.data.data.some((row: { id: number }) => row.id === quotationId)).toBe(false);
    });
  });

  it("el menú de un usuario de empresa empieza con 'Inicio'", async () => {
    const access = await authedRequest(token).get("/access/me");
    const firstModule = access.body.data.views[0];
    expect(firstModule.code).toBe("inicio");
    expect(firstModule.views[0].route).toBe("/");
  });
});
