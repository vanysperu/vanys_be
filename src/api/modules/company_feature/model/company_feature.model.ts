import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Funcionalidad contratada por una empresa (plan Sprint 2 §3.1). La prende o
// apaga el Super Administrador; el rol sigue decidiendo qué usuario la usa.
export interface CompanyFeatureAttributes {
  id: number;
  company_id: number;
  feature_code: string;
  enabled: boolean;
  // Ajustes propios de la funcionalidad (ej. horas para avisar que un dato está viejo).
  settings: Record<string, unknown> | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface CompanyFeatureModel extends Model<CompanyFeatureAttributes>, CompanyFeatureAttributes {}

export type CompanyFeatureStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CompanyFeatureModel;
};

export function CompanyFeatureFactory(sequelize: Sequelize): CompanyFeatureStatic {
  return <CompanyFeatureStatic>sequelize.define(
    "company_feature",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      feature_code: { type: DataTypes.STRING(40), allowNull: false },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      settings: { type: DataTypes.JSON, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "company_feature", timestamps: false }
  );
}
