import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Un producto se registra UNA sola vez con hasta 4 precios de catálogo en
// simultáneo (no 4 productos separados) — cada uno opcional, porque no todo
// producto se vende en las 4 modalidades. Cada precio es una tarifa POR
// UNIDAD para ese volumen de pedido (mientras más grande la modalidad, más
// barato suele ser el precio unitario — descuento por volumen):
//   - price_unit: precio por unidad para pedidos chicos.
//   - price_hundred: precio por unidad al pedir en tandas de ~100.
//   - price_half_thousand: precio por unidad al pedir en tandas de ~500.
//   - price_thousand: precio por unidad al pedir en tandas de ~1000+.
// Al armar una cotización, cada item elige CUÁL tarifa usar y la cantidad
// real que pide (el subtotal es siempre precio_por_unidad × cantidad) — o
// un precio "personalizado" propio de esa cotización que no se guarda en
// el catálogo — ver QuotationItemPricingMode en quotation_item.model.ts.
export interface ProductAttributes {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  sku: string | null;
  price_unit: number | null;
  price_hundred: number | null;
  price_half_thousand: number | null;
  price_thousand: number | null;
  is_deleted: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ProductPartialAttributes extends Partial<ProductAttributes> {}

export interface ProductModel extends Model<ProductAttributes>, ProductAttributes {}

export class Product extends Model<ProductAttributes, ProductModel> {}

export type ProductStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ProductModel;
};

export function ProductFactory(sequelize: Sequelize): ProductStatic {
  return <ProductStatic>sequelize.define(
    "product",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      sku: { type: DataTypes.STRING(50), allowNull: true },
      price_unit: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      price_hundred: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      price_half_thousand: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      price_thousand: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "product",
      timestamps: false,
    }
  );
}
