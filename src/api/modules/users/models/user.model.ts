import { BuildOptions, DataTypes, Model, Optional, Sequelize } from "sequelize";
import { LoginStatusTypes } from "../types/loginStatus.type";
import { USER_DEFAULT_VALUES } from "../constants/defaultValues";
import { createDummyObject } from "../../../../utils/object";

export interface UserAttributes {
  id: number;
  name: string;
  paternal_lastname: string;
  maternal_lastname?: string;
  document_type?: number;
  document_number?: string;
  date_of_birth?: string;
  phone_number?: string;
  address?: string;

  username?: string;
  email: string;
  password: string;
  salt: string;

  // Foraneas
  // office_id: number | null;
  // area_id: number | null;
  // program_id: number | null;

  // notifications: boolean;
  status: boolean;

  gender?: number;

  // Estado del login
  login_status: LoginStatusTypes;
  // true = debe cambiar su contraseña antes de poder usar el resto del
  // sistema (ver middlewares/require-password-changed.ts).
  must_change_password?: boolean;
  failed_attempts: number;
  last_lock_date?: Date | null;
  last_unlock_date?: Date | null;
  lockout_minutes?: number | null;

  // Device Id
  device_id?: string;

  // Codigos adicionales
  recovery_code?: string | null;

  business_unit_id?: number | null;
  // Empresa del usuario (CLAUDE.md sección 10: toda tabla de negocio
  // necesita company_id) — obligatoria para todo usuario que no sea
  // is_system, sin importar si tiene tienda asignada o no. Antes solo se
  // derivaba vía business_unit_id, lo que obligaba a asignar SIEMPRE una
  // tienda; ahora un "admin de empresa" puede quedar sin tienda propia.
  company_id?: number | null;

  is_deleted: boolean;
  created_at: Date;
  created_by?: number | null;
  updated_at?: Date | null;
  updated_by?: number | null;
}

export interface UserPartialAttributes extends Partial<UserAttributes> {}

export const objDummyUserPartialAttributes =
  createDummyObject<UserPartialAttributes>();

export interface UserModel extends Model<UserAttributes>, UserAttributes {}

export interface UserCreationAttributes
  extends Optional<
    UserAttributes,
    | "id"
    | "date_of_birth"
    | "last_lock_date"
    | "last_unlock_date"
    | "lockout_minutes"
    | "status"
  > {}

export class User extends Model<UserCreationAttributes, UserModel> {}

export type UserStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): UserModel;
};

export function UserFactory(sequelize: Sequelize): UserStatic {
  return <UserStatic>sequelize.define(
    "user",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      paternal_lastname: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      maternal_lastname: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      date_of_birth: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      username: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      document_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      document_number: {
        type: DataTypes.STRING,
        allowNull: true,
        // unique: true,
      },
      salt: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // office_id: {
      //   type: DataTypes.BIGINT,
      //   allowNull: true,
      // },
      // area_id: {
      //   type: DataTypes.BIGINT,
      //   allowNull: true,
      // },
      // program_id: {
      //   type: DataTypes.BIGINT,
      //   allowNull: true,
      // },
      // notifications: {
      //   type: DataTypes.BOOLEAN,
      //   allowNull: false,
      //   defaultValue: false,
      // },
      status: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      gender: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      login_status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: USER_DEFAULT_VALUES.LOGIN_STATUS,
      },

      must_change_password: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      failed_attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: USER_DEFAULT_VALUES.FAILED_ATTEMPTS,
      },

      last_lock_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      last_unlock_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      lockout_minutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      device_id: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      recovery_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },

      business_unit_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },

      company_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },

      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.fn("NOW"),
        allowNull: false,
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      initialAutoIncrement: "1",
      tableName: "user",
      timestamps: false,
    }
  );
}
