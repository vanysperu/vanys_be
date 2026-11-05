import request from "supertest";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createUnscopedCompanyAdmin } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const ZONE_CATEGORY = "advertisement_zone";

interface AdvertisementRow {
  id: number;
  title: string;
  position: number;
  is_active: boolean;
  image_path: string;
  zone_total: number;
  company_name: string | null;
  zone: { id: number; code: string; name: string } | null;
}

/**
 * Anuncios de la web (pedido explícito del usuario): se suben con su imagen,
 * van en una ZONA (lugar de la web) con su propio orden, se apagan/prenden y
 * se ELIMINAN de verdad, con su imagen. La web los pide por zona con su API
 * key. Usa empresas y administradores desechables: nunca inicia sesión con las
 * cuentas QA que el equipo usa a mano.
 */
describe("Anuncios de la web", () => {
  let superToken: string;
  let companyId: number;
  let otherCompanyId: number;
  let adminToken: string;
  let otherAdminToken: string;
  let plainKey: string;
  let apiKeyId: number;
  let homeZoneId: number;
  let sideZoneId: number;
  let otherZoneId: number;

  const stamp = String(Date.now());
  const homeCode = `inicio-${stamp}`;
  const sideCode = `lateral-${stamp}`;
  const superApi = () => authedRequest(superToken);
  const adminApi = () => authedRequest(adminToken);

  const createCompany = async (suffix: string) => {
    const res = await superApi().post("/company/create", {
      ruc: `20${stamp.slice(-8)}${suffix}`,
      business_name: `Anuncios ${suffix} ${stamp}`,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  const createZone = async (token: string, code: string, name: string) => {
    const res = await authedRequest(token).post("/variable_general/create", {
      category: ZONE_CATEGORY,
      title: "Zona de anuncios",
      prefix_id: code,
      name,
    });
    return res;
  };

  const uploadImage = async (token: string) => {
    const res = await request(BASE_URL)
      .post("/api/advertisement/image")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", PNG_1X1, { filename: "anuncio.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    return res.body.data.path as string;
  };

  const createAd = async (title: string, extra: object = {}) => {
    const res = await adminApi().post("/advertisement/create", { title, image_path: await uploadImage(adminToken), ...extra });
    expect(res.status).toBe(201);
    return res.body.data as AdvertisementRow;
  };

  const listZone = async (zoneId: number | "none") =>
    (await adminApi().get(`/advertisement/list?limit=100&zoneId=${zoneId}`)).body.data.data as AdvertisementRow[];
  const orderOf = async (zoneId: number | "none") => (await listZone(zoneId)).map((ad) => `${ad.position}:${ad.title}`);
  const imageStatus = async (path: string) => (await request(BASE_URL).get(path)).status;
  const publicList = (query = "", key: string | null = plainKey) => {
    const req = request(BASE_URL).get(`/api/public/advertisements${query}`);
    return key ? req.set("X-Api-Key", key) : req;
  };
  const publicTitles = async (query: string) =>
    (await publicList(query)).body.data.data.map((ad: { title: string }) => ad.title) as string[];

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    companyId = await createCompany("1");
    otherCompanyId = await createCompany("2");
    adminToken = (await createUnscopedCompanyAdmin(superToken, companyId)).token;
    otherAdminToken = (await createUnscopedCompanyAdmin(superToken, otherCompanyId)).token;
    homeZoneId = (await createZone(adminToken, homeCode, "Banner de inicio")).body.data.id;
    sideZoneId = (await createZone(adminToken, sideCode, "Lateral")).body.data.id;
    otherZoneId = (await createZone(otherAdminToken, `otra-${stamp}`, "Zona de otra empresa")).body.data.id;
    const key = await superApi().post("/api-key/create", { company_id: companyId, name: "Jest anuncios" });
    plainKey = key.body.data.plain_key;
    apiKeyId = key.body.data.id;
  });

  afterAll(async () => {
    if (apiKeyId) await superApi().put(`/api-key/disable/${apiKeyId}`);
    // Las zonas de prueba se BORRAN para no ensuciar Variables Generales.
    await queryRows("DELETE FROM advertisement WHERE company_id IN (?, ?)", [companyId, otherCompanyId]);
    for (const id of [homeZoneId, sideZoneId, otherZoneId]) if (id) await superApi().delete(`/variable_general/delete/${id}`);
    for (const id of [companyId, otherCompanyId]) if (id) await superApi().put(`/company/disable/${id}`);
  });

  it("cada zona tiene su propio orden: crear va al final y mover corre a los demás", async () => {
    await createAd("Primero", { zone_id: homeZoneId });
    await createAd("Segundo", { zone_id: homeZoneId, link_url: "https://tienda.example/promo" });
    const third = await createAd("Tercero", { zone_id: homeZoneId });
    const side = await createAd("Lateral uno", { zone_id: sideZoneId });
    expect(third).toMatchObject({ position: 3, zone_total: 3, is_active: true, zone: { id: homeZoneId, code: homeCode } });
    expect(side).toMatchObject({ position: 1, zone_total: 1 });
    expect(await orderOf(homeZoneId)).toEqual(["1:Primero", "2:Segundo", "3:Tercero"]);

    expect((await adminApi().put(`/advertisement/position/${third.id}`, { position: 1 })).status).toBe(200);
    expect(await orderOf(homeZoneId)).toEqual(["1:Tercero", "2:Primero", "3:Segundo"]);

    // Una posición mayor a la cantidad lo deja al final.
    await adminApi().put(`/advertisement/position/${third.id}`, { position: 99 });
    expect(await orderOf(homeZoneId)).toEqual(["1:Primero", "2:Segundo", "3:Tercero"]);

    // Editar con `position` también lo mueve. La otra zona no se toca.
    await adminApi().put(`/advertisement/update/${third.id}`, { title: "Tercero editado", position: 2 });
    expect(await orderOf(homeZoneId)).toEqual(["1:Primero", "2:Tercero editado", "3:Segundo"]);
    expect(await orderOf(sideZoneId)).toEqual(["1:Lateral uno"]);
  });

  it("la web pide los anuncios de una zona con su key: solo prendidos, en orden y con URL absoluta", async () => {
    expect((await publicList(`?zone=${homeCode}`, null)).status).toBe(401);

    expect(await publicTitles(`?zone=${homeCode}`)).toEqual(["Primero", "Tercero editado", "Segundo"]);
    // El código no distingue mayúsculas; también sirve el id de la zona.
    expect(await publicTitles(`?zone=${homeCode.toUpperCase()}`)).toEqual(["Primero", "Tercero editado", "Segundo"]);
    expect(await publicTitles(`?zone_id=${sideZoneId}`)).toEqual(["Lateral uno"]);
    expect(await publicTitles("?zone=no-existe")).toEqual([]);
    // Sin zona: todos, agrupados por zona.
    expect(await publicTitles("")).toEqual(["Primero", "Tercero editado", "Segundo", "Lateral uno"]);

    const web = await publicList(`?zone=${homeCode}`);
    const [ad] = web.body.data.data;
    expect(ad.image_url).toMatch(/^https?:\/\/[^/]+\/uploads\/company-assets\/\d+\//);
    expect(ad.zone).toEqual({ id: homeZoneId, code: homeCode, name: "Banner de inicio" });
    expect(ad).not.toHaveProperty("company_id");
    expect(web.body.data.meta).toMatchObject({ page: 1, total: 3 });

    // Apagado no sale y conserva su lugar; al prenderlo vuelve a salir primero.
    const [first] = await listZone(homeZoneId);
    const off = await adminApi().put(`/advertisement/disable/${first!.id}`, { is_active: false });
    expect(off.body.data.is_active).toBe(false);
    expect(await publicTitles(`?zone=${homeCode}`)).toEqual(["Tercero editado", "Segundo"]);
    await adminApi().put(`/advertisement/disable/${first!.id}`, { is_active: true });
    expect((await publicTitles(`?zone=${homeCode}`))[0]).toBe("Primero");
  });

  it("pasar un anuncio a otra zona lo deja al final de la nueva y cierra el hueco de la anterior", async () => {
    const [, second] = await listZone(homeZoneId);
    const moved = await adminApi().put(`/advertisement/update/${second!.id}`, { zone_id: sideZoneId });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ position: 2, zone: { id: sideZoneId } });
    expect(await orderOf(homeZoneId)).toEqual(["1:Primero", "2:Segundo"]);
    expect(await orderOf(sideZoneId)).toEqual(["1:Lateral uno", "2:Tercero editado"]);

    // Sin zona: sale solo cuando la web no filtra.
    await adminApi().put(`/advertisement/update/${second!.id}`, { zone_id: null });
    expect(await orderOf("none")).toEqual(["1:Tercero editado"]);
    expect(await publicTitles(`?zone=${sideCode}`)).toEqual(["Lateral uno"]);
    await adminApi().put(`/advertisement/update/${second!.id}`, { zone_id: sideZoneId });
  });

  it("una zona deshabilitada se apaga entera en la web", async () => {
    expect((await superApi().put(`/variable_general/disable/${sideZoneId}`)).status).toBe(200);
    expect(await publicTitles(`?zone=${sideCode}`)).toEqual([]);
    await superApi().put(`/variable_general/disable/${sideZoneId}`);
    expect(await publicTitles(`?zone=${sideCode}`)).toEqual(["Lateral uno", "Tercero editado"]);
  });

  it("el código de una zona no se repite, y un anuncio no usa la zona de otra empresa", async () => {
    const repeated = await createZone(adminToken, homeCode.toUpperCase(), "Repetida");
    expect(repeated.status).toBe(409);
    expect(repeated.body.code).toBe("DUPLICATE_ADVERTISEMENT_ZONE");

    const foreignZone = await adminApi().post("/advertisement/create", {
      title: "Zona ajena",
      zone_id: otherZoneId,
      image_path: await uploadImage(adminToken),
    });
    expect(foreignZone.status).toBe(400);
    expect(foreignZone.body.code).toBe("INVALID_ADVERTISEMENT_ZONE");
  });

  it("cambiar la imagen borra la anterior", async () => {
    const [, second] = await listZone(homeZoneId);
    const previous = second!.image_path;
    const next = await uploadImage(adminToken);

    const res = await adminApi().put(`/advertisement/update/${second!.id}`, { image_path: next });
    expect(res.status).toBe(200);
    expect(await imageStatus(previous)).toBe(404);
    expect(await imageStatus(next)).toBe(200);
  });

  it("eliminar es definitivo: borra la fila y su imagen, y cierra el orden de su zona", async () => {
    const [first] = await listZone(homeZoneId);
    expect(await imageStatus(first!.image_path)).toBe(200);

    const res = await adminApi().delete(`/advertisement/delete/${first!.id}`);
    expect(res.status).toBe(200);
    expect(await imageStatus(first!.image_path)).toBe(404);
    const rows = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM advertisement WHERE id = ?", [first!.id]);
    expect(Number(rows[0]?.total)).toBe(0);
    expect(await orderOf(homeZoneId)).toEqual(["1:Segundo"]);

    // Eliminar dos veces: ya no existe.
    expect((await adminApi().delete(`/advertisement/delete/${first!.id}`)).status).toBe(404);
  });

  it("otra empresa no ve ni toca anuncios ajenos, ni usa sus imágenes", async () => {
    const otherApi = authedRequest(otherAdminToken);
    const [own] = await listZone(homeZoneId);

    expect((await otherApi.get("/advertisement/list")).body.data.data).toEqual([]);
    expect((await otherApi.put(`/advertisement/update/${own!.id}`, { title: "Ajeno" })).status).toBe(404);
    expect((await otherApi.put(`/advertisement/disable/${own!.id}`, { is_active: false })).status).toBe(404);
    expect((await otherApi.put(`/advertisement/position/${own!.id}`, { position: 1 })).status).toBe(404);
    expect((await otherApi.delete(`/advertisement/delete/${own!.id}`)).status).toBe(404);

    const stolen = await otherApi.post("/advertisement/create", { title: "Copia", image_path: own!.image_path });
    expect(stolen.status).toBe(400);
    // Mandar otra empresa en el body no sirve: un usuario de empresa crea en la suya.
    const forced = await otherApi.post("/advertisement/create", {
      company_id: companyId,
      title: "Forzado",
      image_path: await uploadImage(otherAdminToken),
    });
    expect(forced.status).toBe(403);
  });

  it("valida el enlace, el título y la imagen", async () => {
    const image = await uploadImage(adminToken);
    const badLink = await adminApi().post("/advertisement/create", { title: "X", image_path: image, link_url: "javascript:alert(1)" });
    expect(badLink.status).toBe(400);
    expect((await adminApi().post("/advertisement/create", { title: "", image_path: image })).status).toBe(400);
    expect((await adminApi().post("/advertisement/create", { title: "Sin imagen" })).status).toBe(400);
    const external = await adminApi().post("/advertisement/create", { title: "Externa", image_path: "https://otro.sitio/a.png" });
    expect(external.status).toBe(400);
    expect(external.body.code).toBe("INVALID_IMAGE_PATH");
  });

  it("el Super Administrador ve la empresa de cada anuncio y puede filtrar por ella", async () => {
    const res = await superApi().get(`/advertisement/list?companyId=${companyId}&status=active`);
    expect(res.status).toBe(200);
    const rows = res.body.data.data as AdvertisementRow[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((ad) => ad.company_name === `Anuncios 1 ${stamp}`)).toBe(true);
  });
});
