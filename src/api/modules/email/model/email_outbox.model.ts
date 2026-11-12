import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Categoría del correo: decide la prioridad dentro del cupo diario. Los de
// seguridad (enlaces de contraseña) salen primero y tienen un 10 % reservado.
export const EMAIL_CATEGORIES = ["security", "quotation", "notification"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const EMAIL_STATUSES = ["pending", "sending", "sent", "failed"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export interface EmailOutboxAttributes {
  id: number;
  company_id: number | null;
  category: EmailCategory;
  template: string;
  to_email: string;
  cc_email: string | null;
  reply_to: string | null;
  subject: string;
  // Variables de la plantilla, cifradas (llevan enlaces). Se borran al enviarse.
  payload_encrypted: string | null;
  status: EmailStatus;
  attempts: number;
  // Próximo intento; mientras está en "sending", hasta cuándo dura la reserva.
  next_attempt_at: Date | null;
  sent_at: Date | null;
  provider: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  // A qué pertenece (ej. "quotation" + id) para mostrarlo en su historial.
  related_type: string | null;
  related_id: number | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface EmailOutboxModel extends Model<EmailOutboxAttributes>, EmailOutboxAttributes {}

export class EmailOutbox extends Model<EmailOutboxAttributes, EmailOutboxModel> {}

export type EmailOutboxStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): EmailOutboxModel;
};

export function EmailOutboxFactory(sequelize: Sequelize): EmailOutboxStatic {
  return <EmailOutboxStatic>sequelize.define(
    "email_outbox",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: true },
      category: { type: DataTypes.ENUM(...EMAIL_CATEGORIES), allowNull: false },
      template: { type: DataTypes.STRING(50), allowNull: false },
      to_email: { type: DataTypes.STRING(255), allowNull: false },
      cc_email: { type: DataTypes.STRING(255), allowNull: true },
      reply_to: { type: DataTypes.STRING(255), allowNull: true },
      subject: { type: DataTypes.STRING(255), allowNull: false },
      payload_encrypted: { type: DataTypes.TEXT("medium"), allowNull: true },
      status: { type: DataTypes.ENUM(...EMAIL_STATUSES), allowNull: false, defaultValue: "pending" },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      next_attempt_at: { type: DataTypes.DATE, allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      provider: { type: DataTypes.STRING(20), allowNull: true },
      provider_message_id: { type: DataTypes.STRING(255), allowNull: true },
      last_error: { type: DataTypes.STRING(500), allowNull: true },
      related_type: { type: DataTypes.STRING(40), allowNull: true },
      related_id: { type: DataTypes.BIGINT, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "email_outbox",
      timestamps: false,
    }
  );
}
