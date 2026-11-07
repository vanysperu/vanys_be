import request from "supertest";
import { searchTermsOf } from "../src/core/utils/searchTerms";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

const PRODUCTS = [
  { sku: "GOR-01", name: "Gorra trucker", price_unit: 10, colors: [{ name: "Negro" }, { name: "Azul" }], codes: [{ code: "B3010-03" }] },
  { sku: "GOR-02", name: "Gorra de algodón", price_unit: 10, colors: [{ name: "Blanco" }] },
  { sku: "LAP-03", name: "Lápiz grafito", price_unit: 2 },
  { sku: "BOT-04", name: "Botón metálico", price_unit: 1 },
  { sku: "TAZA_05", name: "Taza mágica 11 oz", price_unit: 18 },
  { sku: "TAZA-06", name: "Taza simple", price_unit: 9 },
  { sku: "PLA-07", name: "Plato hondo", price_unit: 7 },
  { sku: "CHA-08", name: "Chaleco", price_unit: 30, colors: [{ name: "Gris" }] },
];

describe("Buscador flexible de productos", () => {
  let superToken: string;
  let company: CashClosingTestCompany;
  let apiKeyId: number;
  let plainKey: string;

  const skusFor = async (search: string): Promise<string[]> => {
    const res = await request(BASE_URL).get(`/api/public/products?limit=100&search=${encodeURIComponent(search)}`).set("X-Api-Key", plainKey);
    expect(res.status).toBe(200);
    return (res.body.data.data as { sku: string }[]).map((product) => product.sku).sort();
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    company = await createCashClosingTestCompany(superToken);
    const key = await authedRequest(superToken).post("/api-key/create", { company_id: company.companyId, name: `Jest buscador ${wordStamp()}` });
    expect(key.status).toBe(201);
    apiKeyId = key.body.data.id;
    plainKey = key.body.data.plain_key;
    const bulk = await request(BASE_URL).post("/api/public/products/bulk").set("X-Api-Key", plainKey).send({ products: PRODUCTS });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.summary.failed).toBe(0);
  }, 60_000);

  afterAll(async () => {
    if (apiKeyId) await authedRequest(superToken).put(`/api-key/disable/${apiKeyId}`);
    if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
  });

  it.each([
    ["el plural encuentra el singular", "gorras", ["GOR-01", "GOR-02"]],
    ["el singular sigue funcionando", "gorra", ["GOR-01", "GOR-02"]],
    ["sin importar mayúsculas", "GORRAS", ["GOR-01", "GOR-02"]],
    ["plural en -ces", "lapices", ["LAP-03"]],
    ["plural en -es, sin acento", "botones", ["BOT-04"]],
    ["sin acento", "magica", ["TAZA_05"]],
    ["en cualquier orden", "magica taza", ["TAZA_05"]],
    ["ignora palabras vacías", "gorra de algodon", ["GOR-02"]],
  ])("%s: %s", async (_label, search, expected) => {
    expect(await skusFor(search)).toEqual(expected);
  });

  it("combina nombre y color, también en plural y con el otro género", async () => {
    expect(await skusFor("gorra azul")).toEqual(["GOR-01"]);
    expect(await skusFor("gorras negras")).toEqual(["GOR-01"]);
    expect(await skusFor("gorras blancas")).toEqual(["GOR-02"]);
    expect(await skusFor("chalecos grises")).toEqual(["CHA-08"]);
    expect(await skusFor("gorra roja")).toEqual([]);
  });

  it("busca por SKU y por código de proveedor", async () => {
    expect(await skusFor("gor-01")).toEqual(["GOR-01"]);
    expect(await skusFor("B3010-03")).toEqual(["GOR-01"]);
    expect(await skusFor("b3010")).toEqual(["GOR-01"]);
  });

  it("no inventa coincidencias: plata no es plato y los comodines son literales", async () => {
    expect(await skusFor("plata")).toEqual([]);
    expect(await skusFor("TAZA_05")).toEqual(["TAZA_05"]);
    expect(await skusFor("%")).toEqual([]);
    expect(await skusFor("xyz-no-existe")).toEqual([]);
  });

  it("un producto deshabilitado sigue sin salir", async () => {
    const list = await authedRequest(company.admin.token).get(`/product/list?page=1&limit=100&companyId=${company.companyId}&searchTerm=plato`);
    const product = (list.body.data.data as { id: number; sku: string }[]).find((row) => row.sku === "PLA-07");
    expect(product).toBeDefined();
    expect((await authedRequest(company.admin.token).put(`/product/disable/${product?.id}`, {})).status).toBe(200);
    expect(await skusFor("plato")).toEqual([]);
  });

  it("la pantalla de productos usa el mismo buscador", async () => {
    const res = await authedRequest(company.admin.token).get(`/product/list?page=1&limit=100&companyId=${company.companyId}&searchTerm=gorras`);
    expect(res.status).toBe(200);
    expect((res.body.data.data as { sku: string }[]).map((row) => row.sku).sort()).toEqual(["GOR-01", "GOR-02"]);
  });

  describe("interpretación de las palabras", () => {
    const formsOf = (text: string) => searchTermsOf(text).map((term) => term.forms);

    it("no recorta SKU, códigos ni palabras cortas", () => {
      expect(formsOf("A3S")).toEqual([["a3s"]]);
      expect(formsOf("gas")).toEqual([["gas"]]);
      expect(formsOf("11 oz")).toEqual([["11"], ["oz"]]);
    });

    it("si todo son palabras vacías, las busca igual", () => {
      expect(formsOf("de la")).toEqual([["de"], ["la"]]);
    });

    it("limita las palabras y quita repetidas", () => {
      expect(searchTermsOf("uno dos tres cuatro cinco seis siete ocho")).toHaveLength(6);
      expect(searchTermsOf("gorra gorra")).toHaveLength(1);
      expect(searchTermsOf(" , ; ")).toEqual([]);
    });
  });
});
