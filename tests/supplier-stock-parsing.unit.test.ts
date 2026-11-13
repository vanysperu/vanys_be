import {
  ColumnMapError,
  mapStockRows,
  normalizeCode,
  parsePrice,
  parseQuantity,
  resolveColumns,
} from "../src/api/modules/supplier_stock/services/shared/stock_parsing";
import { isBlockedAddress, toDirectDownloadUrl } from "../src/api/modules/supplier_stock/services/shared/safe_download";

// Sprint 2, ítem 6: lectura de los Excel de stock (sin base ni red).
describe("Stock de proveedores: lectura del Excel", () => {
  it("normaliza códigos sin importar mayúsculas, espacios, guiones ni puntos", () => {
    expect(normalizeCode("e1000-02")).toBe("E100002");
    expect(normalizeCode(" E 1000.02 ")).toBe("E100002");
    expect(normalizeCode("E1000_02/A")).toBe("E100002A");
  });

  it("interpreta las cantidades escritas de distintas formas", () => {
    expect(parseQuantity(800)).toBe(800);
    expect(parseQuantity(12.7)).toBe(12);
    expect(parseQuantity("1,200")).toBe(1200);
    expect(parseQuantity("1.200")).toBe(1200);
    expect(parseQuantity("+500")).toBe(500);
    expect(parseQuantity(">1000")).toBe(1000);
    expect(parseQuantity(">= 300")).toBe(300);
    expect(parseQuantity("Más de 250")).toBe(250);
    expect(parseQuantity("150 UND")).toBe(150);
    expect(parseQuantity("Agotado")).toBe(0);
    expect(parseQuantity("sin stock")).toBe(0);
    expect(parseQuantity("Consultar")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
  });

  it("interpreta precios con coma o punto decimal", () => {
    expect(parsePrice(12.5)).toBe(12.5);
    expect(parsePrice("S/ 1,250.90")).toBe(1250.9);
    expect(parsePrice("1250,90")).toBe(1250.9);
    expect(parsePrice("—")).toBeNull();
  });

  it("encuentra las columnas por encabezado (sin tildes ni mayúsculas) o por letra", () => {
    const headers = ["Código", "Descripción", "Color", "STOCK DISPONIBLE", "Precio"];
    expect(resolveColumns(headers, { code: "codigo", quantity: "stock disponible", color: "COLOR" })).toEqual({
      code: 0,
      quantity: 3,
      color: 2,
      description: null,
      price: null,
    });
    expect(resolveColumns([], { code: "A", quantity: "D", price: "E" })).toMatchObject({ code: 0, quantity: 3, price: 4 });
    expect(() => resolveColumns(headers, { code: "SKU interno", quantity: "Stock" })).toThrow(ColumnMapError);
    expect(() => resolveColumns(headers, { code: "", quantity: "Stock" })).toThrow(ColumnMapError);
  });

  it("convierte las filas y salta las que no tienen código", () => {
    const columns = resolveColumns(["Cod", "Desc", "Stock"], { code: "Cod", quantity: "Stock", description: "Desc" });
    const rows = mapStockRows(
      [
        ["E1000-02", "Taza negra", "1,200"],
        [null, "TOTAL", 5000],
        ["", "", ""],
        ["E1000-03", "Taza azul", "Consultar"],
      ],
      columns
    );
    expect(rows).toEqual([
      { codeRaw: "E1000-02", codeNorm: "E100002", color: null, description: "Taza negra", quantity: 1200, quantityText: null, price: null },
      { codeRaw: "E1000-03", codeNorm: "E100003", color: null, description: "Taza azul", quantity: null, quantityText: "Consultar", price: null },
    ]);
  });

  it("rechaza direcciones internas (SSRF)", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.10", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  });

  it("convierte los enlaces de compartir a descarga directa", () => {
    expect(toDirectDownloadUrl("https://drive.google.com/file/d/ABC123/view?usp=sharing").toString()).toBe(
      "https://drive.google.com/uc?export=download&id=ABC123"
    );
    expect(toDirectDownloadUrl("https://docs.google.com/spreadsheets/d/XYZ/edit#gid=0").toString()).toBe(
      "https://docs.google.com/spreadsheets/d/XYZ/export?format=xlsx"
    );
    expect(toDirectDownloadUrl("https://www.dropbox.com/s/abc/stock.xlsx?dl=0").searchParams.get("dl")).toBe("1");
  });
});
