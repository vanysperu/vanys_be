import { literal, Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { SearchTerm, searchTermsOf } from "../../../../../core/utils/searchTerms";
import { ProductAttributes } from "../../model/product.model";

// "_" y "%" son comodines de LIKE: sin escaparlos, TAZA_05 también encontraría
// TAZA-05 y un "%" suelto devolvería todo el catálogo.
const likePattern = (form: string): string => `%${form.replace(/[\\%_]/g, "\\$&")}%`;

// Códigos y colores viven en otra tabla. Valores siempre ESCAPADOS, nunca
// interpolados tal cual.
const productIdsLike = (table: "product_code" | "product_color", column: "code" | "name", forms: string[]) => {
  const matches = forms.map((form) => `child.${column} LIKE ${DataBase.instance.sequelize.escape(likePattern(form))}`);
  return literal(`(SELECT child.product_id FROM ${table} child WHERE ${matches.join(" OR ")})`);
};

const termCondition = ({ forms, colorForms }: SearchTerm): WhereOptions<ProductAttributes> => ({
  [Op.or]: [
    ...forms.map((form) => ({ name: { [Op.like]: likePattern(form) } })),
    ...forms.map((form) => ({ sku: { [Op.like]: likePattern(form) } })),
    { id: { [Op.in]: productIdsLike("product_code", "code", forms) } },
    { id: { [Op.in]: productIdsLike("product_color", "name", colorForms) } },
  ],
});

// Búsqueda general: cada palabra tiene que estar en el nombre, el SKU, un código
// de proveedor o un color. Devuelve una condición por palabra (se unen con AND),
// así "gorra azul" encuentra una gorra que tenga el color azul.
export const productSearchConditions = (text: string): WhereOptions<ProductAttributes>[] =>
  searchTermsOf(text).map(termCondition);
