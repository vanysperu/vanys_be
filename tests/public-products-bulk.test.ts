import request from "supertest";
import { authedRequest, BASE_URL, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// PNG real de 1x1 (la API valida la firma del archivo, no solo el MIME).
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Subida masiva de productos por API key (pedido explícito del usuario):
 * foto subida al sistema, colores, categoría/subcategoría de Variables
 * Generales, upsert por SKU y réplica a otras empresas permitidas a la key.
 */
describe("Productos por API key: subida masiva, réplica, colores, categorías y fotos", () => {
  let superToken: string;
  let mainCompanyId: number;
  let replicaCompanyId: number;
  let otherCompanyId: number;
  let plainKey: string;
  let apiKeyId: number;
  let categoryId: number;
  let subcategoryId: number;
  let mainOnlyCategoryId: number;
  const createdVariableIds: number[] = [];
  const sku = `BULK-${Date.now()}`;
  // Nombres únicos por corrida: las categorías no pueden repetir nombre.
  const categoryName = `Tazas jest ${sku}`;

  const api = () => authedRequest(superToken);
  const publicPost = (path: string, body: object, key: string | null = plainKey) => {
    const req = request(BASE_URL).post(`/api/public${path}`);
    return (key ? req.set("X-Api-Key", key) : req).send(body);
  };

  const createCompany = async (label: string) => {
    const res = await api().post("/company/create", {
      ruc: `20${String(Date.now()).slice(-9)}`,
      business_name: `${label} ${wordStamp()}`,
    });
    expect(res.status).toBe(201);
    return Number(res.body.data.id);
  };

  const createVariable = async (body: object) => {
    const res = await api().post("/variable_general/create", body);
    expect([200, 201]).toContain(res.status);
    createdVariableIds.push(Number(res.body.data.id));
    return Number(res.body.data.id);
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    mainCompanyId = await createCompany("BulkMain");
    replicaCompanyId = await createCompany("BulkReplica");
    otherCompanyId = await createCompany("BulkOther");

    // Fotos habilitadas solo en la empresa principal.
    expect((await api().put(`/company/update/${mainCompanyId}`, { product_images_enabled: true })).status).toBe(200);

    // Categoría y subcategoría GLOBALES (sirven a todas las empresas) y una
    // categoría solo de la empresa principal.
    categoryId = await createVariable({ category: "product_category", title: "Categoría", prefix_id: `C${Date.now()}`, name: categoryName });
    subcategoryId = await createVariable({
      category: "product_subcategory",
      title: "Subcategoría",
      prefix_id: `S${Date.now()}`,
      name: `Tazas mágicas jest ${sku}`,
      ref1: String(categoryId),
    });
    mainOnlyCategoryId = await createVariable({
      category: "product_category",
      title: "Categoría",
      prefix_id: `M${Date.now()}`,
      name: `Solo principal jest ${sku}`,
      company_id: mainCompanyId,
    });

    const key = await api().post("/api-key/create", {
      company_id: mainCompanyId,
      name: "Jest bulk",
      replicate_company_ids: [replicaCompanyId],
    });
    expect(key.status).toBe(201);
    plainKey = key.body.data.plain_key;
    apiKeyId = key.body.data.id;
    expect(key.body.data.replicate_companies.map((company: { id: number }) => company.id)).toEqual([replicaCompanyId]);
  });

  afterAll(async () => {
    if (apiKeyId) await api().put(`/api-key/disable/${apiKeyId}`);
    // Las categorías de prueba se BORRAN (no solo se deshabilitan): las
    // globales aparecían como "Inactiva" en Generales de todas las empresas y
    // se confundían con categorías reales. Primero las subcategorías (orden
    // inverso de creación); los productos de prueba que las usaban quedan sin
    // categoría (FK ON DELETE SET NULL).
    for (const id of createdVariableIds.reverse()) await api().delete(`/variable_general/delete/${id}`);
    for (const id of [mainCompanyId, replicaCompanyId, otherCompanyId]) {
      if (id) await api().put(`/company/disable/${id}`);
    }
  });

  it("categorías y subcategorías no repiten nombre, tampoco al rehabilitar", async () => {
    const create = (body: object) => api().post("/variable_general/create", { title: "T", prefix_id: `D${Date.now()}`, ...body });

    // Misma categoría global (otras mayúsculas y espacios).
    const sameCategory = await create({ category: "product_category", name: `  ${categoryName.toUpperCase()} ` });
    expect(sameCategory.status).toBe(409);
    expect(sameCategory.body.code).toBe("DUPLICATE_PRODUCT_CATEGORY");

    // Una categoría de empresa no puede llamarse como una global (se verían las dos).
    const companyCopy = await create({ category: "product_category", name: categoryName, company_id: mainCompanyId });
    expect(companyCopy.status).toBe(409);

    // Subcategoría repetida dentro de la misma categoría.
    const sameSub = await create({ category: "product_subcategory", name: `Tazas mágicas jest ${sku}`, ref1: String(categoryId) });
    expect(sameSub.status).toBe(409);

    // Rehabilitar una deshabilitada cuando ya hay otra activa con ese nombre.
    const disabledName = `Rehabilitar jest ${sku}`;
    const first = await createVariable({ category: "product_category", title: "T", prefix_id: `R1${Date.now()}`, name: disabledName });
    expect((await api().put(`/variable_general/disable/${first}`)).status).toBe(200);
    await createVariable({ category: "product_category", title: "T", prefix_id: `R2${Date.now()}`, name: disabledName });
    const reEnable = await api().put(`/variable_general/disable/${first}`);
    expect(reEnable.status).toBe(409);
    expect(reEnable.body.code).toBe("DUPLICATE_PRODUCT_CATEGORY");
  });

  it("lista solo las categorías de la empresa de la key (no las globales), con sus subcategorías", async () => {
    const ownSubId = await createVariable({
      category: "product_subcategory",
      title: "Subcategoría",
      prefix_id: `PS${Date.now()}`,
      name: `Sub principal jest ${sku}`,
      ref1: String(mainOnlyCategoryId),
      company_id: mainCompanyId,
    });

    const res = await request(BASE_URL).get("/api/public/product-categories?page=1&limit=50").set("X-Api-Key", plainKey);
    expect(res.status).toBe(200);
    const ids = res.body.data.data.map((category: { id: number }) => category.id);
    expect(ids).toContain(mainOnlyCategoryId);
    // La global (categoryId) existe y está activa, pero no es de la empresa.
    expect(ids).not.toContain(categoryId);
    const own = res.body.data.data.find((category: { id: number }) => category.id === mainOnlyCategoryId);
    expect(own.subcategories).toEqual([{ id: ownSubId, name: `Sub principal jest ${sku}`, code: expect.any(String) }]);
    expect(own.is_global).toBe(false);
    expect(res.body.data.meta).toMatchObject({ page: 1, limit: 50 });

    // Con include_global=true llegan también las globales, marcadas, con sus
    // subcategorías; nunca las de otra empresa.
    const otherCategoryId = await createVariable({
      category: "product_category",
      title: "Categoría",
      prefix_id: `OC${Date.now()}`,
      name: `De otra empresa jest ${sku}`,
      company_id: otherCompanyId,
    });
    const withGlobal = await request(BASE_URL)
      .get(`/api/public/product-categories?include_global=true&search=${encodeURIComponent(`jest ${sku}`)}&limit=50`)
      .set("X-Api-Key", plainKey);
    expect(withGlobal.status).toBe(200);
    const byId = new Map(withGlobal.body.data.data.map((row: { id: number }) => [row.id, row]));
    expect(byId.get(mainOnlyCategoryId)).toMatchObject({ is_global: false });
    expect(byId.get(categoryId)).toMatchObject({ is_global: true, subcategories: [{ id: subcategoryId }] });
    expect(byId.has(otherCategoryId)).toBe(false);

    const invalid = await request(BASE_URL).get("/api/public/product-categories?include_global=quizas").set("X-Api-Key", plainKey);
    expect(invalid.status).toBe(400);

    const bySearch = await request(BASE_URL).get("/api/public/product-categories?search=no-existe-xyz").set("X-Api-Key", plainKey);
    expect(bySearch.body.data.meta.total).toBe(0);
    expect((await request(BASE_URL).get("/api/public/product-categories")).status).toBe(401);
  });

  it("una subcategoría exige una categoría padre válida", async () => {
    const res = await api().post("/variable_general/create", {
      category: "product_subcategory",
      title: "Subcategoría",
      prefix_id: `X${Date.now()}`,
      name: "Huérfana",
      ref1: "999999999",
    });
    expect(res.status).toBe(400);
  });

  it("sube la foto, crea el producto en la empresa de la key y en la réplica, y luego lo actualiza por SKU", async () => {
    const upload = await request(BASE_URL)
      .post("/api/public/products/images")
      .set("X-Api-Key", plainKey)
      .attach("file", PNG_1X1, { filename: "taza.png", contentType: "image/png" });
    expect(upload.status).toBe(201);
    const imagePath: string = upload.body.data.image_path;
    expect(imagePath).toMatch(new RegExp(`^/uploads/company-assets/${mainCompanyId}/`));

    const created = await publicPost("/products/bulk", {
      replicate: true,
      company_ids: [replicaCompanyId],
      products: [
        {
          sku,
          name: "Taza blanca jest",
          price_unit: 12.5,
          price_hundred: 9,
          category_id: categoryId,
          subcategory_id: subcategoryId,
          colors: [{ name: "Blanco", hex: "#ffffff" }, { name: "Negro" }, { name: "blanco" }],
          // Un SKU, varios códigos de proveedores.
          codes: [{ code: `PROV-A-${sku}`, supplier: "Proveedor A" }, { code: `PROV-B-${sku}` }],
          image_path: imagePath,
        },
      ],
    });
    expect(created.status).toBe(200);
    expect(created.body.data.summary).toMatchObject({ received: 1, created: 2, updated: 0, failed: 0 });
    const companies = created.body.data.results[0].companies;
    expect(companies.map((company: { company_id: number }) => company.company_id)).toEqual([mainCompanyId, replicaCompanyId]);
    // La réplica no tiene fotos habilitadas: se avisa.
    expect(created.body.data.warnings.join(" ")).toContain(String(replicaCompanyId));

    const updated = await publicPost("/products/bulk", {
      replicate: true,
      company_ids: [replicaCompanyId],
      products: [{ sku, price_unit: 11, colors: [{ name: "Rojo", hex: "#FF0000" }] }],
    });
    expect(updated.body.data.summary).toMatchObject({ created: 0, updated: 2, failed: 0 });

    // La réplica es una copia independiente: su propia foto, mismos datos.
    const replica = await api().get(`/product/list?companyId=${replicaCompanyId}&sku=${sku}`);
    const replicaProduct = replica.body.data.data[0];
    expect(replicaProduct.image_path).toMatch(new RegExp(`^/uploads/company-assets/${replicaCompanyId}/`));
    expect(Number(replicaProduct.price_unit)).toBe(11);
    expect(replicaProduct.name).toBe("Taza blanca jest");
    expect(replicaProduct.colors).toEqual([{ name: "Rojo", hex: "#FF0000" }]);
    // Sin `codes` en la actualización, se conservan los del alta.
    expect(replicaProduct.codes).toEqual([
      { code: `PROV-A-${sku}`, supplier: "Proveedor A" },
      { code: `PROV-B-${sku}`, supplier: null },
    ]);
    expect(replicaProduct.sku).toBe(sku);
    expect(replicaProduct.category).toMatchObject({ id: categoryId });
    expect(replicaProduct.subcategory).toMatchObject({ id: subcategoryId });
    expect(replicaProduct.images_enabled).toBe(false);
  });

  it("el catálogo por API key nunca devuelve productos deshabilitados", async () => {
    const hiddenSku = `${sku}-OFF`;
    const created = await publicPost("/products/bulk", {
      products: [{ sku: hiddenSku, name: "Producto que se deshabilita", price_unit: 5, codes: [{ code: `OFF-${sku}` }] }],
    });
    const productId = created.body.data.results[0].companies[0].product_id;
    expect((await api().put(`/product/disable/${productId}`)).status).toBe(200);

    // Ni por SKU, ni por código, ni intentando abrir el filtro de estado.
    for (const query of [`sku=${hiddenSku}`, `code=OFF-${sku}`, `search=${hiddenSku}&status=inactive`, `sku=${hiddenSku}&status=active,inactive`]) {
      const res = await request(BASE_URL).get(`/api/public/products?${query}`).set("X-Api-Key", plainKey);
      expect(res.status).toBe(200);
      expect(res.body.data.meta.total).toBe(0);
    }
  });

  it("lista el catálogo de la key con paginación y filtros, con la foto como URL absoluta", async () => {
    const byCategory = await request(BASE_URL)
      .get(`/api/public/products?category_id=${categoryId}&subcategory_id=${subcategoryId}&color=roj&page=1&limit=10`)
      .set("X-Api-Key", plainKey);
    expect(byCategory.status).toBe(200);
    expect(byCategory.body.data.meta).toMatchObject({ page: 1, limit: 10, total: 1 });
    const product = byCategory.body.data.data[0];
    expect(product.sku).toBe(sku);
    expect(product.category).toMatchObject({ id: categoryId, name: categoryName });
    expect(product.colors).toEqual([{ name: "Rojo", hex: "#FF0000" }]);
    expect(product.image_url).toMatch(/^https?:\/\/.+\/uploads\/company-assets\//);
    // Sin datos internos.
    expect(product.company_id).toBeUndefined();
    expect(product.created_by).toBeUndefined();

    const noMatch = await request(BASE_URL).get("/api/public/products?color=violeta-inexistente").set("X-Api-Key", plainKey);
    expect(noMatch.body.data.meta.total).toBe(0);

    // Por el código de un proveedor: con el filtro `code` y con la búsqueda general.
    for (const query of [`code=PROV-B-${sku}`, `search=prov-a-${sku}`]) {
      const byCode = await request(BASE_URL).get(`/api/public/products?${query}`).set("X-Api-Key", plainKey);
      expect(byCode.body.data.meta.total).toBe(1);
      expect(byCode.body.data.data[0].sku).toBe(sku);
      expect(byCode.body.data.data[0].codes).toHaveLength(2);
    }
  });

  it("los códigos de proveedor no se repiten en la empresa (ni con otro proveedor, ni con un SKU)", async () => {
    const send = (product: object) => publicPost("/products/bulk", { products: [product] });
    const resultOf = async (product: object) => (await send(product)).body.data.results[0];

    // Repetido dentro del mismo producto (otras mayúsculas y otro proveedor).
    expect(
      await resultOf({ sku: `${sku}-D1`, name: "Dup", price_unit: 1, codes: [{ code: `DUP-${sku}` }, { code: `dup-${sku}`, supplier: "Otro" }] })
    ).toMatchObject({ status: "error", code: "DUPLICATE_PRODUCT_CODE" });

    // Ya es código de otro producto (PROV-A lo tiene el producto principal).
    expect(await resultOf({ sku: `${sku}-D2`, name: "Ajeno", price_unit: 1, codes: [{ code: `prov-a-${sku}`, supplier: "X" }] })).toMatchObject({
      status: "error",
      code: "PRODUCT_CODE_TAKEN",
    });

    // Es el SKU de otro producto.
    expect(await resultOf({ sku: `${sku}-D3`, name: "SKU ajeno", price_unit: 1, codes: [{ code: sku }] })).toMatchObject({
      status: "error",
      code: "PRODUCT_CODE_TAKEN",
    });

    // Al revés: un SKU nuevo que ya es código de proveedor de otro producto.
    expect(await resultOf({ sku: `PROV-B-${sku}`, name: "Choca", price_unit: 1 })).toMatchObject({
      status: "error",
      code: "PRODUCT_CODE_TAKEN",
    });

    // Volver a mandar sus PROPIOS códigos al mismo producto sí se puede.
    expect(await resultOf({ sku, codes: [{ code: `PROV-A-${sku}`, supplier: "Proveedor A" }, { code: `PROV-B-${sku}` }] })).toMatchObject({
      status: "ok",
    });

    // La pantalla aplica la misma regla.
    const screen = await api().post("/product/create", {
      company_id: mainCompanyId,
      name: "Desde pantalla",
      price_unit: 1,
      codes: [{ code: `PROV-B-${sku}` }],
    });
    expect(screen.status).toBe(409);
    expect(screen.body.code).toBe("PRODUCT_CODE_TAKEN");
  });

  it("rechaza replicar a una empresa no permitida para la key, sin tocar nada", async () => {
    const res = await publicPost("/products/bulk", {
      replicate: true,
      company_ids: [otherCompanyId],
      products: [{ sku: `${sku}-X`, name: "No debe existir", price_unit: 1 }],
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REPLICATE_NOT_ALLOWED");
    const other = await api().get(`/product/list?companyId=${otherCompanyId}`);
    expect(other.body.data.meta.total).toBe(0);
  });

  it("en la réplica, lo que no existe se guarda sin esa categoría; en la empresa de la key sigue siendo error", async () => {
    const mainOnlySubId = await createVariable({
      category: "product_subcategory",
      title: "Subcategoría",
      prefix_id: `MS${Date.now()}`,
      name: `Sub de global jest ${sku}`,
      ref1: String(categoryId),
      company_id: mainCompanyId,
    });
    const replicaCategoryId = await createVariable({
      category: "product_category",
      title: "Categoría",
      prefix_id: `RC${Date.now()}`,
      name: `De la réplica jest ${sku}`,
      company_id: replicaCompanyId,
    });
    const send = (products: object[]) =>
      publicPost("/products/bulk", { replicate: true, company_ids: [replicaCompanyId], products });
    const inCompany = async (companyId: number, productSku: string) =>
      (await api().get(`/product/list?companyId=${companyId}&sku=${productSku}`)).body.data.data[0];

    // Categoría solo de la empresa de la key: en la réplica queda sin categoría.
    const noCategory = await send([{ sku: `${sku}-C`, name: "Categoría propia", price_unit: 1, category_id: mainOnlyCategoryId }]);
    expect(noCategory.body.data.results[0].status).toBe("ok");
    expect(noCategory.body.data.results[0].companies).toEqual([
      expect.objectContaining({ company_id: mainCompanyId, action: "created" }),
      expect.objectContaining({ company_id: replicaCompanyId, action: "created", category_skipped: true }),
    ]);
    expect(noCategory.body.data.results[0].companies[0].category_skipped).toBeUndefined();
    expect(noCategory.body.data.warnings.join(" ")).toContain(`empresa ${replicaCompanyId}, 1 producto(s)`);
    expect((await inCompany(mainCompanyId, `${sku}-C`)).category).toMatchObject({ id: mainOnlyCategoryId });
    expect((await inCompany(replicaCompanyId, `${sku}-C`)).category).toBeNull();

    // Categoría global + subcategoría propia: en la réplica se conserva la
    // categoría y solo se quita la subcategoría.
    await send([
      { sku: `${sku}-S`, name: "Sub propia", price_unit: 1, category_id: categoryId, subcategory_id: mainOnlySubId },
    ]);
    const replicaProduct = await inCompany(replicaCompanyId, `${sku}-S`);
    expect(replicaProduct.category).toMatchObject({ id: categoryId });
    expect(replicaProduct.subcategory).toBeNull();

    // Si el producto ya tiene categoría en la réplica, no se la borra.
    await api().put(`/product/update/${replicaProduct.id}`, { category_id: replicaCategoryId });
    await send([{ sku: `${sku}-S`, category_id: mainOnlyCategoryId }]);
    expect((await inCompany(replicaCompanyId, `${sku}-S`)).category).toMatchObject({ id: replicaCategoryId });

    // Categoría que NO sirve en la empresa de la key: error y no se guarda en ninguna.
    const invalid = await send([{ sku: `${sku}-X`, name: "Inválida", price_unit: 1, category_id: replicaCategoryId }]);
    expect(invalid.body.data.results[0]).toMatchObject({ status: "error", code: "INVALID_CATEGORY" });
    expect(await inCompany(mainCompanyId, `${sku}-X`)).toBeUndefined();
    expect(await inCompany(replicaCompanyId, `${sku}-X`)).toBeUndefined();
  });

  it("un producto con error no frena al resto del envío", async () => {
    const res = await publicPost("/products/bulk", {
      replicate: true,
      company_ids: [replicaCompanyId],
      products: [
        { sku: `${sku}-OK`, name: "Correcto", price_unit: 2 },
        { sku: `${sku}-OK`, name: "Repetido", price_unit: 3 },
        { sku: `${sku}-P`, name: "Sin precio" },
      ],
    });
    expect(res.status).toBe(200);
    const bySku = Object.fromEntries(res.body.data.results.map((result: { sku: string }) => [result.sku, result]));
    expect(bySku[`${sku}-P`]).toMatchObject({ status: "error", code: "PRICE_REQUIRED" });
    expect(res.body.data.results.filter((result: { sku: string; status: string }) => result.sku === `${sku}-OK`).map((r: { status: string }) => r.status)).toEqual(["ok", "error"]);
    expect(res.body.data.summary.failed).toBe(2);
  });

  it("la limpieza de imágenes conserva las fotos de productos y borra las subidas abandonadas", async () => {
    const uploadImage = async () =>
      (
        await request(BASE_URL)
          .post("/api/public/products/images")
          .set("X-Api-Key", plainKey)
          .attach("file", PNG_1X1, { filename: "p.png", contentType: "image/png" })
      ).body.data.image_path as string;

    const productImage = await uploadImage();
    const abandonedImage = await uploadImage();
    await publicPost("/products/bulk", { products: [{ sku, image_path: productImage }] });

    // Las dos imágenes pasan a tener más de 24 h (fuera del margen de gracia).
    const fileName = (path: string) => path.split("/").pop();
    await queryRows("UPDATE company_asset SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE company_id = ? AND file_name IN (?, ?)", [
      mainCompanyId,
      fileName(productImage),
      fileName(abandonedImage),
    ]);

    // Cualquier subida nueva dispara la limpieza de la empresa.
    await uploadImage();

    expect((await request(BASE_URL).get(productImage)).status).toBe(200);
    expect((await request(BASE_URL).get(abandonedImage)).status).toBe(404);
  });

  it("un administrador de empresa sin fotos habilitadas no puede subir la foto de un producto", async () => {
    const adminToken = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    const res = await request(BASE_URL)
      .post("/api/product/image")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", PNG_1X1, { filename: "x.png", contentType: "image/png" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PRODUCT_IMAGES_DISABLED");
  });
});
