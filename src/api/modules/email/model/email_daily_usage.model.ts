import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Correos enviados por día (fecha de Lima) contra el cupo del plan de correo,
// compartido por todas las empresas. Guarda cuándo se avisó a los Super
// Administradores para no repetir el aviso en el mismo día.
export interface EmailDailyUsageAttributes {
  usage_date: string;
  sent_count: number;
  daily_limit: number;
  alert_warning_at: Date | null;
  alert_exhausted_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface EmailDailyUsageModel extends Model<EmailDailyUsageAttributes>, EmailDailyUsageAttributes {}

export class EmailDailyUsage extends Model<EmailDailyUsageAttributes, EmailDailyUsageModel> {}

export type EmailDailyUsageStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): EmailDailyUsageModel;
};

export function EmailDailyUsageFactory(sequelize: Sequelize): EmailDailyUsageStatic {
  return <EmailDailyUsageStatic>sequelize.define(
    "email_daily_usage",
    {
      usage_date: { type: DataTypes.DATEONLY, allowNull: false, primaryKey: true },
      sent_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      daily_limit: { type: DataTypes.INTEGER, allowNull: false },
      alert_warning_at: { type: DataTypes.DATE, allowNull: true },
      alert_exhausted_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "email_daily_usage",
      timestamps: false,
    }
  );
}
