import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Suscripción Web Push de un teléfono o navegador (migración
// 20261118100000-create-push-subscription.js).
export interface PushSubscriptionAttributes {
  id: number;
  company_id: number | null;
  user_id: number;
  endpoint: string;
  // SHA-256 del endpoint: el endpoint puede pasar de 255 caracteres y el índice
  // único va sobre el hash.
  endpoint_hash: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  active: boolean;
  last_sent_at: Date | null;
  last_error: string | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface PushSubscriptionModel extends Model<PushSubscriptionAttributes>, PushSubscriptionAttributes {}

export type PushSubscriptionStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): PushSubscriptionModel;
};

export function PushSubscriptionFactory(sequelize: Sequelize): PushSubscriptionStatic {
  return <PushSubscriptionStatic>sequelize.define(
    "push_subscription",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: true },
      user_id: { type: DataTypes.BIGINT, allowNull: false },
      endpoint: { type: DataTypes.STRING(700), allowNull: false },
      endpoint_hash: { type: DataTypes.CHAR(64), allowNull: false },
      p256dh: { type: DataTypes.STRING(255), allowNull: false },
      auth: { type: DataTypes.STRING(255), allowNull: false },
      user_agent: { type: DataTypes.STRING(255), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      last_sent_at: { type: DataTypes.DATE, allowNull: true },
      last_error: { type: DataTypes.STRING(255), allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "push_subscription", timestamps: false }
  );
}
