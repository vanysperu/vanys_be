import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Código adicional de un producto (pedido explícito del usuario): cada
// proveedor puede identificar el mismo producto con su propio código. El SKU
// sigue siendo uno solo por producto. Es detalle del producto: al guardar los
// códigos se reemplaza la lista completa, en orden.
export interface ProductCodeAttributes {
  id: number;
  company_id: number;
  product_id: number;
  code: string;
  // Nombre del proveedor que usa este código (texto libre, opcional).
  supplier: string | null;
  // Color del producto al que corresponde este código (nombre; opcional).
  color: string | null;
  position: number;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ProductCodeModel extends Model<ProductCodeAttributes>, ProductCodeAttributes {}

export type ProductCodeStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ProductCodeModel;
};

export function ProductCodeFactory(sequelize: Sequelize): ProductCodeStatic {
  return <ProductCodeStatic>sequelize.define(
    "product_code",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      product_id: { type: DataTypes.BIGINT, allowNull: false },
      code: { type: DataTypes.STRING(60), allowNull: false },
      supplier: { type: DataTypes.STRING(150), allowNull: true },
      color: { type: DataTypes.STRING(60), allowNull: true },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "product_code", timestamps: false }
  );
}
