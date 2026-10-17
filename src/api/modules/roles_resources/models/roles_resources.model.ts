import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface RolesResourcesAttributes {
  role_id: number;
  resource_id: number;
  created_by?: number | null;
  created_at?: Date;
  updated_by?: number | null;
  updated_at?: Date | null;
}

export interface RolesResourcesModel extends Model<RolesResourcesAttributes>, RolesResourcesAttributes {}

export class RolesResources extends Model<RolesResourcesModel, RolesResourcesAttributes> {}

export type RolesResourcesStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): RolesResourcesModel;
};

export function RolesResourcesFactory(sequelize: Sequelize): RolesResourcesStatic {
  return <RolesResourcesStatic>sequelize.define(
    "roles_resources",
    {
      role_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
      },
      resource_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
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
      tableName: "roles_resources",
      timestamps: false,
    }
  );
}
