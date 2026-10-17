import bcrypt from "bcrypt";
import { Transaction, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { encrypt } from "../../../../../security/criptoService";
import { UserPartialAttributes, UserAttributes } from "../../models/user.model";
import { UpdateUserDto } from "../../dtos/update-user.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

export const updateUserPassword = async ({
  password,
  userId,
  updatedBy,
  transaction,
}: {
  password: string;
  userId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
    const { hash: encryptedPassword, salt } = await encrypt(password);

    return await DataBase.instance.user.update(
      {
        password: encryptedPassword,
        salt,
        must_change_password: false,
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      {
        where: {
          id: userId,
        },
        transaction,
      }
    );
  } catch (error) {
    throw error;
  }
};

export const basicUpdateUserById = async ({
  userId,
  user,
  updatedBy,
  transaction,
}: {
  userId: number;
  user: UserPartialAttributes;
  updatedBy?: number | null;
  transaction?: Transaction;
}) => {
  const { id, ...data } = user;

  return await DataBase.instance.user.update(
    {
      ...data,
      updated_at: nowUtc(),
      updated_by: updatedBy,
    },
    {
      where: {
        id: userId,
      },
      transaction,
    }
  );
};

export const updateUserById = async ({
  userId,
  updateUserDto,
  updatedBy,
  transaction,
}: {
  userId: number;
  updateUserDto: UpdateUserDto;
  updatedBy?: number | null;
  transaction?: Transaction;
}) => {
  const { roles, ...data } = updateUserDto;
  try {
    let userUpdate = await basicUpdateUserById({
      user: {
        ...data,
      },
      userId,
      updatedBy,
      transaction,
    });

    // Bug real: este bloque comprobaba `roles` (IAddRemove), pero el
    // frontend/controller en realidad envía `roleIds` (número único) — con
    // `roles` siempre undefined, cambiar el rol desde "Editar usuario"
    // nunca se guardaba en la base de datos.
    if (data.roleIds) {
      await DataBase.instance.userRole.destroy({
        where: {
          user_id: userId,
        },
        transaction,
      });
      await DataBase.instance.userRole.create(
        {
          user_id: userId,
          role_id: Number(data.roleIds),
          created_by: updatedBy,
          created_at: nowUtc(),
        },
        {
          transaction,
        }
      );
    }

    return userUpdate;
  } catch (error) {
    throw error;
  }
};
