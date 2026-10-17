import request from "supertest";
import { authedRequest, BASE_URL, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const GESTOR_ROLE_ID = 6;

// PNG real de 1x1.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const HTML_DISGUISED_AS_PNG = Buffer.from("<html><script>alert(document.cookie)</script></html>", "utf8");

describe("Producción: salud, cabeceras y formato de errores", () => {
  it("/api/health confirma proceso y base de datos", async () => {
    const res = await request(BASE_URL).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: "ok", database: "ok" } });
  });

  it("responde con cabeceras de seguridad y sin delatar la tecnología", async () => {
    const res = await request(BASE_URL).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  // Antes, sin token, passport respondía "Unauthorized" en texto plano.
  it("un request sin sesión responde 401 con el formato estándar de la API", async () => {
    const res = await request(BASE_URL).get("/api/quotation/list");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: "UNAUTHENTICATED" });
  });

  it("un token con firma inválida responde 401 con el formato estándar", async () => {
    const res = await request(BASE_URL).get("/api/quotation/list").set("Authorization", "Bearer no.es.valido");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: "UNAUTHENTICATED" });
  });

  it("el body JSON tiene un tope razonable (antes aceptaba 350 MB)", async () => {
    const huge = { notes: "x".repeat(3 * 1024 * 1024) };
    const res = await request(BASE_URL).post("/api/signin").send(huge);
    expect(res.status).toBe(413);
  });
});

/**
 * Las imágenes de marca se guardan en la BASE (company_asset), no en disco:
 * el hosting de producción borra la carpeta de la app en cada despliegue.
 */
describe("Producción: imágenes de marca guardadas en la base", () => {
  let token: string;

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
  });

  const upload = (bytes: Buffer, filename: string, contentType: string) =>
    request(BASE_URL)
      .post("/api/uploads/company-asset")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", bytes, { filename, contentType });

  it("sube un PNG, lo guarda en la base y lo sirve tal cual con caché inmutable", async () => {
    const res = await upload(PNG_BYTES, "logo.png", "image/png");
    expect(res.status).toBe(201);

    const path: string = res.body.data.path;
    expect(path).toMatch(/^\/uploads\/company-assets\/\d+\/[0-9a-f-]{36}\.png$/);

    const fileName = path.split("/").pop();
    const rows = await queryRows<{ size_bytes: number }>(
      "SELECT size_bytes FROM company_asset WHERE file_name = ?",
      [fileName]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.size_bytes)).toBe(PNG_BYTES.length);

    const served = await request(BASE_URL).get(path).buffer(true).parse((resp, done) => {
      const chunks: Buffer[] = [];
      resp.on("data", (chunk: Buffer) => chunks.push(chunk));
      resp.on("end", () => done(null, Buffer.concat(chunks)));
    });
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["cache-control"]).toContain("immutable");
    expect(Buffer.compare(served.body as Buffer, PNG_BYTES)).toBe(0);
  });

  // XSS: antes la extensión salía del nombre que mandaba el navegador y el
  // MIME lo declaraba el cliente — un HTML "con forma de PNG" se servía como
  // página web desde el mismo dominio de la app.
  it("rechaza un HTML disfrazado de PNG y no guarda nada", async () => {
    const [{ total: before = 0 } = { total: 0 }] = await queryRows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM company_asset"
    );

    const res = await upload(HTML_DISGUISED_AS_PNG, "ataque.html", "image/png");
    expect(res.status).toBe(400);

    const [{ total: after = 0 } = { total: 0 }] = await queryRows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM company_asset"
    );
    expect(Number(after)).toBe(Number(before));
  });

  it("rechaza una imagen cuyo contenido no coincide con el tipo declarado", async () => {
    const res = await upload(PNG_BYTES, "foto.jpg", "image/jpeg");
    expect(res.status).toBe(400);
  });

  it("no permite salir de la carpeta de imágenes (path traversal)", async () => {
    const encoded = await request(BASE_URL).get("/uploads/company-assets/1/..%2f..%2fpackage.json");
    const plain = await request(BASE_URL).get("/uploads/../package.json");
    expect(encoded.status).toBe(404);
    expect(plain.status).not.toBe(200);
  });
});

describe("Producción: endpoint del cron de vencimiento", () => {
  const path = "/api/internal/jobs/expire-quotations";

  // Sin CRON_SECRET configurado el endpoint queda APAGADO (404), nunca
  // abierto. En desarrollo normalmente no está configurado.
  const cronSecret = process.env.CRON_SECRET?.trim();

  (cronSecret ? it.skip : it)("sin CRON_SECRET configurado el endpoint no existe (404)", async () => {
    const res = await request(BASE_URL).post(path).set("X-Cron-Secret", "lo-que-sea");
    expect(res.status).toBe(404);
  });

  (cronSecret ? it : it.skip)("con CRON_SECRET: rechaza un secreto incorrecto y acepta el correcto", async () => {
    const wrong = await request(BASE_URL).post(path).set("X-Cron-Secret", "incorrecto");
    expect(wrong.status).toBe(401);
    const right = await request(BASE_URL).post(path).set("X-Cron-Secret", cronSecret ?? "");
    expect(right.status).toBe(200);
  });
});

describe("Producción: contraseña nueva de mínimo 8 caracteres", () => {
  it("rechaza 7 caracteres y acepta 8 (mismo mínimo que la pantalla)", async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const adminToken = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    const access = await authedRequest(adminToken).get("/access/me");
    const companyId: number = access.body.data.companyId;
    const units = await authedRequest(adminToken).get("/business-unit/list?page=1&limit=1");
    const businessUnitId: number = units.body.data.data[0].id;

    const stamp = wordStamp();
    const email = `clave.minima.${stamp}@acme.test`;
    const created = await authedRequest(superToken).post("/user/create", {
      name: "Clave",
      paternal_lastname: "Minima",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email,
      status: true,
      gender: 4,
      company_id: companyId,
      business_unit_id: businessUnitId,
      roleIds: GESTOR_ROLE_ID,
    });
    expect(created.status).toBe(200);

    const temporary = await login(email, "123456");
    const user = authedRequest(temporary.token);

    const tooShort = await user.patch("/user/change/password", { oldPassword: "123456", newPassword: "Abc1234" });
    expect(tooShort.status).toBe(400);

    const ok = await user.patch("/user/change/password", { oldPassword: "123456", newPassword: "Abcd1234" });
    expect(ok.status).toBe(200);
  });
});
