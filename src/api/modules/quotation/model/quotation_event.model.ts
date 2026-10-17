import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Acciones registradas en el timeline de una cotización. Inmutable — nunca
// se edita ni se borra un evento ya escrito.
export type QuotationEventAction =
  | "created"
  | "status_changed"
  | "item_stage_changed"
  | "payment_added"
  | "payment_updated"
  | "payment_disabled"
  | "expense_added"
  | "updated";

export interface QuotationEventAttributes {
  id: number;
  quotation_id: number;
  action: QuotationEventAction;
  description: string;
  created_by: number | null;
  created_at: Date;
}

export interface QuotationEventModel extends Model<QuotationEventAttributes>, QuotationEventAttributes {}

export class QuotationEvent extends Model<QuotationEventAttributes, QuotationEventModel> {}

export type QuotationEventStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): QuotationEventModel;
};

export function QuotationEventFactory(sequelize: Sequelize): QuotationEventStatic {
  return <QuotationEventStatic>sequelize.define(
    "quotation_event",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      action: { type: DataTypes.STRING(50), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "quotation_event",
      timestamps: false,
    }
  );
}
