import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Colores en los que viene un producto (pedido explícito del usuario: "un
// producto puede venir en varios colores"). Es el detalle del producto: al
// guardar los colores se reemplaza el conjunto completo, en orden.
export interface ProductColorAttributes {
  id: number;
  company_id: number;
  product_id: number;
  name: string;
  // "#RRGGBB" opcional, para mostrar la muestra del color.
  hex_code: string | null;
  position: number;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ProductColorModel extends Model<ProductColorAttributes>, ProductColorAttributes {}

export type ProductColorStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ProductColorModel;
};

export function ProductColorFactory(sequelize: Sequelize): ProductColorStatic {
  return <ProductColorStatic>sequelize.define(
    "product_color",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      product_id: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING(60), allowNull: false },
      hex_code: { type: DataTypes.STRING(7), allowNull: true },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "product_color", timestamps: false }
  );
}
