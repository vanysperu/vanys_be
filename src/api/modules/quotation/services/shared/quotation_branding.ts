import { DataBase } from "../../../../../database";
import { CompanyModel } from "../../../company/model/company.model";
import { VariableGeneralModel } from "../../../variable_general/models/variable_general.model";

// Azul de Vanys (seeder 20261021140000-vanys-default-theme.js).
export const DEFAULT_BRAND_COLOR = "#002E77";

export interface QuotationBranding {
  company: CompanyModel | null;
  // Cuentas que el cliente ve para pagar: activas y marcadas "mostrar en la
  // cotización" (las internas nunca salen).
  paymentAccounts: VariableGeneralModel[];
  brandColor: string;
}

/**
 * Marca de la empresa en todo lo que ve el cliente: el PDF y la vista pública
 * de la cotización (Sprint 2, ítem 7). Un solo lugar, así las dos muestran
 * exactamente lo mismo.
 */
export async function loadQuotationBranding(companyId: number): Promise<QuotationBranding> {
  const company = await DataBase.instance.company.findOne({ where: { id: companyId } });
  const paymentAccounts = await DataBase.instance.variable_general.findAll({
    where: { category: "payment_account", company_id: companyId, is_deleted: false, show_in_quotation: true },
    order: [["id", "ASC"]],
  });
  // Mismo criterio que el frontend (useBrandTheme.ts): "blue" es la paleta por
  // defecto; si la empresa no eligió ninguna o el código no existe, el azul de siempre.
  const theme = await DataBase.instance.theme.findOne({ where: { code: company?.theme_color || "blue" } });
  return { company, paymentAccounts, brandColor: theme?.primary_color || DEFAULT_BRAND_COLOR };
}

// Términos y condiciones: una línea del texto = un término (sin la numeración
// que haya escrito la persona: se numeran solos).
export const parseTermsLines = (text: string | null | undefined): string[] => {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[.)]\s*/, ""));
};
