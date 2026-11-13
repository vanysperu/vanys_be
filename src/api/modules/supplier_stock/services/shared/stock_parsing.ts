import type { ColumnMap } from "../../model/supplier_stock.models";

// Lógica pura de lectura del Excel (sin base ni red): se prueba sola en
// tests/supplier-stock-parsing.unit.test.ts. Las reglas propias de cada
// proveedor se agregan acá cuando lleguen sus Excel reales.

// Mayúsculas, sin espacios, guiones, puntos, barras ni guiones bajos:
// "e1000-02", "E 1000.02" y "E1000_02" son el mismo código.
export const normalizeCode = (value: string): string => value.toUpperCase().replace(/[\s\-._/\\]+/g, "");

// Encabezados comparados sin mayúsculas, tildes ni espacios sobrantes.
const normalizeHeader = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

// "A" -> 0, "B" -> 1, "AA" -> 26. null si no es una letra de columna. Hasta 2
// letras (columna ZZ): con 3, un encabezado como "SKU" o "COD" se tomaría como
// letra de columna en vez de avisar que no existe.
const columnLetterToIndex = (value: string): number | null => {
  const letters = value.trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(letters)) return null;
  return [...letters].reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
};

export interface ResolvedColumns {
  code: number;
  quantity: number;
  color: number | null;
  description: number | null;
  price: number | null;
}

export class ColumnMapError extends Error {}

// Busca cada columna por su encabezado; si no aparece y el valor es una letra
// ("C"), usa esa columna. Así sirve para Excel con o sin encabezados.
export const resolveColumns = (headers: readonly unknown[], map: ColumnMap): ResolvedColumns => {
  const normalized = headers.map((header) => normalizeHeader(String(header ?? "")));
  const find = (wanted: string | null | undefined, label: string, required: boolean): number | null => {
    const value = wanted?.trim();
    if (!value) {
      if (required) throw new ColumnMapError(`Falta indicar la columna de ${label}`);
      return null;
    }
    const byHeader = normalized.indexOf(normalizeHeader(value));
    if (byHeader !== -1) return byHeader;
    const byLetter = columnLetterToIndex(value);
    if (byLetter !== null) return byLetter;
    throw new ColumnMapError(`No encontré la columna "${value}" (${label}) en el encabezado`);
  };

  return {
    code: find(map.code, "código", true) as number,
    quantity: find(map.quantity, "stock", true) as number,
    color: find(map.color, "color", false),
    description: find(map.description, "descripción", false),
    price: find(map.price, "precio", false),
  };
};

// Textos que significan "no hay".
const OUT_OF_STOCK = new Set(["AGOTADO", "SIN STOCK", "NO HAY", "-", "--", "0", "N/A", "NA"]);

// Cantidad entera de un valor de celda. Entiende números, "1,200", "1.200",
// "+500", ">1000", "más de 300", "Agotado". Lo que no entiende devuelve null
// (y se guarda el texto para mostrarlo tal cual).
export const parseQuantity = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : null;
  const text = String(raw ?? "").trim().toUpperCase();
  if (!text) return null;
  if (OUT_OF_STOCK.has(text)) return 0;

  // Quita lo que no cambia el número: "+", ">", "MAS DE", "MÁS DE", "UND", "UNID".
  const cleaned = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(\+|>=|>|MAS DE|MAYOR A)\s*/, "")
    .replace(/\s*(UNIDADES|UNIDAD|UNID|UND|UN|PZAS|PZ)\.?$/, "")
    .trim();
  // Separador de miles con coma o punto (1,200 / 1.200 / 12.500): sin
  // decimales en un stock, cualquiera de los dos se quita.
  if (!/^\d{1,3}([.,]\d{3})+$|^\d+$/.test(cleaned)) return null;
  return Number(cleaned.replace(/[.,]/g, ""));
};

// Precio con decimales ("12.50", "S/ 1,250.90"). null si no es un número.
export const parsePrice = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const text = String(raw ?? "").replace(/[^\d.,-]/g, "");
  if (!text) return null;
  // "1,250.90" -> coma de miles; "1250,90" -> coma decimal.
  const normalized = /,\d{1,2}$/.test(text) ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

const cellText = (row: readonly unknown[], index: number | null, max: number): string | null => {
  if (index === null) return null;
  const value = row[index];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
};

export interface ParsedStockRow {
  codeRaw: string;
  codeNorm: string;
  color: string | null;
  description: string | null;
  quantity: number | null;
  quantityText: string | null;
  price: number | null;
}

// Filas del Excel (ya sin el encabezado) a filas de stock. Se saltan las
// filas sin código (títulos, totales, filas vacías).
export const mapStockRows = (rows: readonly (readonly unknown[])[], columns: ResolvedColumns): ParsedStockRow[] =>
  rows.flatMap((row) => {
    const codeRaw = cellText(row, columns.code, 100);
    if (!codeRaw) return [];
    const codeNorm = normalizeCode(codeRaw);
    if (!codeNorm) return [];
    const quantityRaw = row[columns.quantity];
    const quantity = parseQuantity(quantityRaw);
    return [
      {
        codeRaw,
        codeNorm,
        color: cellText(row, columns.color, 100),
        description: cellText(row, columns.description, 255),
        quantity,
        quantityText: quantity === null ? cellText(row, columns.quantity, 60) : null,
        price: columns.price === null ? null : parsePrice(row[columns.price]),
      },
    ];
  });
