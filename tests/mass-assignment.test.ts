import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { createQuotationFixture } from "./helpers/fixtures";

// Bug real encontrado en auditoría: varios endpoints de "editar" pasaban
// req.body completo al UPDATE de Sequelize sin filtrar qué columnas se
// pueden escribir. Como company_id/business_unit_id/client_id son columnas
// reales del modelo, un admin podía, al editar SU PROPIO registro, mandar
// el company_id de otra empresa en el body y "secuestrar" ese registro
// (con efecto cascada sobre tienda/cotización) hacia otra empresa. Estos
// tests confirman que esos campos ahora se ignoran silenciosamente.
describe("Mass assignment — campos sensibles no editables vía body", () => {
  let token: string;
  let companyId: number;
  const FOREIGN_ID = 999999; // no existe — si el fix fallara, el UPDATE fallaría por FK o aplicaría el cambio

  beforeAll(async () => {
    const auth = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = auth.token;
    const access = await authedRequest(token).get("/access/me");
    companyId = access.body.data.companyId;
  });

  it("PUT /business-unit/update/:id ignora company_id del body", async () => {
    const api = authedRequest(token);
    // Tienda propia creada para este test — nunca reusar/mutar la tienda
    // real "ACME-QA" (otros specs, backend y E2E, dependen de ese nombre).
    const created = await api.post("/business-unit/create", {
      company_id: companyId,
      business_code: `BU-TEST-${wordStamp()}`,
    });
    const businessUnitId: number = created.body.data.id;

    const res = await api.put(`/business-unit/update/${businessUnitId}`, {
      business_code: `BU-TEST-EDITED-${wordStamp()}`,
      company_id: FOREIGN_ID,
    });
    expect(res.status).toBe(200);

    const after = await api.get("/business-unit/list?limit=200");
    const found = after.body.data.data.find((row: { id: number }) => row.id === businessUnitId);
    expect(found.company_id).toBe(companyId);
  });

  it("PUT /quotation/update/:id ignora company_id/business_unit_id/client_id/status/total del body", async () => {
    const api = authedRequest(token);
    const { quotationId } = await createQuotationFixture(token, companyId);

    const res = await api.put(`/quotation/update/${quotationId}`, {
      notes: "nota legítima",
      company_id: FOREIGN_ID,
      business_unit_id: FOREIGN_ID,
      client_id: FOREIGN_ID,
      status: "finished",
      total: 1,
      total_paid: 999999,
    });
    expect(res.status).toBe(200);

    const after = await api.get(`/quotation/find/${quotationId}`);
    expect(after.body.data.company_id).toBe(companyId);
    expect(after.body.data.notes).toBe("nota legítima");
    expect(after.body.data.status).toBe("pending"); // nunca cambió por este endpoint
    expect(Number(after.body.data.total)).not.toBe(1);
    expect(Number(after.body.data.total_paid)).toBe(0);
  });

  it("PUT /client/update/:id ignora company_id/business_unit_id del body", async () => {
    const api = authedRequest(token);
    const created = await api.post("/client/create", { company_id: companyId, name: `MassAssign${wordStamp()}` });
    const clientId: number = created.body.data.id;

    const res = await api.put(`/client/update/${clientId}`, {
      name: `MassAssignEdited${wordStamp()}`,
      company_id: FOREIGN_ID,
      business_unit_id: FOREIGN_ID,
    });
    expect(res.status).toBe(200);

    const list = await api.get("/client/list?limit=200");
    const found = list.body.data.data.find((row: { id: number }) => row.id === clientId);
    expect(found.company_id).toBe(companyId);
  });

  it("PUT /product/update/:id ignora company_id del body", async () => {
    const api = authedRequest(token);
    const created = await api.post("/product/create", {
      company_id: companyId,
      name: `MassAssignProd${wordStamp()}`,
      price_unit: 10,
    });
    const productId: number = created.body.data.id;

    const res = await api.put(`/product/update/${productId}`, { name: `Edited${wordStamp()}`, company_id: FOREIGN_ID });
    expect(res.status).toBe(200);

    const list = await api.get("/product/list?limit=200");
    const found = list.body.data.data.find((row: { id: number }) => row.id === productId);
    expect(found.company_id).toBe(companyId);
  });

  it("PUT /customization-technique/update/:id ignora company_id del body", async () => {
    const api = authedRequest(token);
    const created = await api.post("/customization-technique/create", {
      company_id: companyId,
      name: `MassAssignTech${wordStamp()}`,
      price_unit: 5,
    });
    const techniqueId: number = created.body.data.id;

    const res = await api.put(`/customization-technique/update/${techniqueId}`, {
      name: `Edited${wordStamp()}`,
      company_id: FOREIGN_ID,
    });
    expect(res.status).toBe(200);

    const list = await api.get("/customization-technique/list?limit=200");
    const found = list.body.data.data.find((row: { id: number }) => row.id === techniqueId);
    expect(found.company_id).toBe(companyId);
  });
});
