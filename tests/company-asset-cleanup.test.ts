import { randomUUID } from "crypto";
import request from "supertest";
import { authedRequest, BASE_URL, login, QA_COMPANY_ADMIN } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";

// PNG real de 1x1 (mismo que production-readiness.test.ts).
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// "/uploads/company-assets/12/<uuid>.png" -> 12 y "<uuid>.png".
const companyIdOf = (path: string) => Number(path.split("/")[3]);
const fileNameOf = (path: string) => path.split("/").pop() ?? "";
const assetPath = (companyId: number, fileName: string) => `/uploads/company-assets/${companyId}/${fileName}`;

const assetExists = async (companyId: number, fileName: string): Promise<boolean> => {
  const rows = await queryRows<{ total: number }>(
    "SELECT COUNT(*) AS total FROM company_asset WHERE company_id = ? AND file_name = ?",
    [companyId, fileName]
  );
  return Number(rows[0]?.total ?? 0) > 0;
};

// Subida abandonada de hace 3 días (sin uso), insertada directo en la base:
// por la API no se puede "envejecer" una imagen.
const insertAbandonedAsset = async (companyId: number): Promise<string> => {
  const fileName = `${randomUUID()}.png`;
  await queryRows(
    `INSERT INTO company_asset (company_id, file_name, mime_type, size_bytes, data, created_at)
     VALUES (?, ?, 'image/png', ?, ?, UTC_TIMESTAMP() - INTERVAL 3 DAY)`,
    [companyId, fileName, PNG_BYTES.length, PNG_BYTES]
  );
  return fileName;
};

/**
 * Pedido explícito del usuario: "cuando una empresa sube una imagen debe
 * borrar la anterior, si no esas imágenes se quedarán para siempre", y
 * comprobar que borrar las de una empresa NUNCA borre las de otra.
 */
describe("Imágenes de marca: se borran las que ya no se usan, solo de la misma empresa", () => {
  let token: string;
  let companyId: number;
  let otherCompanyId: number;
  const otherCompanyFiles: string[] = [];

  const api = () => authedRequest(token);
  const upload = async (): Promise<string> => {
    const res = await request(BASE_URL)
      .post("/api/uploads/company-asset")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", PNG_BYTES, { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    return res.body.data.path as string;
  };
  // Mismo payload que manda la pantalla "Documentos de la empresa".
  const saveLogo = async (logoUrl: string) => {
    const current = await api().get("/company/my-document-settings");
    const { business_name, address, phone, legal_terms_caption } = current.body.data;
    return api().put("/company/my-document-settings", {
      business_name,
      address: address ?? "",
      phone: phone ?? "",
      legal_terms_caption: legal_terms_caption ?? "",
      logo_url: logoUrl,
    });
  };
  const createPaymentAccount = async (qrPath: string): Promise<number> => {
    const res = await api().post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta de pago",
      prefix_id: "yape",
      name: "Yape QR limpieza",
      ref1: "999999999",
      ref2: qrPath,
    });
    expect(res.status).toBe(200);
    return res.body.data.id as number;
  };

  beforeAll(async () => {
    token = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    companyId = companyIdOf(await upload());
    const [other] = await queryRows<{ id: number }>("SELECT id FROM company WHERE id <> ? ORDER BY id LIMIT 1", [
      companyId,
    ]);
    otherCompanyId = Number(other?.id);
    expect(otherCompanyId).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (otherCompanyFiles.length === 0) return;
    await queryRows("DELETE FROM company_asset WHERE company_id = ? AND file_name IN (?)", [
      otherCompanyId,
      otherCompanyFiles,
    ]);
  });

  it("al guardar un logo nuevo se borra la imagen del anterior", async () => {
    const first = await upload();
    expect((await saveLogo(first)).status).toBe(200);

    const second = await upload();
    expect((await saveLogo(second)).status).toBe(200);

    expect(await assetExists(companyId, fileNameOf(first))).toBe(false);
    expect(await assetExists(companyId, fileNameOf(second))).toBe(true);
  });

  it("una subida reciente que todavía no se guardó NO se borra", async () => {
    const pending = await upload();
    const saved = await upload();
    expect((await saveLogo(saved)).status).toBe(200);

    expect(await assetExists(companyId, fileNameOf(pending))).toBe(true);
  });

  it("una subida abandonada se borra al subir otra, sin tocar las de otra empresa", async () => {
    const ownAbandoned = await insertAbandonedAsset(companyId);
    const otherAbandoned = await insertAbandonedAsset(otherCompanyId);
    otherCompanyFiles.push(otherAbandoned);

    await upload();

    expect(await assetExists(companyId, ownAbandoned)).toBe(false);
    expect(await assetExists(otherCompanyId, otherAbandoned)).toBe(true);
  });

  it("cambiar el logo nunca borra imágenes de otra empresa", async () => {
    const otherAbandoned = await insertAbandonedAsset(otherCompanyId);
    otherCompanyFiles.push(otherAbandoned);

    expect((await saveLogo(await upload())).status).toBe(200);

    expect(await assetExists(otherCompanyId, otherAbandoned)).toBe(true);
  });

  it("no deja guardar como logo una imagen de otra empresa", async () => {
    const otherImage = await insertAbandonedAsset(otherCompanyId);
    otherCompanyFiles.push(otherImage);

    const res = await saveLogo(assetPath(otherCompanyId, otherImage));
    expect(res.status).toBe(400);
    expect(await assetExists(otherCompanyId, otherImage)).toBe(true);
  });

  it("no deja guardar como logo una imagen que ya no existe", async () => {
    const res = await saveLogo(assetPath(companyId, `${randomUUID()}.png`));
    expect(res.status).toBe(400);
  });

  it("al eliminar una cuenta de pago se borra su QR", async () => {
    const qr = await upload();
    const accountId = await createPaymentAccount(qr);

    expect((await api().delete(`/variable_general/delete/${accountId}`)).status).toBe(200);
    expect(await assetExists(companyId, fileNameOf(qr))).toBe(false);
  });

  // Antes el Super Administrador recibía "No se recibió ninguna imagen": la
  // empresa solo se leía del token y él no tiene empresa propia.
  it("el Super Administrador sube la imagen a la empresa que elige", async () => {
    const superToken = (await login("qa.superadmin@grulla.test", "Test1234")).token;
    const uploadAsSuperAdmin = (targetCompanyId?: number) => {
      const upload = request(BASE_URL)
        .post("/api/uploads/company-asset")
        .set("Authorization", `Bearer ${superToken}`);
      if (targetCompanyId !== undefined) upload.field("company_id", String(targetCompanyId));
      return upload.attach("file", PNG_BYTES, { filename: "logo.png", contentType: "image/png" });
    };

    const res = await uploadAsSuperAdmin(otherCompanyId);
    expect(res.status).toBe(201);
    const path = res.body.data.path as string;
    expect(companyIdOf(path)).toBe(otherCompanyId);
    otherCompanyFiles.push(fileNameOf(path));

    expect((await uploadAsSuperAdmin()).status).toBe(400);
  });

  it("un usuario de empresa no puede subir imágenes a otra empresa", async () => {
    const res = await request(BASE_URL)
      .post("/api/uploads/company-asset")
      .set("Authorization", `Bearer ${token}`)
      .field("company_id", String(otherCompanyId))
      .attach("file", PNG_BYTES, { filename: "logo.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(companyIdOf(res.body.data.path as string)).toBe(companyId);
  });

  it("al cambiar el QR de una cuenta se borra el anterior", async () => {
    const firstQr = await upload();
    const accountId = await createPaymentAccount(firstQr);
    const secondQr = await upload();

    expect((await api().put(`/variable_general/update/${accountId}`, { ref2: secondQr })).status).toBe(200);
    expect(await assetExists(companyId, fileNameOf(firstQr))).toBe(false);
    expect(await assetExists(companyId, fileNameOf(secondQr))).toBe(true);

    await api().delete(`/variable_general/delete/${accountId}`);
  });
});
