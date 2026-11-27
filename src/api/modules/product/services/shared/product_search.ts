import { literal, Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { SearchTerm, searchTermsOf } from "../../../../../core/utils/searchTerms";
import { ProductAttributes } from "../../model/product.model";

// "_" y "%" son comodines de LIKE: sin escaparlos, TAZA_05 también encontraría
// TAZA-05 y un "%" suelto devolvería todo el catálogo.
export const likePattern = (form: string): string => `%${form.replace(/[\\%_]/g, "\\$&")}%`;

// Filtro de empresa para las subconsultas de códigos y colores (27-nov,
// velocidad): con él usan los índices (company_id, code) y (company_id, name);
// sin él recorrían esas tablas, las más grandes, de TODAS las empresas en cada
// tecla del buscador. Sin empresa (Super Administrador sin filtro), como antes.
export const companyFilterSql = (alias: string, companyId?: number | null): string =>
  typeof companyId === "number" ? `${alias}.company_id = ${DataBase.instance.sequelize.escape(companyId)} AND ` : "";

// Códigos y colores viven en otra tabla. Valores siempre ESCAPADOS, nunca
// interpolados tal cual.
const productIdsLike = (
  table: "product_code" | "product_color",
  column: "code" | "name",
  forms: string[],
  companyId?: number | null
) => {
  const matches = forms.map((form) => `child.${column} LIKE ${DataBase.instance.sequelize.escape(likePattern(form))}`);
  return literal(`(SELECT child.product_id FROM ${table} child WHERE ${companyFilterSql("child", companyId)}(${matches.join(" OR ")}))`);
};

// Campos donde puede estar una palabra, además de los de siempre. Lo usa la
// API pública (categoría, subcategoría y descripción); la pantalla de
// Productos y la cotización no lo pasan y buscan como siempre.
export type ExtraSearchMatches = (term: SearchTerm) => WhereOptions<ProductAttributes>[];

const termCondition = (term: SearchTerm, extraMatches?: ExtraSearchMatches, companyId?: number | null): WhereOptions<ProductAttributes> => ({
  [Op.or]: [
    ...term.forms.map((form) => ({ name: { [Op.like]: likePattern(form) } })),
    ...term.forms.map((form) => ({ sku: { [Op.like]: likePattern(form) } })),
    { id: { [Op.in]: productIdsLike("product_code", "code", term.forms, companyId) } },
    { id: { [Op.in]: productIdsLike("product_color", "name", term.colorForms, companyId) } },
    ...(extraMatches ? extraMatches(term) : []),
  ],
});

// Búsqueda general: cada palabra tiene que estar en el nombre, el SKU, un código
// de proveedor o un color (más los campos de `extraMatches`, si llegan).
// Devuelve una condición por palabra (se unen con AND), así "gorra azul"
// encuentra una gorra que tenga el color azul.
// `companyId` (opcional): la empresa de la búsqueda, para que las subconsultas usen sus índices.
export const productSearchConditions = (
  text: string,
  extraMatches?: ExtraSearchMatches,
  companyId?: number | null
): WhereOptions<ProductAttributes>[] => searchTermsOf(text).map((term) => termCondition(term, extraMatches, companyId));
