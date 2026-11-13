import request from "supertest";
import * as XLSX from "xlsx";
import { authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// Excel de prueba con título arriba (el encabezado está en la fila 2), como
// suelen venir los de las importadoras.
const buildXlsx = (rows: unknown[][]): Buffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Stock");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

interface SourceDto {
  id: number;
  itemCount: number;
  last_status: string;
  last_error: string | null;
}

interface Lookup {
  productId: number;
  total: number;
  sources: { sourceId: number; quantity: number; quantityTexts: string[]; byColor: { color: string; quantity: number }[]; stale: boolean }[];
}

/**
 * Sprint 2, ítem 6 (pedido del usuario): el stock de cada importadora se lee de
 * su Excel y al cotizar se ve cuánto hay en cada una, por separado, y la suma.
 */
describe("Stock de proveedores", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  const stamp = wordStamp().slice(0, 6).toUpperCase();
  const code = (base: string) => `${base}${stamp}`;
  const admin = () => authedRequest(ctx.admin.token);
  const upload = (path: string, file: Buffer, name: string, fields: Record<string, string>) => {
    const req = request(BASE_URL).post(`/api${path}`).set("Authorization", `Bearer ${ctx.admin.token}`).attach("file", file, name);
    return Object.entries(fields).reduce((pending, [key, value]) => pending.field(key, value), req);
  };

  let supplierA: number;
  let supplierB: number;
  let mugId: number;
  let cupId: number;
  let otherCupId: number;
  let sourceA: SourceDto;
  let sourceB: SourceDto;

  const fileA = () =>
    buildXlsx([
      ["STOCK IMPORTADORA A — NOVIEMBRE"],
      ["Código", "Descripción", "Stock"],
      [code("E1000-02"), "Taza negra", "800"],
      [code("E1000-03"), "Taza azul", 400],
      [code("E1000-09"), "Taza roja", "Consultar"],
      [code("LIBRE-1"), "Sin producto", 50],
      [null, "TOTAL", 1250],
    ]);
  const csvB = () => Buffer.from(`codigo;stock\n${code("mug.77")};1.500\n${code("TZ-900")};+300\n`, "utf8");

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);

    supplierA = (await admin().post("/supplier/create", { name: `Importadora A ${stamp}` })).body.data.id;
    supplierB = (await admin().post("/supplier/create", { name: `Importadora B ${stamp}` })).body.data.id;
    const createProduct = async (body: object) => {
      const res = await admin().post("/product/create", { company_id: ctx.companyId, price_unit: 5, ...body });
      expect(res.status).toBe(201);
      return res.body.data.id as number;
    };
    cupId = await createProduct({
      name: `Taza ${stamp}`,
      colors: [{ name: "Negro" }, { name: "Azul" }],
      codes: [
        { code: code("E1000-02"), supplier_id: supplierA, color: "Negro" },
        { code: code("E1000-03"), supplier_id: supplierA, color: "Azul" },
        { code: code("E1000-09"), supplier_id: supplierA },
      ],
    });
    // Llega por su SKU (la importadora B lo lista con ese código).
    mugId = await createProduct({ name: `Jarro ${stamp}`, sku: code("TZ900"), codes: [{ code: code("MUG77"), supplier_id: supplierB }] });
    // D6: mismo código que la taza negra, pero de la importadora B: el Excel
    // de A no le corresponde.
    otherCupId = await createProduct({ name: `Otra taza ${stamp}`, codes: [{ code: code("E1000-02"), supplier_id: supplierB }] });
  }, 90_000);

  it("sin la funcionalidad contratada, la empresa no puede usar el módulo", async () => {
    const res = await admin().get(`/supplier-stock/lookup?productIds=${cupId}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FEATURE_DISABLED");

    const enabled = await authedRequest(superToken).put(`/company-feature/${ctx.companyId}`, { features: { supplier_stock: true } });
    expect(enabled.status).toBe(200);
  });

  it("probar la fuente muestra el encabezado y cómo se lee cada columna, sin guardar nada", async () => {
    const res = await upload("/supplier-stock/preview", fileA(), "stock-a.xlsx", {
      header_row: "2",
      column_map: JSON.stringify({ code: "codigo", quantity: "STOCK", description: "Descripción" }),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.headers).toEqual(["Código", "Descripción", "Stock"]);
    expect(res.body.data.parsedCount).toBe(4);
    expect(res.body.data.parsed[0]).toMatchObject({ codeRaw: code("E1000-02"), quantity: 800, description: "Taza negra" });

    const wrong = await upload("/supplier-stock/preview", fileA(), "stock-a.xlsx", {
      header_row: "2",
      column_map: JSON.stringify({ code: "SKU", quantity: "Stock" }),
    });
    expect(wrong.status).toBe(200);
    expect(wrong.body.data.mappingError).toContain("SKU");
  });

  it("crea las fuentes y las actualiza subiendo el archivo", async () => {
    const created = await admin().post("/supplier-stock/sources", {
      supplier_id: supplierA,
      name: "Excel A",
      source_type: "upload",
      header_row: 2,
      column_map: { code: "Código", quantity: "Stock", description: "Descripción" },
      refresh_minutes: 360,
    });
    expect(created.status).toBe(201);
    const refreshed = await upload(`/supplier-stock/sources/${created.body.data.id}/refresh`, fileA(), "stock-a.xlsx", {});
    expect(refreshed.status).toBe(200);
    sourceA = refreshed.body.data;
    expect(sourceA).toMatchObject({ itemCount: 4, last_status: "ok" });

    const createdB = await admin().post("/supplier-stock/sources", {
      supplier_id: supplierB,
      name: "CSV B",
      source_type: "upload",
      header_row: 1,
      // Por letra de columna.
      column_map: { code: "A", quantity: "B" },
      refresh_minutes: 360,
    });
    const refreshedB = await upload(`/supplier-stock/sources/${createdB.body.data.id}/refresh`, csvB(), "stock-b.csv", {});
    expect(refreshedB.status).toBe(200);
    sourceB = refreshedB.body.data;
    expect(sourceB.itemCount).toBe(2);
  });

  it("al cotizar: cada fuente por separado, por color y el total, en una sola llamada", async () => {
    const res = await admin().get(`/supplier-stock/lookup?productIds=${cupId},${mugId},${otherCupId}`);
    expect(res.status).toBe(200);
    const byProduct = new Map((res.body.data as Lookup[]).map((entry) => [entry.productId, entry]));

    const cup = byProduct.get(cupId);
    expect(cup?.total).toBe(1200);
    expect(cup?.sources).toHaveLength(1);
    expect(cup?.sources[0]).toMatchObject({ sourceId: sourceA.id, quantity: 1200, quantityTexts: ["Consultar"], stale: false });
    expect(cup?.sources[0]?.byColor).toEqual(
      expect.arrayContaining([
        { color: "Negro", quantity: 800 },
        { color: "Azul", quantity: 400 },
      ])
    );

    // Por código de proveedor (MUG.77 = MUG77) y por SKU (TZ-900 = TZ900).
    expect(byProduct.get(mugId)).toMatchObject({ total: 1800, sources: [{ sourceId: sourceB.id, quantity: 1800 }] });
    // D6: el código de la importadora B no toma el stock del Excel de A.
    expect(byProduct.get(otherCupId)).toMatchObject({ total: 0, sources: [] });
  });

  it("la pantalla de stock busca por código y lista lo que no tiene producto", async () => {
    // La empresa es desechable: "e1000" solo encuentra las tres tazas del Excel A.
    const res = await admin().get("/supplier-stock/search?searchTerm=e1000&page=1&limit=10");
    expect(res.status).toBe(200);
    expect(res.body.data.meta.total).toBe(3);
    const negra = (res.body.data.data as { code: string; products: { id: number }[]; total: number }[]).find((row) => row.code === code("E1000-02"));
    expect(negra?.total).toBe(800);
    expect(negra?.products.map((product) => product.id).sort()).toEqual([cupId, otherCupId].sort());

    const unlinked = await admin().get(`/supplier-stock/search?searchTerm=${stamp}&onlyUnlinked=true&page=1&limit=10`);
    expect((unlinked.body.data.data as { code: string }[]).map((row) => row.code)).toEqual([code("LIBRE-1")]);
  });

  it("si una lectura falla, queda la última buena y la fuente muestra el error", async () => {
    const bad = buildXlsx([["Otra cosa"], ["Nada", "que ver"]]);
    const res = await upload(`/supplier-stock/sources/${sourceA.id}/refresh`, bad, "malo.xlsx", {});
    expect(res.status).toBe(422);

    const lookup = await admin().get(`/supplier-stock/lookup?productIds=${cupId}`);
    expect((lookup.body.data as Lookup[])[0]?.total).toBe(1200);
    const sources = await admin().get("/supplier-stock/sources?page=1&limit=10");
    const saved = (sources.body.data.data as SourceDto[]).find((source) => source.id === sourceA.id);
    expect(saved).toMatchObject({ last_status: "error", itemCount: 4 });

    const imports = await admin().get(`/supplier-stock/sources/${sourceA.id}/imports?page=1&limit=10`);
    expect((imports.body.data.data as { status: string }[]).map((entry) => entry.status)).toEqual(["error", "ok"]);
  });

  it("los enlaces internos o sin https se rechazan (SSRF)", async () => {
    const httpOnly = await admin().post("/supplier-stock/preview", { url: "http://example.com/stock.xlsx", header_row: 1 });
    expect(httpOnly.status).toBe(400);
    expect(httpOnly.body.code).toBe("STOCK_URL_NOT_ALLOWED");

    for (const url of ["https://127.0.0.1/stock.xlsx", "https://localhost/stock.xlsx", "https://169.254.169.254/latest/meta-data"]) {
      const res = await admin().post("/supplier-stock/preview", { url, header_row: 1 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("STOCK_URL_NOT_ALLOWED");
    }
  });

  it("el Gestor consulta el stock pero no administra las fuentes", async () => {
    const gestor = authedRequest(ctx.gestor.token);
    expect((await gestor.get(`/supplier-stock/lookup?productIds=${cupId}`)).status).toBe(200);
    expect((await gestor.get("/supplier-stock/sources")).status).toBe(403);
    expect((await gestor.post("/supplier-stock/preview", { url: "https://example.com/x.xlsx", header_row: 1 })).status).toBe(403);
  });
});
