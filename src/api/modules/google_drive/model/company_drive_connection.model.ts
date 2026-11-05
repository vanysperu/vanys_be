import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Google Drive conectado de una empresa (una cuenta por empresa). Lo conecta
// el Super Administrador iniciando sesión con el Gmail de esa empresa.
export interface CompanyDriveConnectionAttributes {
  id: number;
  company_id: number;
  google_email: string;
  // Refresh token cifrado con AES-256-GCM (GOOGLE_DRIVE_TOKEN_KEY).
  refresh_token_encrypted: string;
  root_folder_id: string | null;
  last_error: string | null;
  created_by: number;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface CompanyDriveConnectionModel extends Model<CompanyDriveConnectionAttributes>, CompanyDriveConnectionAttributes {}

export class CompanyDriveConnection extends Model<CompanyDriveConnectionAttributes, CompanyDriveConnectionModel> {}

export type CompanyDriveConnectionStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CompanyDriveConnectionModel;
};

export function CompanyDriveConnectionFactory(sequelize: Sequelize): CompanyDriveConnectionStatic {
  return <CompanyDriveConnectionStatic>sequelize.define(
    "company_drive_connection",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      google_email: { type: DataTypes.STRING(255), allowNull: false },
      refresh_token_encrypted: { type: DataTypes.TEXT, allowNull: false },
      root_folder_id: { type: DataTypes.STRING(128), allowNull: true },
      last_error: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "company_drive_connection", timestamps: false }
  );
}
