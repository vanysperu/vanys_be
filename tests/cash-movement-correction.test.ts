import { activateInvitedUser, authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { createQuotationFixture, createUnscopedCompanyAdmin } from "./helpers/fixtures";
import { queryRows } from "./helpers/db";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// Día de hoy en Lima (YYYY-MM-DD), desplazado `days` días.
const limaDate = (days = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

interface CashRow {
  source: string;
  source_id: number;
  direction: string;
  amount: number;
  occurred_at: string;
  payment_account_id: number | null;
  corrections_count: number;
}

interface CashSummary {
  income: number;
  expense: number;
  net: number;
  by_account: { payment_account_id: number | null; income: number; expense: number; net: number }[];
}

interface CorrectionRow {
  id: number;
  source_type: string;
  source_id: number;
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  reason: string;
  created_by: number;
  created_by_name: string | null;
  created_date: string;
  created_time: string;
}

const accountOf = (summary: CashSummary, accountId: number | null) =>
  summary.by_account.find((row) => row.payment_account_id === accountId) ?? { income: 0, expense: 0, net: 0 };

// Redondeo a céntimos para comparar sumas de montos sin ruido de punto flotante.
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Corregir un movimiento manual de Caja ("editar en el lugar + historial
 * inmutable"). Todo corre en una empresa QA nueva (nunca producción), así los
 * totales se comparan con valores exactos. Cada movimiento creado se anula al
 * final.
 */
describe("Corrección de movimientos manuales de Caja", () => {
  let token: string;
  let userId: number;
  let companyId: number;
  let bcpId: number;
  let yapeId: number;
  const createdMovementIds: number[] = [];

  const api = () => authedRequest(token);
  const cash = async (query = "") => {
    const res = await api().get(`/cash-movement/list?limit=100${query}`);
    expect(res.status).toBe(200);
    return { rows: res.body.data.data as CashRow[], summary: res.body.data.summary as CashSummary };
  };
  const createAccount = async (name: string, prefix: "bank" | "yape") => {
    const res = await api().post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta",
      prefix_id: prefix,
      name,
      ref1: "987654321",
      company_id: companyId,
    });
    expect(res.status).toBe(200);
    return res.body.data.id as number;
  };
  const createMovement = async (overrides: Record<string, unknown> = {}) => {
    const res = await api().post("/cash-movement/create", {
      direction: "income",
      category: "otro_ingreso",
      amount: 100,
      description: `Movimiento a corregir ${wordStamp().slice(0, 6)}`,
      occurred_at: limaDate(-1),
      payment_account_id: bcpId,
      ...overrides,
    });
    expect(res.status).toBe(201);
    const id = res.body.data.id as number;
    createdMovementIds.push(id);
    return id;
  };
  const correct = (id: number, body: Record<string, unknown>) => api().put(`/cash-movement/update/${id}`, body);
  const corrections = async (id: number) => {
    const res = await api().get(`/cash-movement/${id}/corrections?page=1&limit=20`);
    expect(res.status).toBe(200);
    return res.body.data as { data: CorrectionRow[]; meta: { total: number } };
  };

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await authedRequest(superToken).post("/company/create", {
      ruc: `209${Date.now().toString().slice(-8)}`,
      business_name: `FixCo ${wordStamp().slice(0, 8)}`,
    });
    companyId = company.body.data.id;
    const admin = await createUnscopedCompanyAdmin(superToken, companyId);
    token = admin.token;
    userId = admin.userId;
    bcpId = await createAccount("BCP Correccion", "bank");
    yapeId = await createAccount("Yape Correccion", "yape");
  });

  // Limpieza: se anula todo lo creado (Caja nunca se borra físicamente).
  afterAll(async () => {
    const { rows } = await cash("&source=manual");
    const active = new Set(rows.map((row) => row.source_id));
    for (const id of createdMovementIds.filter((movementId) => active.has(movementId))) {
      await api().put(`/cash-movement/disable/${id}`);
    }
  });

  it("corregir el monto mueve income/net y la cuenta exactamente por la diferencia (sin duplicar)", async () => {
    const before = await cash();
    const id = await createMovement({ amount: 100 });
    const afterCreate = await cash();
    expect(round2(afterCreate.summary.income - before.summary.income)).toBe(100);

    const res = await correct(id, { amount: 80.5, reason: "Se tipeó mal el monto del depósito" });
    expect(res.status).toBe(200);
    expect(res.body.data.changed_fields).toEqual(["amount"]);

    const after = await cash();
    // Delta exacto: -19.50 en ingresos y saldo, nada en egresos.
    expect(round2(after.summary.income - afterCreate.summary.income)).toBe(-19.5);
    expect(round2(after.summary.net - afterCreate.summary.net)).toBe(-19.5);
    expect(after.summary.expense).toBe(afterCreate.summary.expense);
    expect(round2(accountOf(after.summary, bcpId).income - accountOf(afterCreate.summary, bcpId).income)).toBe(-19.5);

    // La fila es una sola (no se duplicó), con el monto nuevo y el badge.
    const rows = after.rows.filter((row) => row.source === "manual" && row.source_id === id);
    expect(rows.length).toBe(1);
    expect(rows[0]?.amount).toBe(80.5);
    expect(rows[0]?.corrections_count).toBe(1);
  });

  it("un egreso corregido baja expense por la diferencia", async () => {
    const id = await createMovement({ direction: "expense", category: "otro_egreso", amount: 30 });
    const before = await cash();
    expect((await correct(id, { amount: 45, reason: "Faltaba la comisión del banco" })).status).toBe(200);
    const after = await cash();
    expect(round2(after.summary.expense - before.summary.expense)).toBe(15);
    expect(round2(after.summary.net - before.summary.net)).toBe(-15);
    expect(after.summary.income).toBe(before.summary.income);
  });

  it("cambiar la cuenta mueve el total de una cuenta a la otra, sin cambiar el total general", async () => {
    const id = await createMovement({ amount: 42 });
    const before = await cash();

    const res = await correct(id, { payment_account_id: yapeId, reason: "Entró por Yape, no por BCP" });
    expect(res.status).toBe(200);

    const after = await cash();
    expect(after.summary.income).toBe(before.summary.income);
    expect(after.summary.net).toBe(before.summary.net);
    expect(round2(accountOf(after.summary, bcpId).income - accountOf(before.summary, bcpId).income)).toBe(-42);
    expect(round2(accountOf(after.summary, yapeId).income - accountOf(before.summary, yapeId).income)).toBe(42);

    // Pasar a efectivo (null) también se puede corregir.
    expect((await correct(id, { payment_account_id: null, reason: "En realidad fue en efectivo" })).status).toBe(200);
    const cashAfter = await cash();
    expect(round2(accountOf(cashAfter.summary, null).income - accountOf(after.summary, null).income)).toBe(42);
    expect(round2(accountOf(cashAfter.summary, yapeId).income - accountOf(after.summary, yapeId).income)).toBe(-42);
  });

  it("el historial guarda valores previos y nuevos, quién y por qué; y escribe log en la misma operación", async () => {
    const id = await createMovement({ amount: 60, occurred_at: limaDate(-3) });
    const reason = "Fecha y monto equivocados en el registro";
    const res = await correct(id, { amount: 65, occurred_at: limaDate(-2), payment_account_id: yapeId, reason });
    expect(res.status).toBe(200);

    const history = await corrections(id);
    expect(history.meta.total).toBe(1);
    const [entry] = history.data;
    expect(entry?.previous_values).toEqual({
      amount: 60,
      occurred_at: limaDate(-3),
      payment_account_id: bcpId,
      payment_account_name: "BCP Correccion",
    });
    expect(entry?.new_values).toEqual({
      amount: 65,
      occurred_at: limaDate(-2),
      payment_account_id: yapeId,
      payment_account_name: "Yape Correccion",
    });
    expect(entry?.reason).toBe(reason);
    expect(entry?.created_by).toBe(userId);
    expect(entry?.created_by_name).toBeTruthy();
    expect(entry?.created_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry?.created_time).toMatch(/^\d{2}:\d{2}$/);

    // El módulo logs no tiene router montado: se verifica en la tabla.
    const logs = await queryRows<{ action: string; description: string }>(
      "SELECT action, description FROM `log` WHERE module = ? AND action = ? AND description LIKE ?",
      ["cash_movement", "UPDATE", `%#${id} (%`]
    );
    expect(logs.length).toBe(1);
    expect(logs[0]?.description).toContain(reason);
  });

  it("una corrección sin cambios es 400 y no deja historial", async () => {
    const id = await createMovement({ amount: 25 });
    const res = await correct(id, { amount: 25, payment_account_id: bcpId, reason: "Probando sin cambios" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_CHANGES");
    expect((await corrections(id)).meta.total).toBe(0);
  });

  it("sin motivo (o con uno demasiado corto) es 400", async () => {
    const id = await createMovement({ amount: 26 });
    expect((await correct(id, { amount: 27 })).status).toBe(400);
    expect((await correct(id, { amount: 27, reason: "   " })).status).toBe(400);
    expect((await correct(id, { amount: 27, reason: "abc" })).status).toBe(400);
    expect((await correct(id, { amount: 27, reason: "x".repeat(501) })).status).toBe(400);
  });

  it("el sentido (ingreso/egreso) no se corrige", async () => {
    const id = await createMovement({ amount: 28 });
    const res = await correct(id, { direction: "expense", reason: "Era un egreso, no un ingreso" });
    expect(res.status).toBe(400);
  });

  it("monto inválido (0, negativo, 3 decimales) es 400", async () => {
    const id = await createMovement({ amount: 29 });
    const reason = "Monto inválido de prueba";
    expect((await correct(id, { amount: 0, reason })).status).toBe(400);
    expect((await correct(id, { amount: -5, reason })).status).toBe(400);
    expect((await correct(id, { amount: 10.123, reason })).status).toBe(400);
    expect((await corrections(id)).meta.total).toBe(0);
  });

  it("fecha futura (en hora de Lima) es 400", async () => {
    const id = await createMovement({ amount: 31 });
    const res = await correct(id, { occurred_at: limaDate(1), reason: "Fecha futura de prueba" });
    expect(res.status).toBe(400);
  });

  it("un movimiento anulado es 409: primero se reactiva", async () => {
    const id = await createMovement({ amount: 32 });
    expect((await api().put(`/cash-movement/disable/${id}`)).status).toBe(200);

    const res = await correct(id, { amount: 33, reason: "Corregir uno anulado" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CASH_MOVEMENT_ANNULLED");
    expect((await corrections(id)).meta.total).toBe(0);
  });

  it("otra empresa no puede corregir ni ver el historial (404, sin confirmar que existe)", async () => {
    const id = await createMovement({ amount: 34 });
    const foreignToken = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    const foreign = authedRequest(foreignToken);

    expect((await foreign.put(`/cash-movement/update/${id}`, { amount: 1, reason: "Intento de otra empresa" })).status).toBe(404);
    expect((await foreign.get(`/cash-movement/${id}/corrections`)).status).toBe(404);

    const { rows } = await cash("&source=manual");
    expect(rows.find((row) => row.source_id === id)?.amount).toBe(34);
  });

  it("un pago (fuente no manual) no se corrige desde Caja", async () => {
    const { quotationId } = await createQuotationFixture(token, companyId);
    const payment = await api().post(`/quotation/${quotationId}/payments`, {
      amount: 10,
      method: "cash",
      paid_at: limaDate(),
    });
    expect(payment.status).toBe(201);
    const paymentId: number = payment.body.data.id;

    // El endpoint solo conoce la tabla cash_movement. Si por casualidad el id
    // del pago coincide con un movimiento manual NUESTRO, el caso no prueba
    // nada; con cualquier otro id (inexistente o de otra empresa) es 404.
    if (!createdMovementIds.includes(paymentId)) {
      const res = await correct(paymentId, { amount: 9, reason: "Intento de corregir un pago" });
      expect(res.status).toBe(404);
    }

    // El pago sigue intacto en Caja.
    const { rows } = await cash(`&quotationId=${quotationId}`);
    const paymentRow = rows.find((row) => row.source === "quotation_payment" && row.source_id === paymentId);
    expect(paymentRow?.amount).toBe(10);
    expect(paymentRow?.corrections_count).toBe(0);
  });

  it("una cuenta de otra empresa no se acepta al corregir", async () => {
    const id = await createMovement({ amount: 35 });

    // Se crea SIEMPRE una cuenta en otra empresa (antes el test salía en
    // silencio si la empresa ajena no tenía ninguna y no probaba nada).
    const superApi = authedRequest((await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token);
    const otherCompany = await superApi.post("/company/create", {
      ruc: `207${Date.now().toString().slice(-8)}`,
      business_name: `OtherCo ${wordStamp().slice(0, 8)}`,
    });
    expect(otherCompany.status).toBeLessThan(300);
    const foreignAccount = await superApi.post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta",
      prefix_id: "bank",
      name: "Cuenta ajena",
      ref1: "999",
      company_id: otherCompany.body.data.id,
    });
    expect(foreignAccount.status).toBe(200);
    const foreignAccountId: number = foreignAccount.body.data.id;
    expect(foreignAccountId).toBeGreaterThan(0);

    const res = await correct(id, { payment_account_id: foreignAccountId, reason: "Cuenta de otra empresa" });
    expect(res.status).toBe(403);
    expect((await corrections(id)).meta.total).toBe(0);
  });

  it("el historial genérico valida la fuente (?source=) y responde 404 para una fila ajena", async () => {
    const id = await createMovement({ amount: 36 });
    expect((await api().get(`/cash-movement/${id}/corrections?source=nope`)).status).toBe(400);

    // Mismo id pero en otra fuente: es otra fila (o no existe) -> nunca el historial del manual.
    const asPayment = await api().get(`/cash-movement/${id}/corrections?source=quotation_payment`);
    expect([200, 404]).toContain(asPayment.status);

    const foreignToken = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    expect((await authedRequest(foreignToken).get(`/cash-movement/${id}/corrections?source=manual`)).status).toBe(404);
  });
});

interface RoleTreeNode {
  id: number;
  code: string;
  children: RoleTreeNode[];
}

const flattenResourceTree = (modules: { resources: RoleTreeNode[] }[]): RoleTreeNode[] => {
  const walk = (nodes: RoleTreeNode[]): RoleTreeNode[] => nodes.flatMap((node) => [node, ...walk(node.children)]);
  return modules.flatMap((module) => walk(module.resources));
};

/**
 * Alcance de ESCRITURA (decisión 4): un gestor atado a una tienda con el
 * permiso "ver todas las tiendas" LEE las de su empresa pero solo crea,
 * corrige y anula en la suya. Se arma una empresa nueva con dos tiendas y un
 * rol propio con los botones de Caja + "ver todas las tiendas".
 */
describe("Caja: alcance de escritura de un gestor con 'ver todas las tiendas'", () => {
  let adminApi: ReturnType<typeof authedRequest>;
  let gestorApi: ReturnType<typeof authedRequest>;
  let storeAId: number;
  let storeBId: number;
  let movementInStoreB: number;

  beforeAll(async () => {
    // Un solo login del Super Administrador: cada login nuevo invalida la
    // sesión anterior del mismo usuario (y con ella el token de superApi).
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const superApi = authedRequest(superToken);
    const company = await superApi.post("/company/create", {
      ruc: `206${Date.now().toString().slice(-8)}`,
      business_name: `ScopeCo ${wordStamp().slice(0, 8)}`,
    });
    const companyId: number = company.body.data.id;
    const unitA = await superApi.post("/business-unit/create", {
      company_id: companyId,
      business_code: `SA-${wordStamp().slice(0, 6)}`,
    });
    const unitB = await superApi.post("/business-unit/create", {
      company_id: companyId,
      business_code: `SB-${wordStamp().slice(0, 6)}`,
    });
    storeAId = unitA.body.data.id;
    storeBId = unitB.body.data.id;

    // Admin de empresa sin tienda: crea el movimiento en la tienda B.
    const admin = await createUnscopedCompanyAdmin(superToken, companyId);
    adminApi = authedRequest(admin.token);
    const created = await adminApi.post("/cash-movement/create", {
      direction: "income",
      category: "otro_ingreso",
      amount: 50,
      occurred_at: limaDate(-1),
      business_unit_id: storeBId,
    });
    expect(created.status).toBe(201);
    movementInStoreB = created.body.data.id;

    // Rol propio con los botones de Caja y "ver todas las tiendas".
    const role = await superApi.post("/role/create", {
      name: `ScopeRole${wordStamp().slice(0, 8)}`,
      description: "Gestor de prueba con ver todas las tiendas",
      company_id: companyId,
    });
    expect(role.status).toBe(200);
    const roleId: number = role.body.data.id;
    const fullTree = await superApi.get("/roles/1/resources");
    const nodes = flattenResourceTree(fullTree.body.data.modules);
    const wanted = [
      "roles_access.viewAllBusinessUnits.button",
      "cash_movement.list.endpoint",
      "cash_movement.create.button",
      "cash_movement.update.button",
      "cash_movement.disable.button",
      "cash_movement.corrections.button",
    ].map((code) => nodes.find((node) => node.code === code)?.id);
    expect(wanted.every((id) => id !== undefined)).toBe(true);
    const saved = await superApi.put(`/roles/${roleId}/resources`, { resourceIds: { add: wanted, remove: [] } });
    expect(saved.status).toBe(200);

    // Usuario atado a la tienda A con ese rol.
    const stamp = wordStamp();
    const email = `scope.gestor.${stamp}@acme.test`;
    const createdUser = await superApi.post("/user/create", {
      name: "Scope",
      paternal_lastname: "Gestor",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email,
      status: true,
      gender: 4,
      company_id: companyId,
      business_unit_id: storeAId,
      roleIds: roleId,
    });
    expect(createdUser.status).toBe(200);
    gestorApi = authedRequest((await activateInvitedUser(createdUser.body, email, "Test1234")).token);
  });

  it("LEE las dos tiendas (ver todas), incluido el historial", async () => {
    const list = await gestorApi.get("/cash-movement/list?limit=100&source=manual");
    expect(list.status).toBe(200);
    const ids = (list.body.data.data as CashRow[]).map((row) => row.source_id);
    expect(ids).toContain(movementInStoreB);
    expect((await gestorApi.get(`/cash-movement/${movementInStoreB}/corrections?source=manual`)).status).toBe(200);
  });

  it("NO corrige ni anula un movimiento de otra tienda (404, aunque pueda verlo)", async () => {
    const update = await gestorApi.put(`/cash-movement/update/${movementInStoreB}`, {
      amount: 51,
      reason: "Intento en tienda ajena",
    });
    expect(update.status).toBe(404);
    expect((await gestorApi.put(`/cash-movement/disable/${movementInStoreB}`)).status).toBe(404);

    // Sigue intacto y activo para el admin.
    const rows = (await adminApi.get("/cash-movement/list?limit=100&source=manual")).body.data.data as CashRow[];
    const row = rows.find((item) => item.source_id === movementInStoreB);
    expect(row?.amount).toBe(50);
    expect(row?.corrections_count).toBe(0);
  });

  it("al crear, la tienda sale de su sesión: ignora el business_unit_id del body", async () => {
    const created = await gestorApi.post("/cash-movement/create", {
      direction: "expense",
      category: "otro_egreso",
      amount: 12,
      occurred_at: limaDate(-1),
      business_unit_id: storeBId,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.business_unit_id).toBe(storeAId);

    // En su propia tienda sí corrige y anula.
    const ownId: number = created.body.data.id;
    expect(
      (await gestorApi.put(`/cash-movement/update/${ownId}`, { amount: 13, reason: "Corrección en su tienda" })).status
    ).toBe(200);
    expect((await gestorApi.put(`/cash-movement/disable/${ownId}`)).status).toBe(200);
  });

  afterAll(async () => {
    await adminApi.put(`/cash-movement/disable/${movementInStoreB}`);
  });
});
