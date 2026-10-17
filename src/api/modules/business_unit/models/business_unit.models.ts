import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface BusinessUnitAttributes {
  id: number;
  business_code: string;
  logo_url: string;
  address: string | null;
  company_id: number;

  primary_color: string;
  secondary_color: string;

  // Horario de atención (pedido explícito del usuario): días laborales
  // ISO separados por coma (1=lunes..7=domingo) y horas "HH:mm". Los 3
  // quedan opcionales a propósito — una tienda puede no tener horario
  // cargado todavía sin que eso rompa nada más.
  working_days: string | null;
  opens_at: string | null;
  closes_at: string | null;

  is_deleted?: boolean;
  created_at: Date;
  created_by?: number;
  updated_at?: Date;
  updated_by?: number;
}

export interface BusinessUnitPartialAttributes
  extends Partial<BusinessUnitAttributes> {}

export interface BusinessUnitModel
  extends Model<BusinessUnitAttributes>,
    BusinessUnitAttributes {}

export class BusinessUnit extends Model<
  BusinessUnitAttributes,
  BusinessUnitModel
> {}

export type BusinessUnitStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): BusinessUnitModel;
};

export function BusinessUnitFactory(sequelize: Sequelize): BusinessUnitStatic {
  return <BusinessUnitStatic>sequelize.define(
    "business_unit",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      business_code: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      logo_url: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Dirección de la tienda, para mostrar en el PDF de cotización",
      },
      primary_color: {
        type: DataTypes.STRING(7),
        allowNull: false,
      },
      secondary_color: {
        type: DataTypes.STRING(7),
        allowNull: false,
      },
      working_days: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      opens_at: {
        type: DataTypes.STRING(5),
        allowNull: true,
      },
      closes_at: {
        type: DataTypes.STRING(5),
        allowNull: true,
      },
      company_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.fn("NOW"),
        allowNull: false,
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
    },
    {
      initialAutoIncrement: "1",
      tableName: "business_unit",
      timestamps: false,
    }
  );
}
