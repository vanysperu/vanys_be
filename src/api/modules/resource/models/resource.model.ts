import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";

export type ResourceType = "view" | "button" | "endpoint";

export interface ResourceAttributes {
  id: number;
  module_id: number;
  parent_id: number | null;
  type: ResourceType;
  code: string;
  name: string;
  description: string | null;
  route: string | null;
  verb: string | null;
  icon: string | null;
  show_in_menu: boolean;
  position: number;
  active: boolean;
  created_by?: number | null;
  created_at?: Date;
  updated_by?: number | null;
  updated_at?: Date | null;
}

export interface ResourcePartialAttributes extends Partial<ResourceAttributes> {}

export interface ResourceModel extends Model<ResourceAttributes>, ResourceAttributes {}

export interface ResourceCreationAttributes
  extends Optional<
    ResourceAttributes,
    "id" | "parent_id" | "description" | "route" | "verb" | "icon" | "show_in_menu" | "position" | "active"
  > {}

export class Resource extends Model<ResourceCreationAttributes, ResourceAttributes> {}

export type ResourceStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ResourceModel;
};

export function ResourceFactory(sequelize: Sequelize): ResourceStatic {
  return <ResourceStatic>sequelize.define(
    "resources",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      module_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      parent_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      type: {
        type: DataTypes.ENUM("view", "button", "endpoint"),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      route: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      verb: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      icon: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      show_in_menu: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      tableName: "resources",
      timestamps: false,
    }
  );
}
