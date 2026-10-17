import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";

export interface ThemeAttributes {
  id: number;
  code: string;
  name: string;
  primary_color: string;
  primary_active_color: string;
  primary_light_color: string;
  primary_clarity_color: string;
  primary_inverse_color: string;
  position: number;
  active: boolean;
  created_by?: number | null;
  created_at?: Date;
  updated_by?: number | null;
  updated_at?: Date | null;
}

export interface ThemeModel extends Model<ThemeAttributes>, ThemeAttributes {}

export interface ThemeCreationAttributes extends Optional<ThemeAttributes, "id" | "position" | "active"> {}

export class Theme extends Model<ThemeCreationAttributes, ThemeAttributes> {}

export type ThemeStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ThemeModel;
};

export function ThemeFactory(sequelize: Sequelize): ThemeStatic {
  return <ThemeStatic>sequelize.define(
    "themes",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      primary_color: { type: DataTypes.STRING(20), allowNull: false },
      primary_active_color: { type: DataTypes.STRING(20), allowNull: false },
      primary_light_color: { type: DataTypes.STRING(20), allowNull: false },
      primary_clarity_color: { type: DataTypes.STRING(40), allowNull: false },
      primary_inverse_color: { type: DataTypes.STRING(20), allowNull: false },
      position: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "themes",
      timestamps: false,
    }
  );
}
