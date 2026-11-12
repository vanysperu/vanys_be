import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Enlaces para crear la contraseña (invitación de un usuario nuevo) o
// recuperarla. Se guarda solo el SHA-256 del token: quien lea la base no puede
// usar un enlace pendiente.
export const PASSWORD_LINK_PURPOSES = ["reset", "invite"] as const;
export type PasswordLinkPurpose = (typeof PASSWORD_LINK_PURPOSES)[number];

export interface PasswordResetTokenAttributes {
  id: number;
  user_id: number;
  company_id: number | null;
  purpose: PasswordLinkPurpose;
  token_hash: string;
  expires_at: Date;
  // Cuándo se usó (o se anuló al pedir otro); null = vigente.
  used_at: Date | null;
  requested_ip: string | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface PasswordResetTokenModel extends Model<PasswordResetTokenAttributes>, PasswordResetTokenAttributes {}

export class PasswordResetToken extends Model<PasswordResetTokenAttributes, PasswordResetTokenModel> {}

export type PasswordResetTokenStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): PasswordResetTokenModel;
};

export function PasswordResetTokenFactory(sequelize: Sequelize): PasswordResetTokenStatic {
  return <PasswordResetTokenStatic>sequelize.define(
    "password_reset_token",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.BIGINT, allowNull: false },
      company_id: { type: DataTypes.BIGINT, allowNull: true },
      purpose: { type: DataTypes.ENUM(...PASSWORD_LINK_PURPOSES), allowNull: false },
      token_hash: { type: DataTypes.CHAR(64), allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: { type: DataTypes.DATE, allowNull: true },
      requested_ip: { type: DataTypes.STRING(64), allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "password_reset_token",
      timestamps: false,
    }
  );
}
