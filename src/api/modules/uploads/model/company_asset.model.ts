import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Imagen de marca de una empresa (logo, QR de pago) guardada en la base —
// ver la migración create-company-asset para el porqué.
export interface CompanyAssetAttributes {
  id: number;
  company_id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data: Buffer;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface CompanyAssetModel extends Model<CompanyAssetAttributes>, CompanyAssetAttributes {}

export type CompanyAssetStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CompanyAssetModel;
};

export function CompanyAssetFactory(sequelize: Sequelize): CompanyAssetStatic {
  return <CompanyAssetStatic>sequelize.define(
    "company_asset",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      file_name: { type: DataTypes.STRING(64), allowNull: false },
      mime_type: { type: DataTypes.STRING(50), allowNull: false },
      size_bytes: { type: DataTypes.INTEGER, allowNull: false },
      data: { type: DataTypes.BLOB("medium"), allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "company_asset",
      timestamps: false,
    }
  );
}
