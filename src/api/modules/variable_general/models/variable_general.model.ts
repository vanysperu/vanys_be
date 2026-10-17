import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";

export interface VariableGeneralAttributes {
  id: number;
  category: string;
  title: string;
  prefix_id: string;
  name: string;
  description: string;
  ref1: string;
  ref2: string;
  // NULL = variable global, visible para todas las empresas (ver
  // buildWhere en services/find). Solo is_system puede crear/editar una fila
  // con company_id NULL.
  company_id: number | null;
  // Soft-delete (CLAUDE.md sección 1): reemplaza al DELETE físico anterior.
  is_deleted: boolean;
  created_by: number | null;
  created_at: Date;
  updated_by: number | null;
  updated_at: Date | null;
}

export interface VariableGeneralPartialAttributes extends Partial<VariableGeneralAttributes> {}

// id, is_deleted, created_at y updated_at tienen default en la DB
// (autoIncrement / defaultValue), por eso son opcionales al crear.
type VariableGeneralCreationAttributes = Optional<
  VariableGeneralAttributes,
  "id" | "is_deleted" | "created_at" | "updated_at"
>;

export interface VariableGeneralModel
  extends Model<VariableGeneralAttributes, VariableGeneralCreationAttributes>,
    VariableGeneralAttributes {}

export type VariableGeneralStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): VariableGeneralModel;
};

export function VariableGeneralFactory(sequelize: Sequelize): VariableGeneralStatic {
  return <VariableGeneralStatic>sequelize.define(
    "variable_general",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      category: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      prefix_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      ref1: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      ref2: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      company_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      initialAutoIncrement: "1",
      // La tabla física se llama "general_variable" (orden gramatical
      // correcto en inglés). El nombre del modelo/módulo se mantiene como
      // "variable_general" a propósito: es el código de módulo RBAC y el
      // segmento de ruta HTTP ya usados (seed +, en el futuro, frontend),
      // y cambiar ESO es una decisión de API/contrato aparte de corregir el
      // nombre de la tabla en la base de datos.
      tableName: "general_variable",
      timestamps: false,
    }
  );
}


