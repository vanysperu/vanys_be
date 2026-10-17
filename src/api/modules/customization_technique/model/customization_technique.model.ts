import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export type ExtraType = "fixed" | "percentage";

export interface CustomizationTechniqueAttributes {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  extra_type: ExtraType;
  // Solo aplica cuando extra_type="percentage" (porcentaje sobre el precio
  // base del producto) — ya escala solo con el volumen porque el precio
  // base también varía por modo, no necesita un precio por cada tarifa.
  extra_value: number;
  // Solo aplican cuando extra_type="fixed": igual que "product" (ver
  // product.model.ts), la técnica puede tener un extra POR UNIDAD distinto
  // según el volumen pedido (ej. personalizar por millar sale más barato
  // por unidad que personalizar por unidad suelta) — pedido explícito del
  // usuario tras notar que antes solo había un monto fijo sin importar el
  // modo de precio elegido en el item.
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

export interface CustomizationTechniquePartialAttributes extends Partial<CustomizationTechniqueAttributes> {}

export interface CustomizationTechniqueModel
  extends Model<CustomizationTechniqueAttributes>,
    CustomizationTechniqueAttributes {}

export class CustomizationTechnique extends Model<CustomizationTechniqueAttributes, CustomizationTechniqueModel> {}

export type CustomizationTechniqueStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CustomizationTechniqueModel;
};

export function CustomizationTechniqueFactory(sequelize: Sequelize): CustomizationTechniqueStatic {
  return <CustomizationTechniqueStatic>sequelize.define(
    "customization_technique",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      extra_type: { type: DataTypes.ENUM("fixed", "percentage"), allowNull: false, defaultValue: "fixed" },
      extra_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
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
      tableName: "customization_technique",
      timestamps: false,
    }
  );
}
