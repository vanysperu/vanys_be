import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface CustomizationTechniqueAttributes {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  // Igual que "product" (ver product.model.ts): un precio POR UNIDAD según el
  // volumen pedido. El item cobra (precio del producto + precio de la técnica)
  // en el mismo modo × cantidad. Ya no existe el modo porcentual (ver la
  // migración remove-percentage-from-technique).
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
