import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Modo de precio elegido para ESTE item de ESTA cotización — el producto
// puede tener cargados varios precios de catálogo (unidad/ciento/medio
// millar/millar, ver product.model.ts) y acá se elige cuál usar como
// PRECIO POR UNIDAD (no precio de lote): el subtotal es siempre
// precio_por_unidad × cantidad, sin importar el modo — los 4 precios de
// catálogo son solo tarifas preferenciales por volumen precargadas en el
// producto (mientras más grande el modo, más barato suele ser el precio
// unitario), y pedir una cantidad que "pase" el umbral del modo elegido
// (ej. 1100 unidades en modo millar) sigue cobrando esa tarifa para todas
// las unidades pedidas (pedido explícito del usuario, confirmado con
// ejemplos: millar S/700 × 850 = S/595,000; medio millar S/500 × 5 =
// S/2,500). "custom" es un precio por unidad libre, propio de esta
// cotización, que no toca el catálogo del producto.
export type QuotationItemPricingMode = "unit" | "hundred" | "half_thousand" | "thousand" | "custom";

export const QUOTATION_ITEM_PRICING_MODES: QuotationItemPricingMode[] = [
  "unit",
  "hundred",
  "half_thousand",
  "thousand",
  "custom",
];

export interface QuotationItemAttributes {
  id: number;
  quotation_id: number;
  product_id: number;
  technique_id: number | null;
  stage_id: number | null;
  quantity: number;
  pricing_mode: QuotationItemPricingMode;
  unit_price: number;
  subtotal: number;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface QuotationItemPartialAttributes extends Partial<QuotationItemAttributes> {}

export interface QuotationItemModel extends Model<QuotationItemAttributes>, QuotationItemAttributes {}

export class QuotationItem extends Model<QuotationItemAttributes, QuotationItemModel> {}

export type QuotationItemStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): QuotationItemModel;
};

export function QuotationItemFactory(sequelize: Sequelize): QuotationItemStatic {
  return <QuotationItemStatic>sequelize.define(
    "quotation_item",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      product_id: { type: DataTypes.BIGINT, allowNull: false },
      technique_id: { type: DataTypes.BIGINT, allowNull: true },
      stage_id: { type: DataTypes.BIGINT, allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      pricing_mode: { type: DataTypes.ENUM(...QUOTATION_ITEM_PRICING_MODES), allowNull: false, defaultValue: "unit" },
      unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "quotation_item",
      timestamps: false,
    }
  );
}
