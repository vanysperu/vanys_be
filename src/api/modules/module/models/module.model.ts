import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";

export interface ModuleAttributes {
  id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
  active: boolean;
  created_by?: number | null;
  created_at?: Date;
  updated_by?: number | null;
  updated_at?: Date | null;
}

export interface ModulePartialAttributes extends Partial<ModuleAttributes> {}

export interface ModuleModel extends Model<ModuleAttributes>, ModuleAttributes {}

export interface ModuleCreationAttributes
  extends Optional<ModuleAttributes, "id" | "description" | "icon" | "active" | "position"> {}

export class Module extends Model<ModuleCreationAttributes, ModuleAttributes> {}

export type ModuleStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ModuleModel;
};

export function ModuleFactory(sequelize: Sequelize): ModuleStatic {
  return <ModuleStatic>sequelize.define(
    "modules",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      icon: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
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
      tableName: "modules",
      timestamps: false,
    }
  );
}
