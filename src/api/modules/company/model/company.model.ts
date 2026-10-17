import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface CompanyAttributes {
  id: number;
  ruc: string;
  business_name: string;
  description?: string | null;

  // --- Datos de contacto / cabecera de cotización ---
  address?: string | null; // Dirección de la empresa
  phone?: string | null; // Teléfono general de contacto
  email?: string | null; // Email general de contacto
  tagline?: string | null; // Frase debajo del logo (ej: "Publicidad BTL & Merchandising")
  logo_url?: string | null; // Ruta/URL del logo a usar en la cotización

  // --- Datos comerciales de la cotización ---
  quotation_validity_text?: string | null; // Ej: "10 días calendario"
  currency_label?: string | null; // Ej: "Soles (PEN)"
  delivery_terms?: string | null; // Ej: "3 a 4 días hábiles luego de confirmado el pago y diseño."
  advance_note?: string | null; // Ej: "Producción sujeta a confirmación del adelanto."
  legal_terms_caption?: string | null; // Texto junto al QR de términos y condiciones
  legal_terms_qr_text?: string | null; // Texto a codificar si no hay imagen de QR real
  terms_qr_url?: string | null; // Ruta/URL de la imagen real del QR de términos y condiciones

  // --- Medios de pago ---
  bank_name?: string | null; // Ej: "BCP"
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
  bcp_logo_url?: string | null;
  yape_number?: string | null;
  yape_logo_url?: string | null;

  // --- Footer ---
  footer_line_1?: string | null;
  footer_line_2?: string | null;

  // Código de la paleta de marca (select cerrado; la BD tiene default 'blue' y FK a themes.code)
  theme_color?: string;

  is_deleted?: boolean;
  created_at: Date;
  created_by?: number;
  updated_at?: Date;
  updated_by?: number;
}

export interface CompanyPartialAttributes extends Partial<CompanyAttributes> {}

export interface CompanyModel
  extends Model<CompanyAttributes>,
    CompanyAttributes {}

export class Company extends Model<CompanyAttributes, CompanyModel> {}

export type CompanyStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): CompanyModel;
};

export function CompanyFactory(sequelize: Sequelize): CompanyStatic {
  return <CompanyStatic>sequelize.define(
    "company",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      ruc: {
        type: DataTypes.STRING(11),
        allowNull: false,
        unique: true,
      },
      business_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Dirección de la empresa",
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
        comment: "Teléfono general de contacto",
      },
      email: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: "Email general de contacto",
      },
      tagline: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Frase debajo del logo, ej: Publicidad BTL & Merchandising",
      },
      logo_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Ruta/URL del logo a usar en la cotización",
      },
      quotation_validity_text: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Ej: 10 días calendario",
      },
      currency_label: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Ej: Soles (PEN)",
      },
      delivery_terms: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      advance_note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      legal_terms_caption: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      legal_terms_qr_text: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Texto a codificar en el QR si no hay imagen de QR real",
      },
      terms_qr_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Ruta/URL de la imagen real del QR de términos y condiciones",
      },
      bank_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      bank_account_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      bank_account_holder: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      bcp_logo_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      yape_number: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      yape_logo_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      footer_line_1: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      footer_line_2: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      theme_color: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "blue",
        comment: "Código de la paleta de marca (select cerrado, no hex libre)",
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.fn("NOW"),
        allowNull: false,
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
    },
    {
      initialAutoIncrement: "1",
      tableName: "company",
      timestamps: false,
    }
  );
}
