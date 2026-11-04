import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Empresa EXTRA a la que una API key puede replicar productos en la subida
// masiva (además de la suya). La asigna el Super Administrador en la
// pantalla API keys; sin filas, la key solo escribe en su propia empresa.
export interface ApiKeyCompanyAttributes {
  id: number;
  api_key_id: number;
  company_id: number;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ApiKeyCompanyModel extends Model<ApiKeyCompanyAttributes>, ApiKeyCompanyAttributes {}

export type ApiKeyCompanyStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ApiKeyCompanyModel;
};

export function ApiKeyCompanyFactory(sequelize: Sequelize): ApiKeyCompanyStatic {
  return <ApiKeyCompanyStatic>sequelize.define(
    "api_key_company",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      api_key_id: { type: DataTypes.BIGINT, allowNull: false },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "api_key_company", timestamps: false }
  );
}
