import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Enlace público de una cotización (/c/<code>), para que el cliente la vea sin
// iniciar sesión. Uno por cotización; `enabled` es el interruptor "Visible para
// el cliente" (encendido por defecto).
export interface QuotationPublicLinkAttributes {
  id: number;
  company_id: number;
  quotation_id: number;
  // 22 caracteres aleatorios (16 bytes en base64url): imposible de adivinar.
  code: string;
  enabled: boolean;
  view_count: number;
  first_viewed_at: Date | null;
  last_viewed_at: Date | null;
  // Última vez que se generó un enlace nuevo (anulando el anterior).
  regenerated_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface QuotationPublicLinkModel extends Model<QuotationPublicLinkAttributes>, QuotationPublicLinkAttributes {}

export class QuotationPublicLink extends Model<QuotationPublicLinkAttributes, QuotationPublicLinkModel> {}

export type QuotationPublicLinkStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): QuotationPublicLinkModel;
};

export function QuotationPublicLinkFactory(sequelize: Sequelize): QuotationPublicLinkStatic {
  return <QuotationPublicLinkStatic>sequelize.define(
    "quotation_public_link",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      code: { type: DataTypes.CHAR(22), allowNull: false },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      view_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      first_viewed_at: { type: DataTypes.DATE, allowNull: true },
      last_viewed_at: { type: DataTypes.DATE, allowNull: true },
      regenerated_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "quotation_public_link",
      timestamps: false,
    }
  );
}
