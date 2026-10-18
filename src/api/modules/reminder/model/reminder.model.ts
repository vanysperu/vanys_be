import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface ReminderAttributes {
  id: number;
  // Empresa del destinatario; null solo si el destinatario es de plataforma.
  company_id: number | null;
  recipient_user_id: number;
  title: string;
  message: string | null;
  // Instante UTC en que el recordatorio vence.
  remind_at: Date;
  // Cuándo el destinatario lo marcó como visto; null = pendiente.
  read_at: Date | null;
  // Cancelado por quien lo creó (soft-delete).
  is_deleted: boolean;
  created_by: number;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface ReminderModel extends Model<ReminderAttributes>, ReminderAttributes {}

export class Reminder extends Model<ReminderAttributes, ReminderModel> {}

export type ReminderStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): ReminderModel;
};

export function ReminderFactory(sequelize: Sequelize): ReminderStatic {
  return <ReminderStatic>sequelize.define(
    "reminder",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: true },
      recipient_user_id: { type: DataTypes.BIGINT, allowNull: false },
      title: { type: DataTypes.STRING(150), allowNull: false },
      message: { type: DataTypes.STRING(500), allowNull: true },
      remind_at: { type: DataTypes.DATE, allowNull: false },
      read_at: { type: DataTypes.DATE, allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "reminder",
      timestamps: false,
    }
  );
}
