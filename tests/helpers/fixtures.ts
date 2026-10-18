import { authedRequest, login, wordStamp } from "./apiClient";

const ADMIN_ROLE_ID = 2;
const TEMPORARY_PASSWORD = "123456"; // DEFAULT_TEMPORARY_PASSWORD del backend

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
export async function createQuotationFixture(token: string, companyId: number) {
  const api = authedRequest(token);
  const stamp = wordStamp();

  const client = await api.post("/client/create", { company_id: companyId, name: `TestClient${stamp}` });
  const product = await api.post("/product/create", {
    company_id: companyId,
    name: `TestProduct${stamp}`,
    price_unit: 20,
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
