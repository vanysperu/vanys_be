import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// API key de integración (ej. la web pública de la empresa). Nunca se guarda
// la key en texto plano: solo su SHA-256 (`key_hash`) y un prefijo corto
// (`key_prefix`) para reconocerla en listados y logs. La empresa (y la tienda
// opcional) del request salen de esta fila, nunca del body.
export interface ApiKeyAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  name: string;
  key_prefix: string;
  key_hash: string;
  last_used_at: Date | null;
  // Revocada (soft-delete): deja de autenticar al instante.
  is_deleted: boolean;
  created_by: number;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ApiKeyModel extends Model<ApiKeyAttributes>, ApiKeyAttributes {}

export class ApiKey extends Model<ApiKeyAttributes, ApiKeyModel> {}

export type ApiKeyStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ApiKeyModel;
};

export function ApiKeyFactory(sequelize: Sequelize): ApiKeyStatic {
  return <ApiKeyStatic>sequelize.define(
    "api_key",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      key_prefix: { type: DataTypes.STRING(16), allowNull: false },
      key_hash: { type: DataTypes.CHAR(64), allowNull: false },
      last_used_at: { type: DataTypes.DATE, allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "api_key",
      timestamps: false,
    }
  );
}
