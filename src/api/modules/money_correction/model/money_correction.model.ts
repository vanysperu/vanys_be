import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";
import {
  MONEY_CORRECTION_KINDS,
  MONEY_CORRECTION_SOURCES,
  MoneyCorrectionKind,
  MoneyCorrectionSource,
  MoneyCorrectionValues,
} from "../types/money_correction.types";

// Historial inmutable de correcciones de dinero de TODAS las fuentes de Caja
// (migración 20261101110000-money-correction-and-annulments.js). Se inserta
// una vez y nunca se actualiza ni se borra (updated_* quedan iguales a
// created_* por la regla de auditoría).
export interface MoneyCorrectionAttributes {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  source_type: MoneyCorrectionSource;
  // Id de la fila corregida en la tabla de su fuente (sin llave foránea:
  // apunta a tablas distintas según source_type).
  source_id: number;
  kind: MoneyCorrectionKind;
  previous_values: MoneyCorrectionValues;
  new_values: MoneyCorrectionValues;
  reason: string;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

export interface MoneyCorrectionModel extends Model<MoneyCorrectionAttributes>, MoneyCorrectionAttributes {}

export class MoneyCorrection extends Model<MoneyCorrectionAttributes, MoneyCorrectionModel> {}

export type MoneyCorrectionStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): MoneyCorrectionModel;
};

export function MoneyCorrectionFactory(sequelize: Sequelize): MoneyCorrectionStatic {
  return <MoneyCorrectionStatic>sequelize.define(
    "money_correction",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      business_unit_id: { type: DataTypes.BIGINT, allowNull: true },
      source_type: { type: DataTypes.ENUM(...MONEY_CORRECTION_SOURCES), allowNull: false },
      source_id: { type: DataTypes.BIGINT, allowNull: false },
      kind: { type: DataTypes.ENUM(...MONEY_CORRECTION_KINDS), allowNull: false, defaultValue: "correction" },
      previous_values: { type: DataTypes.JSON, allowNull: false },
      new_values: { type: DataTypes.JSON, allowNull: false },
      reason: { type: DataTypes.STRING(500), allowNull: false },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: "money_correction",
      timestamps: false,
    }
  );
}
