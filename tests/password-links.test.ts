import request from "supertest";
import { createHash } from "crypto";
import { activateInvitedUser, authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createUnscopedCompanyAdmin } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const GESTOR_ROLE_ID = 6;

const tokenOf = (url: string) => decodeURIComponent(String(url).split("#token=")[1] ?? "");
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const complete = (token: string, password: string) =>
  request(BASE_URL).post("/api/password/link/complete").send({ token, password });
const check = (token: string) => request(BASE_URL).post("/api/password/link/check").send({ token });

/**
 * Sprint 2, ítem 4 (pedido explícito del usuario: "yo no quiero códigos,
 * quiero que llegue link para crear contraseña o link para recuperarla").
 * Usa empresas y administradores desechables: nunca inicia sesión con las
 * cuentas QA que el equipo usa a mano.
 */
describe("Enlaces para crear o recuperar la contraseña", () => {
  let superToken: string;
  let companyId: number;
  let otherCompanyId: number;
  let admin: { token: string; userId: number; email: string };
  let otherAdmin: { token: string; userId: number; email: string };
  const stamp = String(Date.now());

  const createCompany = async (suffix: string) => {
    const res = await authedRequest(superToken).post("/company/create", {
      ruc: `20${stamp.slice(-8)}${suffix}`,
      business_name: `Claves ${suffix} ${stamp}`,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  const createUser = async (token: string, email: string) => {
    const units = await authedRequest(superToken).post("/business-unit/create", {
      business_code: `T-${wordStamp()}`,
      address: "Av. Prueba 123",
      company_id: companyId,
    });
    expect(units.status).toBe(201);
    return authedRequest(token).post("/user/create", {
      name: "Clave",
      paternal_lastname: "Enlace",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email,
      status: true,
      gender: 4,
      company_id: companyId,
      business_unit_id: units.body.data.id,
      roleIds: GESTOR_ROLE_ID,
    });
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    companyId = await createCompany("1");
    otherCompanyId = await createCompany("2");
    admin = await createUnscopedCompanyAdmin(superToken, companyId);
    otherAdmin = await createUnscopedCompanyAdmin(superToken, otherCompanyId);
  });

  it("las rutas viejas /recovery/* ya no existen (caen al router con sesión)", async () => {
    for (const path of ["/api/recovery/send-code", "/api/recovery/verify-code", "/api/recovery/user-account"]) {
      const res = await request(BASE_URL).post(path).send({ email: admin.email, verificationCode: "1234", password: "Otra12345" });
      expect([401, 404]).toContain(res.status);
      expect(res.body.success).not.toBe(true);
    }
  });

  it("el límite de intentos corta después del máximo y se renueva con la ventana", async () => {
    const { consumeRateLimit } = await import("../src/core/middlewares/rateLimit");
    const key = `prueba-${stamp}`;
    const results = Array.from({ length: 4 }, () => consumeRateLimit("prueba", key, 50, 3));
    expect(results).toEqual([true, true, true, false]);
    await wait(80);
    expect(consumeRateLimit("prueba", key, 50, 3)).toBe(true);
  });

  it("al crear un usuario nace sin contraseña conocida y con un enlace de invitación (72 h)", async () => {
    const email = `invitado.${wordStamp()}@acme.test`;
    const created = await createUser(admin.token, email);
    expect(created.status).toBe(200);
    const invitation = created.body.data.invitation;
    expect(invitation.url).toContain("/activar-cuenta#token=");
    expect(invitation.emailConfigured).toBe(true);
    expect(created.body.data.temporaryPassword).toBeUndefined();

    // "123456" ya no sirve.
    await expect(login(email, "123456")).rejects.toThrow();

    const state = await check(tokenOf(invitation.url));
    expect(state.status).toBe(200);
    expect(state.body.data).toMatchObject({ state: "valid", purpose: "invite", recipientName: "Clave Enlace" });

    // El correo de invitación quedó en la cola (cifrado, sin el enlace en claro).
    const userId: number = created.body.data.id;
    const [outbox] = await queryRows<{ template: string; category: string; payload_encrypted: string | null; to_email: string }>(
      "SELECT template, category, payload_encrypted, to_email FROM email_outbox WHERE related_type = 'user' AND related_id = ? ORDER BY id DESC LIMIT 1",
      [userId]
    );
    expect(outbox).toMatchObject({ template: "account_invitation", category: "security", to_email: email });
    if (outbox?.payload_encrypted) expect(outbox.payload_encrypted).not.toContain(tokenOf(invitation.url));

    // En la base queda solo el hash del token.
    const rows = await queryRows<{ purpose: string }>("SELECT purpose FROM password_reset_token WHERE token_hash = ?", [
      hashOf(tokenOf(invitation.url)),
    ]);
    expect(rows).toEqual([{ purpose: "invite" }]);

    const session = await activateInvitedUser(created.body, email, "Activada2026");
    expect(session.token).toBeTruthy();
  });

  it("un enlace sirve una sola vez y rechaza contraseñas comunes o cortas", async () => {
    const email = `una.vez.${wordStamp()}@acme.test`;
    const created = await createUser(admin.token, email);
    const token = tokenOf(created.body.data.invitation.url);

    expect((await complete(token, "Abc1234")).status).toBe(400);
    expect((await complete(token, "password123")).status).toBe(400);
    expect((await complete(token, "Segura2026!")).status).toBe(200);

    const reused = await complete(token, "OtraSegura2026");
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe("PASSWORD_LINK_INVALID");
    expect((await check(token)).body.data.state).toBe("used");
  });

  it("el admin manda un enlace de restablecer: cierra las sesiones y anula el anterior", async () => {
    const email = `restablecer.${wordStamp()}@acme.test`;
    const created = await createUser(admin.token, email);
    const userId: number = created.body.data.id;
    const session = await activateInvitedUser(created.body, email, "Primera2026");

    const first = await authedRequest(admin.token).post(`/user/${userId}/password-link`, { purpose: "reset" });
    expect(first.status).toBe(200);
    expect(first.body.data.url).toContain("/restablecer-contrasena#token=");
    const second = await authedRequest(admin.token).post(`/user/${userId}/password-link`, { purpose: "reset" });
    expect(second.status).toBe(200);

    // Solo sirve el último.
    expect((await check(tokenOf(first.body.data.url))).body.data.state).toBe("used");
    const token = tokenOf(second.body.data.url);
    expect((await check(token)).body.data).toMatchObject({ state: "valid", purpose: "reset" });

    // Al restablecer, la misma contraseña de antes no se acepta.
    const same = await complete(token, "Primera2026");
    expect(same.status).toBe(400);
    expect(same.body.code).toBe("PASSWORD_REUSED");

    expect((await complete(token, "Segunda2026")).status).toBe(200);
    // La sesión abierta antes quedó cerrada y la contraseña vieja ya no sirve.
    expect((await authedRequest(session.token).get("/access/me")).status).toBe(401);
    await expect(login(email, "Primera2026")).rejects.toThrow();
    expect((await login(email, "Segunda2026")).token).toBeTruthy();

    // Aviso "tu contraseña cambió" en la cola.
    const notices = await queryRows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM email_outbox WHERE template = 'password_changed' AND related_type = 'user' AND related_id = ?",
      [userId]
    );
    expect(Number(notices[0]?.total)).toBeGreaterThanOrEqual(1);
  });

  it("un enlace vencido no sirve", async () => {
    const email = `vencido.${wordStamp()}@acme.test`;
    const created = await createUser(admin.token, email);
    const token = tokenOf(created.body.data.invitation.url);
    await queryRows("UPDATE password_reset_token SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE token_hash = ?", [
      hashOf(token),
    ]);
    expect((await check(token)).body.data.state).toBe("expired");
    expect((await complete(token, "Vencida2026")).status).toBe(400);
  });

  it("un admin no puede mandar enlaces a usuarios de otra empresa", async () => {
    const email = `ajeno.${wordStamp()}@acme.test`;
    const created = await createUser(admin.token, email);
    const res = await authedRequest(otherAdmin.token).post(`/user/${created.body.data.id}/password-link`, { purpose: "reset" });
    expect(res.status).toBe(403);
  });

  it("'¿Olvidaste tu contraseña?' responde lo mismo exista o no el correo", async () => {
    const email = `olvido.${wordStamp()}@acme.test`;
    const created = await createUser(admin.token, email);
    const userId: number = created.body.data.id;
    await activateInvitedUser(created.body, email, "Olvido2026");

    const known = await request(BASE_URL).post("/api/password/forgot").send({ email });
    const unknown = await request(BASE_URL).post("/api/password/forgot").send({ email: `nadie.${stamp}@acme.test` });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);

    // Se procesa después de responder: se espera un momento.
    await wait(1500);
    const links = await queryRows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM password_reset_token WHERE user_id = ? AND purpose = 'reset'",
      [userId]
    );
    expect(Number(links[0]?.total)).toBe(1);
  });

  it("el detalle de un usuario ya no expone ningún código de recuperación", async () => {
    const res = await authedRequest(admin.token).get(`/user/find/${admin.userId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty("recovery_code");
  });
});
