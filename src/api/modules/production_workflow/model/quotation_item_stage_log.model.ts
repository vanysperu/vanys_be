import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Cada movimiento de un producto entre columnas del kanban de producción
// (desde, hacia, quién y cuándo): con esto se mide cuánto tiempo pasa en cada
// etapa. Inmutable.
export interface QuotationItemStageLogAttributes {
  id: number;
  company_id: number;
  quotation_id: number;
  quotation_item_id: number;
  // null = entró al tablero (primera etapa).
  from_stage_id: number | null;
  to_stage_id: number;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface QuotationItemStageLogModel extends Model<QuotationItemStageLogAttributes>, QuotationItemStageLogAttributes {}

export class QuotationItemStageLog extends Model<QuotationItemStageLogAttributes, QuotationItemStageLogModel> {}

export type QuotationItemStageLogStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): QuotationItemStageLogModel;
};

export function QuotationItemStageLogFactory(sequelize: Sequelize): QuotationItemStageLogStatic {
  return <QuotationItemStageLogStatic>sequelize.define(
    "quotation_item_stage_log",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      quotation_item_id: { type: DataTypes.BIGINT, allowNull: false },
      from_stage_id: { type: DataTypes.BIGINT, allowNull: true },
      to_stage_id: { type: DataTypes.BIGINT, allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "quotation_item_stage_log", timestamps: false }
  );
}
