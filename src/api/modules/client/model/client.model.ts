import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface ClientAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  name: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_deleted: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ClientPartialAttributes extends Partial<ClientAttributes> {}

export interface ClientModel extends Model<ClientAttributes>, ClientAttributes {}

export class Client extends Model<ClientAttributes, ClientModel> {}

export type ClientStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ClientModel;
};

export function ClientFactory(sequelize: Sequelize): ClientStatic {
  return <ClientStatic>sequelize.define(
    "client",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      document_number: { type: DataTypes.STRING(20), allowNull: true },
      email: { type: DataTypes.STRING(150), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      address: { type: DataTypes.STRING(255), allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "client",
      timestamps: false,
    }
  );
}
