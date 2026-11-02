import { authedRequest, login, wordStamp } from "./apiClient";

const ADMIN_ROLE_ID = 2;
const GESTOR_ROLE_ID = 6; // rol plantilla "Gestor" (20260928110000-seed-gestor-role.js)
const TEMPORARY_PASSWORD = "123456"; // DEFAULT_TEMPORARY_PASSWORD del backend
const READY_PASSWORD = "Test1234";

// Primer login con la contraseña temporal + cambio obligatorio + login final.
async function activateUser(email: string): Promise<{ token: string; userId: number }> {
  const first = await login(email, TEMPORARY_PASSWORD);
  const changed = await authedRequest(first.token)
    .patch("/user/change/password", { oldPassword: TEMPORARY_PASSWORD, newPassword: READY_PASSWORD });
  if (changed.status !== 200) {
    throw new Error(`no se pudo cambiar la contraseña temporal: ${JSON.stringify(changed.body)}`);
  }
  return login(email, READY_PASSWORD);
}

export interface CashClosingTestUser {
  token: string;
  userId: number;
  email: string;
}

export interface CashClosingTestCompany {
  companyId: number;
  companyName: string;
  storeId: number;
  // Administrador de empresa sin tienda (rol plantilla Administrador: recibe
  // todos los recursos cash_closing.* por el seeder 20261102100100).
  admin: CashClosingTestUser;
  // Gestor atado a `storeId` (rol plantilla Gestor: solo cash_closing.status.endpoint).
  gestor: CashClosingTestUser;
  // Administrador CON tienda (`storeId`): el cierre es por rol, así que igual
  // ve y cierra la caja de toda su empresa ("todo admin ve lo de su empresa").
  storeAdmin: CashClosingTestUser;
  bankAccountId: number; // "BCP Cierre <stamp>"
  yapeAccountId: number; // "Yape Cierre <stamp>"
}

/**
 * Empresa DESECHABLE para probar el cierre de caja: "QA Cierre <stamp>" +
 * una tienda + admin sin tienda + gestor atado a la tienda + 2 cuentas (banco
 * y Yape). Los cierres no se pueden borrar, así que cada corrida usa una
 * empresa nueva — NUNCA configurar la caja de "Acme Corp QA" (rompería los
 * fixtures con fechas pasadas de las demás suites).
 *
 * `superToken`: un solo login del Super Administrador por suite (cada login
 * nuevo invalida la sesión anterior del mismo usuario).
 */
export async function createCashClosingTestCompany(superToken: string): Promise<CashClosingTestCompany> {
  const superApi = authedRequest(superToken);
  const stamp = wordStamp().slice(0, 10);

  const companyName = `QA Cierre ${stamp}`;
  const company = await superApi.post("/company/create", {
    ruc: `207${Date.now().toString().slice(-8)}`,
    business_name: companyName,
  });
  // Las altas de empresa y tienda responden 201 (company/business_unit controllers).
  if (company.status !== 201) throw new Error(`no se pudo crear la empresa: ${JSON.stringify(company.body)}`);
  const companyId: number = company.body.data.id;

  const store = await superApi.post("/business-unit/create", {
    company_id: companyId,
    business_code: `QC-${stamp.slice(0, 6)}`,
  });
  if (store.status !== 201) throw new Error(`no se pudo crear la tienda: ${JSON.stringify(store.body)}`);
  const storeId: number = store.body.data.id;

  const admin = await createUnscopedCompanyAdmin(superToken, companyId);

  // Usuario de la empresa atado a `storeId` con el rol indicado.
  const createStoreUser = async (label: string, roleId: number): Promise<CashClosingTestUser> => {
    const email = `cierre.${label.toLowerCase()}.${wordStamp()}@acme.test`;
    const created = await superApi.post("/user/create", {
      name: "Cierre",
      paternal_lastname: label,
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email,
      status: true,
      gender: 4,
      company_id: companyId,
      business_unit_id: storeId,
      roleIds: roleId,
    });
    if (created.status !== 200) {
      throw new Error(`no se pudo crear el usuario ${label}: ${JSON.stringify(created.body)}`);
    }
    return { ...(await activateUser(email)), email };
  };
  const gestor = await createStoreUser("Gestor", GESTOR_ROLE_ID);
  const storeAdmin = await createStoreUser("Tienda", ADMIN_ROLE_ID);

  const adminApi = authedRequest(admin.token);
  const createAccount = async (name: string, prefix: "bank" | "yape"): Promise<number> => {
    const res = await adminApi.post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta",
      prefix_id: prefix,
      name,
      ref1: "123",
      company_id: companyId,
    });
    if (res.status !== 200) throw new Error(`no se pudo crear la cuenta ${name}: ${JSON.stringify(res.body)}`);
    return res.body.data.id as number;
  };

  return {
    companyId,
    companyName,
    storeId,
    admin,
    gestor,
    storeAdmin,
    bankAccountId: await createAccount(`BCP Cierre ${stamp.slice(0, 6)}`, "bank"),
    yapeAccountId: await createAccount(`Yape Cierre ${stamp.slice(0, 6)}`, "yape"),
  };
}

/**
 * Crea un Administrador de empresa SIN tienda asignada y devuelve su token
 * ya utilizable.
 *
 * Importa el matiz: los usuarios sembrados por seed-qa están todos atados a
 * una tienda (`scoped: true`), y para ellos el backend FUERZA su propia
 * tienda e ignora lo que venga en el body — que es justo el comportamiento
 * correcto. El perfil que de verdad puede mandar un `business_unit_id`
 * arbitrario es el admin de empresa sin tienda propia, así que varios
 * guards solo se pueden probar con un usuario así.
 *
 * Solo un is_system puede crear un usuario sin tienda, de ahí el
 * `superToken`. El usuario nace con must_change_password, así que hay que
 * pasar por el cambio de contraseña antes de poder usar el resto de la API.
 */
export async function createUnscopedCompanyAdmin(
  superToken: string,
  companyId: number
): Promise<{ token: string; userId: number; email: string }> {
  const stamp = wordStamp();
  const email = `unscoped.admin.${stamp}@acme.test`;
  const password = "Test1234";

  const created = await authedRequest(superToken).post("/user/create", {
    name: "Unscoped",
    paternal_lastname: "Admin",
    document_type: 1,
    document_number: `${Date.now()}`.slice(-8),
    date_of_birth: "01/01/1990",
    email,
    status: true,
    gender: 4,
    company_id: companyId,
    roleIds: ADMIN_ROLE_ID,
  });
  if (created.status !== 200) {
    throw new Error(`no se pudo crear el admin sin tienda: ${JSON.stringify(created.body)}`);
  }

  const first = await login(email, TEMPORARY_PASSWORD);
  const changed = await authedRequest(first.token)
    .patch("/user/change/password", { oldPassword: TEMPORARY_PASSWORD, newPassword: password });
  if (changed.status !== 200) {
    throw new Error(`no se pudo cambiar la contraseña temporal: ${JSON.stringify(changed.body)}`);
  }

  const ready = await login(email, password);
  return { token: ready.token, userId: ready.userId, email };
}

// Crea cliente + producto + técnica + cotización con un item — el mismo
// setup mínimo que necesita cualquier test de pagos/compras/deudas.
// La deja Aceptada (sin adelanto) por defecto: solo una cotización aceptada o
// en curso admite pagos, gastos, órdenes de compra y compras. accepted: false
// la deja Pendiente (para probar aceptar, rechazar o el adelanto).
export async function createQuotationFixture(token: string, companyId: number, options: { accepted?: boolean } = {}) {
  const api = authedRequest(token);
  const stamp = wordStamp();

  const client = await api.post("/client/create", { company_id: companyId, name: `TestClient${stamp}` });
  const product = await api.post("/product/create", {
    company_id: companyId,
    name: `TestProduct${stamp}`,
    price_unit: 20,
    requires_customization: true,
  });
  const technique = await api.post("/customization-technique/create", {
    company_id: companyId,
    name: `TestTechnique${stamp}`,
    price_unit: 5,
  });

  const quotation = await api.post("/quotation/create", {
    company_id: companyId,
    client_id: client.body.data.id,
    items: [{ product_id: product.body.data.id, technique_id: technique.body.data.id, quantity: 10, pricing_mode: "unit" }],
  });

  const quotationId: number = quotation.body.data.id;
  if (options.accepted ?? true) {
    const accepted = await api.put(`/quotation/status/${quotationId}`, { status: "accepted" });
    if (accepted.status !== 200) throw new Error(`no se pudo aceptar la cotización: ${JSON.stringify(accepted.body)}`);
  }
  const detail = await api.get(`/quotation/find/${quotationId}`);
  const quotationItemId: number = detail.body.data.items[0].id;

  return { quotationId, quotationItemId };
}

export async function createPurchaseOrderFixture(
  token: string,
  companyId: number,
  assignedTo: number,
  quotationId: number,
  quotationItemId: number,
  quantity = 10
) {
  const api = authedRequest(token);
  const created = await api.post("/purchase-order/create", {
    company_id: companyId,
    quotation_id: quotationId,
    assigned_to: assignedTo,
    items: [{ quotation_item_id: quotationItemId, quantity }],
  });
  const purchaseOrderId: number = created.body.data.id;

  const detail = await api.get(`/purchase-order/find/${purchaseOrderId}`);
  const itemId: number = detail.body.data.items[0].id;

  return { purchaseOrderId, itemId };
}
