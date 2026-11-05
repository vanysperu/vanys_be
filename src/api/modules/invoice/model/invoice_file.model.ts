import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Bytes del archivo de una factura guardado en el sistema. Aparte de `invoice`
// para no cargarlos al listar. Nunca se sirve por una URL pública: solo con
// sesión (GET /invoice/:id/file).
export interface InvoiceFileAttributes {
  id: number;
  invoice_id: number;
  data: Buffer;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface InvoiceFileModel extends Model<InvoiceFileAttributes>, InvoiceFileAttributes {}

export class InvoiceFile extends Model<InvoiceFileAttributes, InvoiceFileModel> {}

export type InvoiceFileStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): InvoiceFileModel;
};

export function InvoiceFileFactory(sequelize: Sequelize): InvoiceFileStatic {
  return <InvoiceFileStatic>sequelize.define(
    "invoice_file",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      invoice_id: { type: DataTypes.BIGINT, allowNull: false },
      data: { type: DataTypes.BLOB("long"), allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "invoice_file", timestamps: false }
  );
}
