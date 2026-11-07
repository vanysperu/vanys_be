import request from "supertest";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";

// Catálogo de la web (GET /api/public/products y /api/public/product-categories):
// búsqueda en categoría, subcategoría y descripción; orden por precio y por
// categoría; orden estable; sin categoría; varios SKU y cantidades por
// categoría. Empresa nueva por corrida: el catálogo tiene solo estos productos.

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface PublicProduct {
  id: number;
  sku: string;
  category: { id: number; name: string } | null;
  subcategory: { id: number; name: string } | null;
}

interface PublicCategory {
  id: number;
  is_global: boolean;
  product_count: number;
}

interface CategoriesSummary {
  total: number;
  without_category: number;
}

describe("Catálogo público para la web", () => {
  const stamp = wordStamp();
  const names = {
    drinks: `Bebidas ${stamp}`,
    tech: `Tecnología ${stamp}`,
    wireless: `Inalámbricos ${stamp}`,
    global: `Globales ${stamp}`,
    retired: `Descontinuados ${stamp}`,
  };
  let superToken: string;
  let companyId: number;
  let apiKeyId: number;
  let plainKey: string;
  const ids: Record<"drinks" | "tech" | "wireless" | "global" | "retired", number> = {
    drinks: 0,
    tech: 0,
    wireless: 0,
    global: 0,
    retired: 0,
  };
  const createdVariableIds: number[] = [];

  const api = () => authedRequest(superToken);
  const publicGet = (path: string) => request(BASE_URL).get(`/api/public${path}`).set("X-Api-Key", plainKey);

  const productsFor = async (query: string): Promise<PublicProduct[]> => {
    const res = await publicGet(`/products?limit=100&${query}`);
    expect(res.status).toBe(200);
    return res.body.data.data as PublicProduct[];
  };
  const skusFor = async (query: string): Promise<string[]> => (await productsFor(query)).map((product) => product.sku);
  const sortedSkusFor = async (search: string): Promise<string[]> => (await skusFor(`search=${encodeURIComponent(search)}`)).sort();

  // Todas las páginas de categorías (con include_global hay globales de otras pruebas).
  const allCategories = async (query: string): Promise<{ rows: PublicCategory[]; summary: CategoriesSummary }> => {
    const rows: PublicCategory[] = [];
    let summary: CategoriesSummary = { total: -1, without_category: -1 };
    for (let page = 1; page <= 20; page += 1) {
      const res = await publicGet(`/product-categories?limit=100&page=${page}&${query}`);
      expect(res.status).toBe(200);
      rows.push(...(res.body.data.data as PublicCategory[]));
      summary = res.body.data.summary as CategoriesSummary;
      if (page >= res.body.data.meta.totalPages) break;
    }
    return { rows, summary };
  };

  const createVariable = async (body: object): Promise<number> => {
    const res = await api().post("/variable_general/create", { title: "T", prefix_id: `PC${Date.now()}${createdVariableIds.length}`, ...body });
    expect([200, 201]).toContain(res.status);
    createdVariableIds.push(Number(res.body.data.id));
    return Number(res.body.data.id);
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await api().post("/company/create", { ruc: `20${String(Date.now()).slice(-9)}`, business_name: `Catalogo web ${stamp}` });
    expect(company.status).toBe(201);
    companyId = Number(company.body.data.id);

    ids.drinks = await createVariable({ category: "product_category", name: names.drinks, company_id: companyId });
    ids.tech = await createVariable({ category: "product_category", name: names.tech, company_id: companyId });
    ids.wireless = await createVariable({
      category: "product_subcategory",
      name: names.wireless,
      ref1: String(ids.tech),
      company_id: companyId,
    });
    ids.retired = await createVariable({ category: "product_category", name: names.retired, company_id: companyId });
    // Global: sirve a todas las empresas.
    ids.global = await createVariable({ category: "product_category", name: names.global });

    const key = await api().post("/api-key/create", { company_id: companyId, name: `Jest catálogo ${stamp}` });
    expect(key.status).toBe(201);
    apiKeyId = key.body.data.id;
    plainKey = key.body.data.plain_key;

    // price_unit igual en todos: ordenar por él es un empate total.
    const products = [
      { sku: "TER-01", name: "Termo acero 500ml", price_unit: 10, price_hundred: 20, category_id: ids.drinks, description: "Botella térmica de acero" },
      { sku: "TER-02", name: "Termo infantil", price_unit: 10, price_hundred: 15, category_id: ids.drinks, description: "Para niño, medida 10*26CM" },
      { sku: "MAT-03", name: "Bolsa de tela", price_unit: 10, price_hundred: null, description: "Material interior resistente" },
      { sku: "BOT-04", name: "Botella deportiva", price_unit: 10, price_hundred: 0, category_id: ids.tech, description: "Capacidad 1500ML" },
      {
        sku: "LAP-MT001",
        name: "Audífonos bluetooth",
        price_unit: 10,
        price_hundred: 35,
        category_id: ids.tech,
        subcategory_id: ids.wireless,
        codes: [{ code: "J1000-01-2" }],
      },
      { sku: "GLO-06", name: "Taza blanca", price_unit: 10, price_hundred: 10, category_id: ids.global },
      { sku: "DIS-07", name: "Gorra clásica", price_unit: 10, price_hundred: 12, category_id: ids.retired },
      { sku: "OFF-08", name: "Termo apagado", price_unit: 10, price_hundred: 5, category_id: ids.drinks },
    ];
    const bulk = await request(BASE_URL).post("/api/public/products/bulk").set("X-Api-Key", plainKey).send({ products });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.summary.failed).toBe(0);

    // Un producto deshabilitado y una categoría deshabilitada.
    const offId = bulk.body.data.results.find((row: { sku: string }) => row.sku === "OFF-08").companies[0].product_id;
    expect((await api().put(`/product/disable/${offId}`, {})).status).toBe(200);
    expect((await api().put(`/variable_general/disable/${ids.retired}`)).status).toBe(200);
  }, 60_000);

  afterAll(async () => {
    if (apiKeyId) await api().put(`/api-key/disable/${apiKeyId}`);
    // Se borran (subcategoría primero); los productos quedan sin categoría.
    for (const id of [...createdVariableIds].reverse()) await api().delete(`/variable_general/delete/${id}`);
    if (companyId) await api().put(`/company/disable/${companyId}`);
  });

  describe("search", () => {
    it.each([
      ["nombre de la categoría", "bebidas", ["TER-01", "TER-02"]],
      ["categoría sin acento", "tecnologia", ["BOT-04", "LAP-MT001"]],
      ["nombre de la subcategoría", "inalambricos", ["LAP-MT001"]],
      ["cada palabra en un campo distinto", "audifonos tecnologia", ["LAP-MT001"]],
      ["descripción, con acentos", "termica", ["TER-01"]],
      ["plurales, acentos y palabras vacías", "termos para niño", ["TER-02"]],
      ["descripción: cualquier signo separa palabras", "26cm", ["TER-02"]],
      ["descripción: 500ml no encuentra 1500ML", "500ml", ["TER-01"]],
      ["descripción: solo por inicio de palabra", "terior", []],
      ["no busca en una categoría deshabilitada", "descontinuados", []],
    ])("%s: %s", async (_label, search, expected) => {
      expect(await sortedSkusFor(search)).toEqual(expected);
    });

    it.each([
      ["palabra incompleta", "ter", ["TER-01", "TER-02"]],
      ["SKU con guion completo", "LAP-MT001", ["LAP-MT001"]],
      ["SKU con guion a medias", "lap-mt", ["LAP-MT001"]],
      ["código completo", "J1000-01-2", ["LAP-MT001"]],
      ["código a medias", "J1000", ["LAP-MT001"]],
    ])("%s: %s", async (_label, search, expected) => {
      expect(await sortedSkusFor(search)).toEqual(expected);
    });

    it("nunca devuelve productos deshabilitados", async () => {
      expect(await sortedSkusFor("termo")).toEqual(["TER-01", "TER-02"]);
      expect(await skusFor("sku=OFF-08")).toEqual([]);
    });

    it("la pantalla de Productos sigue sin buscar en la categoría", async () => {
      const res = await api().get(`/product/list?page=1&limit=100&companyId=${companyId}&searchTerm=bebidas`);
      expect(res.status).toBe(200);
      expect(res.body.data.data).toEqual([]);
    });
  });

  describe("orderBy", () => {
    it("price_hundred asc: menor precio primero y los sin precio (null o 0) al final", async () => {
      const skus = await skusFor("orderBy=price_hundred&orderDir=asc");
      expect(skus.slice(0, 5)).toEqual(["GLO-06", "DIS-07", "TER-02", "TER-01", "LAP-MT001"]);
      expect(skus.slice(5).sort()).toEqual(["BOT-04", "MAT-03"]);
    });

    it("price_hundred desc: los sin precio también al final", async () => {
      const skus = await skusFor("orderBy=price_hundred&orderDir=desc");
      expect(skus.slice(0, 5)).toEqual(["LAP-MT001", "TER-01", "TER-02", "DIS-07", "GLO-06"]);
      expect(skus.slice(5).sort()).toEqual(["BOT-04", "MAT-03"]);
    });

    it("category: por nombre de categoría, SKU dentro de cada una y sin categoría al final", async () => {
      expect(await skusFor("orderBy=category&orderDir=asc")).toEqual(["TER-01", "TER-02", "GLO-06", "BOT-04", "LAP-MT001", "DIS-07", "MAT-03"]);
      expect(await skusFor("orderBy=category&orderDir=desc")).toEqual(["BOT-04", "LAP-MT001", "GLO-06", "TER-01", "TER-02", "DIS-07", "MAT-03"]);
    });

    it.each(["created_at", "price_unit", "price_hundred", "category", "name"])(
      "%s: paginar de a 2 no repite ni salta productos",
      async (orderBy) => {
        const seen: number[] = [];
        for (let page = 1; page <= 4; page += 1) {
          const res = await publicGet(`/products?limit=2&page=${page}&orderBy=${orderBy}`);
          expect(res.status).toBe(200);
          seen.push(...(res.body.data.data as PublicProduct[]).map((product) => product.id));
        }
        expect(seen).toHaveLength(7);
        expect(new Set(seen).size).toBe(7);
      }
    );

    it("rechaza un orderBy desconocido", async () => {
      expect((await publicGet("/products?orderBy=company_id")).status).toBe(400);
    });
  });

  describe("categorías", () => {
    it("without_category: sin categoría o con la categoría deshabilitada", async () => {
      const products = await productsFor("without_category=true&orderBy=sku&orderDir=asc");
      expect(products.map((product) => product.sku)).toEqual(["DIS-07", "MAT-03"]);
      // La tarjeta y el menú coinciden: la categoría deshabilitada sale como null.
      expect(products.every((product) => product.category === null && product.subcategory === null)).toBe(true);
    });

    it("without_category con category_id responde 400 VALIDATION_ERROR", async () => {
      const res = await publicGet(`/products?without_category=true&category_id=${ids.drinks}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("category_id funciona con categorías globales y no con una deshabilitada", async () => {
      expect(await skusFor(`category_id=${ids.global}`)).toEqual(["GLO-06"]);
      expect(await skusFor(`category_id=${ids.retired}`)).toEqual([]);
    });

    it("cada producto trae su categoría y subcategoría vigentes", async () => {
      const [product] = await productsFor("sku=LAP-MT001");
      expect(product?.category).toEqual({ id: ids.tech, name: names.tech });
      expect(product?.subcategory).toEqual({ id: ids.wireless, name: names.wireless });
    });
  });

  describe("skus", () => {
    it("coincidencia exacta sin distinguir mayúsculas; los inexistentes no se devuelven", async () => {
      const skus = await skusFor(`skus=${encodeURIComponent("ter-01, TER-02 ,LAP-MT001,NOPE-99")}`);
      expect(skus.sort()).toEqual(["LAP-MT001", "TER-01", "TER-02"]);
      // Exacto: "TER" no es ningún SKU.
      expect(await skusFor("skus=TER")).toEqual([]);
    });

    it("un SKU deshabilitado no se devuelve y una lista vacía no trae nada", async () => {
      expect(await skusFor("skus=OFF-08")).toEqual([]);
      expect(await skusFor("skus=,,")).toEqual([]);
    });

    it("más de 100 SKU responde 400 VALIDATION_ERROR", async () => {
      const many = Array.from({ length: 101 }, (_, index) => `SKU-${index}`).join(",");
      const res = await publicGet(`/products?skus=${many}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect((await publicGet(`/products?skus=${many.split(",").slice(0, 100).join(",")}`)).status).toBe(200);
    });
  });

  describe("GET /product-categories con cantidades", () => {
    it("product_count por categoría y resumen que cuadra con el total", async () => {
      const { rows, summary } = await allCategories("include_global=true");
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(ids.drinks)?.product_count).toBe(2);
      expect(byId.get(ids.tech)?.product_count).toBe(2);
      expect(byId.get(ids.global)).toMatchObject({ is_global: true, product_count: 1 });
      // La deshabilitada no se lista; su producto cuenta como sin categoría.
      expect(byId.has(ids.retired)).toBe(false);
      expect(summary).toEqual({ total: 7, without_category: 2 });
      const sum = rows.reduce((total, row) => total + row.product_count, 0);
      expect(sum + summary.without_category).toBe(summary.total);
    });

    it.each(["termo", "tecnologia", "ter", "26cm", "sin-resultados-xyz"])(
      "con search=%s las cantidades cuadran con meta.total de products",
      async (search) => {
        const { rows, summary } = await allCategories(`include_global=true&search=${encodeURIComponent(search)}`);
        const products = await publicGet(`/products?limit=1&search=${encodeURIComponent(search)}`);
        expect(summary.total).toBe(products.body.data.meta.total);
        const sum = rows.reduce((total, row) => total + row.product_count, 0);
        expect(sum + summary.without_category).toBe(summary.total);
        // Las categorías sin resultados siguen en la lista, con 0.
        expect(rows.some((row) => row.id === ids.drinks)).toBe(true);
      }
    );

    it("search=termo: solo Bebidas tiene productos", async () => {
      const { rows, summary } = await allCategories("include_global=true&search=termo");
      expect(rows.filter((row) => row.product_count > 0).map((row) => [row.id, row.product_count])).toEqual([[ids.drinks, 2]]);
      expect(summary).toEqual({ total: 2, without_category: 0 });
    });
  });

  it("la forma de cada producto solo suma el pedido mínimo", async () => {
    const [product] = await productsFor("sku=TER-01");
    expect(Object.keys(product ?? {}).sort()).toEqual(
      [
        "category",
        "codes",
        "colors",
        "description",
        "id",
        "image_url",
        // Pedido mínimo: el único campo nuevo (pedido explícito del usuario).
        "min_order_quantity",
        "name",
        "price_half_thousand",
        "price_hundred",
        "price_thousand",
        "price_unit",
        "requires_customization",
        "sku",
        "subcategory",
      ].sort()
    );
  });
});
