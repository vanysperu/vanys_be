import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Tipo de columna, como las categorías de estado de Jira: cada empresa nombra
// sus columnas como quiera, pero el sistema sabe cuáles son "por hacer", "en
// curso" o "terminado" (estadísticas, tiempos de producción).
export const STAGE_CATEGORIES = ["todo", "doing", "done"] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];

export interface ProductionWorkflowStageAttributes {
  id: number;
  company_id: number;
  name: string;
  color: string;
  // Orden de la columna en el tablero (0 = primera).
  position: number;
  category: StageCategory;
  // Desactivada: no aparece en el tablero (no se borra: hay historial que la usa).
  active: boolean;
  // Fila de general_variable que reemplazó (migración 20261113120000); null en las nuevas.
  legacy_variable_id: number | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ProductionWorkflowStageModel extends Model<ProductionWorkflowStageAttributes>, ProductionWorkflowStageAttributes {}

export class ProductionWorkflowStage extends Model<ProductionWorkflowStageAttributes, ProductionWorkflowStageModel> {}

export type ProductionWorkflowStageStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ProductionWorkflowStageModel;
};

export function ProductionWorkflowStageFactory(sequelize: Sequelize): ProductionWorkflowStageStatic {
  return <ProductionWorkflowStageStatic>sequelize.define(
    "production_workflow_stage",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING(60), allowNull: false },
      color: { type: DataTypes.CHAR(7), allowNull: false },
      position: { type: DataTypes.INTEGER, allowNull: false },
      category: { type: DataTypes.ENUM(...STAGE_CATEGORIES), allowNull: false },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      legacy_variable_id: { type: DataTypes.BIGINT, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "production_workflow_stage", timestamps: false }
  );
}
