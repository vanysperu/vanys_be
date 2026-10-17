import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";
export enum LogAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  DISABLE = "DISABLE",
  ACTIVE = "ACTIVE",
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  APPLICATION = "APPLICATION",
  ENTER = "ENTER",
  WEBHOOK = "WEBHOOK"
}

export interface LogAttributes {
  id?: number;
  user_id: number; // Usuario que ejecutó la acción
  action: LogAction; // Tipo de acción (crear, actualizar, eliminar, login, etc.)
  module: string | null; // Módulo o tabla donde se hizo la acción
  description: string | null; // Detalle adicional (ej: "Actualizó rol ID 5")
  company_id: number | null; // Empresa; null si el actor es is_system
  ip_address?: string | null; // IP desde donde se ejecutó
  user_agent?: string | null; // Info del navegador / app

  created_at?: Date;
}

export interface LogPartialAttributes extends Partial<LogAttributes> {}

export interface LogModel extends Model<LogAttributes>, LogAttributes {}

export class Log extends Model<LogModel, LogAttributes> {}

export type LogStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): LogModel;
};

export function LogFactory(sequelize: Sequelize): LogStatic {
  return <LogStatic>sequelize.define(
    "log",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      module: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      ip_address: {
        type: DataTypes.STRING(45), // IPv4/IPv6
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      company_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.fn("NOW"),
        allowNull: false,
      },
    },
    {
      initialAutoIncrement: "1",
      tableName: "log",
      timestamps: false,
    }
  );
}
