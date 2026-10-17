import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export type QuotationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "design_pending"
  | "in_process"
  | "cancelled"
  | "ready"
  | "delivered"
  | "finished";

export const QUOTATION_STATUSES: QuotationStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "design_pending",
  "in_process",
  "cancelled",
  "ready",
  "delivered",
  "finished",
];

// Espejo de QUOTATION_STATUS_LABEL en el frontend — usado en los mensajes
// del timeline (grulla_fe: modules/quotations/types/quotation.types.ts).
export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Vencida",
  design_pending: "Diseño en aprobación",
  in_process: "En proceso",
  cancelled: "Cancelada",
  ready: "Lista para entregar",
  delivered: "Entregada",
  finished: "Finalizada",
};

// El IGV ya NO es una constante fija: viene de una "Variable General"
// configurable por empresa (ver services/shared/tax_config.ts ->
// getIgvRate), pedido explícito del usuario. `igvRate` es la fracción ya
// resuelta (0.18 = 18%) para esa empresa en el momento del cálculo.
export const computeQuotationTotal = (subtotal: number, includesIgv: boolean, igvRate: number): number =>
  includesIgv ? subtotal * (1 + igvRate) : subtotal;

export interface QuotationAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  client_id: number;
  status: QuotationStatus;
  // `total` es SIEMPRE el monto final que el cliente debe (con IGV
  // aplicado si corresponde) — todo el sistema ya calcula saldo/pagos
  // contra este campo, por eso se mantiene así. `subtotal` es el monto
  // antes de impuesto, solo para mostrar el desglose en el PDF.
  subtotal: number;
  total: number;
  total_paid: number;
  includes_delivery: boolean;
  includes_design: boolean;
  includes_igv: boolean;
  notes: string | null;
  valid_until: string | null;
  // El cliente vinculado (client_id) NUNCA cambia — es quien queda en el
  // historial/reportes del sistema. Estos dos campos son solo lo que se
  // IMPRIME en el PDF cuando el cliente pide que la cotización salga a
  // nombre de otra persona o empresa (ej. su propio cliente final); si
  // están vacíos, el PDF usa los datos del cliente vinculado como siempre
  // (pedido explícito del usuario).
  billing_name: string | null;
  billing_document_number: string | null;
  // Días hábiles (no corridos) que toma la producción una vez aprobado el
  // diseño — informativo, no dispara ninguna fecha automática, solo se
  // imprime en el PDF para que el cliente sepa qué esperar.
  production_days: number | null;
  is_deleted: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface QuotationPartialAttributes extends Partial<QuotationAttributes> {}

export interface QuotationModel extends Model<QuotationAttributes>, QuotationAttributes {}

export class Quotation extends Model<QuotationAttributes, QuotationModel> {}

export type QuotationStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): QuotationModel;
};

export function QuotationFactory(sequelize: Sequelize): QuotationStatic {
  return <QuotationStatic>sequelize.define(
    "quotation",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      client_id: { type: DataTypes.BIGINT, allowNull: false },
      status: { type: DataTypes.ENUM(...QUOTATION_STATUSES), allowNull: false, defaultValue: "pending" },
      subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total_paid: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      includes_delivery: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      includes_design: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      includes_igv: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      valid_until: { type: DataTypes.DATEONLY, allowNull: true },
      billing_name: { type: DataTypes.STRING(255), allowNull: true },
      billing_document_number: { type: DataTypes.STRING(20), allowNull: true },
      production_days: { type: DataTypes.INTEGER, allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "quotation",
      timestamps: false,
    }
  );
}
