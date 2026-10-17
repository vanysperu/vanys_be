import { authedRequest, login, wordStamp } from "./helpers/apiClient";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const ADMIN_ROLE_ID = 2;

// Bug real encontrado en auditoría: nada impedía deshabilitar al único
// usuario con rol Administrador de una empresa, dejándola sin nadie que
// pueda volver a gestionar usuarios/roles (solo recuperable vía soporte de
// plataforma). Se arma una empresa nueva, aislada, solo para este test.
describe("Guard del último Administrador activo de una empresa", () => {
  let superadminToken: string;
  let companyId: number;
  let soleAdminId: number;

  beforeAll(async () => {
    const auth = await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password);
    superadminToken = auth.token;
    const api = authedRequest(superadminToken);

    const stamp = wordStamp();
    const company = await api.post("/company/create", {
      ruc: `909${Date.now().toString().slice(-8)}`,
      business_name: `LastAdminTest ${stamp}`,
    });
    companyId = company.body.data.id;

    const user = await api.post("/user/create", {
      name: "Sole",
      paternal_lastname: "Admin",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email: `sole.admin.${stamp}@last-admin-test.com`,
      status: true,
      gender: 4,
      company_id: companyId,
      roles: [ADMIN_ROLE_ID],
      roleIds: ADMIN_ROLE_ID,
    });
    soleAdminId = user.body.data.id;
  });

  it("rechaza deshabilitar al único Administrador activo de la empresa", async () => {
    const api = authedRequest(superadminToken);
    const res = await api.put(`/user/disable/${soleAdminId}`);
    expect(res.status).toBe(409);
  });

  it("permite deshabilitarlo una vez que hay otro Administrador activo", async () => {
    const api = authedRequest(superadminToken);
    const stamp = wordStamp();
    const secondAdmin = await api.post("/user/create", {
      name: "Second",
      paternal_lastname: "Admin",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email: `second.admin.${stamp}@last-admin-test.com`,
      status: true,
      gender: 4,
      company_id: companyId,
      roles: [ADMIN_ROLE_ID],
      roleIds: ADMIN_ROLE_ID,
    });
    expect(secondAdmin.status).toBe(200);

    const res = await api.put(`/user/disable/${soleAdminId}`);
    expect(res.status).toBe(200);
  });
});
