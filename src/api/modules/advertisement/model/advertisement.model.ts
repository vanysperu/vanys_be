import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Anuncio de la web (pedido explícito del usuario): una imagen publicitaria
// que la web de la empresa lista con su API key, en el orden elegido. Se
// apaga y prende con `is_active`; eliminarlo lo borra de verdad, con su imagen
// (ver advertisement/README.md).
export interface AdvertisementAttributes {
  id: number;
  company_id: number;
  // Zona de la web donde sale (Variables Generales, category
  // "advertisement_zone"); null = sin zona.
  zone_id: number | null;
  // Nombre interno; la web lo puede usar como texto alternativo.
  title: string;
  // A dónde lleva el anuncio al hacer clic en la web (opcional).
  link_url: string | null;
  // Imagen subida al sistema ("/uploads/company-assets/<empresa>/<archivo>").
  image_path: string;
  // Orden dentro de su zona: 1, 2, 3... sin huecos.
  position: number;
  is_active: boolean;
  created_by: number;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface AdvertisementModel extends Model<AdvertisementAttributes>, AdvertisementAttributes {}

export class Advertisement extends Model<AdvertisementAttributes, AdvertisementModel> {}

export type AdvertisementStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): AdvertisementModel;
};

export function AdvertisementFactory(sequelize: Sequelize): AdvertisementStatic {
  return <AdvertisementStatic>sequelize.define(
    "advertisement",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      zone_id: { type: DataTypes.BIGINT, allowNull: true },
      title: { type: DataTypes.STRING(120), allowNull: false },
      link_url: { type: DataTypes.STRING(500), allowNull: true },
      image_path: { type: DataTypes.STRING(255), allowNull: false },
      position: { type: DataTypes.INTEGER, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "advertisement",
      timestamps: false,
    }
  );
}
