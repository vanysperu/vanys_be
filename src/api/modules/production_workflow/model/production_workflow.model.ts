import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Cómo avanzan los productos entre las columnas del kanban de producción de una
// empresa (Sprint 2, ítem 5; decisión D10): "linear" = solo a la columna vecina
// (como antes), "free" = a cualquier columna activa.
export const FLOW_MODES = ["linear", "free"] as const;
export type FlowMode = (typeof FLOW_MODES)[number];

export interface ProductionWorkflowAttributes {
  id: number;
  company_id: number;
  flow_mode: FlowMode;
  // Solo en modo lineal: si se puede volver a la columna anterior.
  allow_backward: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ProductionWorkflowModel extends Model<ProductionWorkflowAttributes>, ProductionWorkflowAttributes {}

export class ProductionWorkflow extends Model<ProductionWorkflowAttributes, ProductionWorkflowModel> {}

export type ProductionWorkflowStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ProductionWorkflowModel;
};

export function ProductionWorkflowFactory(sequelize: Sequelize): ProductionWorkflowStatic {
  return <ProductionWorkflowStatic>sequelize.define(
    "production_workflow",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      flow_mode: { type: DataTypes.ENUM(...FLOW_MODES), allowNull: false, defaultValue: "linear" },
      allow_backward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "production_workflow", timestamps: false }
  );
}
