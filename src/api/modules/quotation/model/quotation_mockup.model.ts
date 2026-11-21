import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Mockup (diseño) de una cotización (pedido del usuario, 21-nov). Privado: el
// archivo solo sale con sesión y nunca en el PDF ni en el enlace del cliente.
// `data` son los bytes del archivo: los listados NUNCA lo leen (attributes).
export interface QuotationMockupAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  quotation_id: number;
  // Producto de la cotización al que corresponde el diseño (null = General).
  quotation_item_id: number | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data: Buffer;
  caption: string | null;
  active: boolean;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

// Columnas que se leen al listar (todo menos los bytes).
export const QUOTATION_MOCKUP_LIST_ATTRIBUTES: (keyof QuotationMockupAttributes)[] = [
  "id",
  "company_id",
  "business_unit_id",
  "quotation_id",
  "quotation_item_id",
  "file_name",
  "mime_type",
  "size_bytes",
  "caption",
  "active",
  "created_by",
  "created_at",
];

export interface QuotationMockupModel extends Model<QuotationMockupAttributes>, QuotationMockupAttributes {}

export class QuotationMockup extends Model<QuotationMockupAttributes, QuotationMockupModel> {}

export type QuotationMockupStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): QuotationMockupModel;
};

export function QuotationMockupFactory(sequelize: Sequelize): QuotationMockupStatic {
  return <QuotationMockupStatic>sequelize.define(
    "quotation_mockup",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      quotation_id: { type: DataTypes.BIGINT, allowNull: false },
      quotation_item_id: { type: DataTypes.BIGINT, allowNull: true },
      file_name: { type: DataTypes.STRING(255), allowNull: false },
      mime_type: { type: DataTypes.STRING(50), allowNull: false },
      size_bytes: { type: DataTypes.INTEGER, allowNull: false },
      data: { type: DataTypes.BLOB("medium"), allowNull: false },
      caption: { type: DataTypes.STRING(255), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "quotation_mockup", timestamps: false }
  );
}
