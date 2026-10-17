import moment from "moment";
import  sequelize , { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

export interface TokenAttributes {
  id: number;
  user_id: number;
  created_at: Date;
  expires_at: Date;
  last_request_at: Date;
  uuid: string;
  status: boolean;
  // role: string
}

export interface TokenPartialAttributes extends Partial<TokenAttributes> {}

export interface TokenModel extends Model<TokenAttributes>, TokenAttributes {}
export class Token extends Model<TokenModel, TokenAttributes> {}

export type TokenStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): TokenModel;
};

export function TokenFactory(sequelize: Sequelize): TokenStatic {
  return <TokenStatic>sequelize.define(
    "token",
    {
      id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      uuid: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      expires_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal(`( NOW() + INTERVAL 4 HOUR) `),
        allowNull: false,
      },
      last_request_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      initialAutoIncrement: "1",
      tableName: "token",
      timestamps: false,
    }
  );
}
