import { Optional, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { UserAttributes, UserCreationAttributes, UserModel } from "../../models/user.model";
import { CreateUserDto } from "../../dtos";
import { encrypt } from "../../../../../security/criptoService";
import { USER_DEFAULT_VALUES } from "../../constants/defaultValues";
import { setRolesForUser } from "../../../user_role/services/create/user_role.service";
import { NullishPropertiesOf } from "sequelize/types/utils";
import { nowUtc } from "../../../../../utils/dateUtils";

export const createUserAndSendMailService = async ({
  createUserDto,
  createdBy,
}: {
  createUserDto: CreateUserDto;
  createdBy: number;
}) => {
  const transaction = await DataBase.instance.sequelize.transaction();
  try {
    const { password, salt, ...user_details }: UserAttributes = await createUser({
      createUserDto,
      createdBy,
      transaction,
    });
    await DataBase.instance.userRole.create(
      {
        user_id: user_details.id,
        role_id: Number(createUserDto.roleIds),
        created_by: createdBy,
        created_at: nowUtc(),
      },
      {
        transaction,
      }
    );
    const { business_unit_id } = user_details;

    let company_logo = "";
    let company_name = "TEST";
    let company_p = "#ac2c34";
    let company_s = "#ac2c34";

    if (business_unit_id && business_unit_id > 0) {
      const business_unit = await DataBase.instance.business_unit.findByPk(business_unit_id);
      company_logo = business_unit?.logo_url!;
      company_p = business_unit?.primary_color!;
      company_s = business_unit?.secondary_color!;
      company_name = business_unit?.business_code!;
    }

    await transaction.commit();

    // await sendMailAxios({
    //   title:
    //     "Hola " +
    //     user_details.name +
    //     ", tu nueva contraseña es:  " +
    //     createUserDto.password,
    //   to: user_details.email!,
    //   template: template_create_admin({
    //     names: user_details.name + " " + user_details.paternal_lastname,
    //     redirect_buttom: config.PROY_FEURL + "/api/signin",
    //     logo: company_logo,
    //     company_name,
    //     p_color: company_p,
    //     s_color: company_s,
    //   }),
    // });

    return user_details;
  } catch (err) {
    console.log({ err });
    await transaction.rollback();
    throw err;
  }
};

const createUser = async ({
  createUserDto,
  createdBy,
  transaction,
}: {
  createUserDto: CreateUserDto;
  createdBy?: number;
  transaction?: Transaction;
}) => {
  const { roles, date_of_birth, document_type, document_number, ...basicData } = createUserDto;

  try {
    const { hash: encryptedPassword, salt } = await encrypt(basicData.password);

    const user: Optional<UserAttributes, NullishPropertiesOf<UserAttributes>> = {
      ...basicData,
      password: encryptedPassword,
      document_type,
      document_number,
      salt,
      date_of_birth: date_of_birth,
      created_at: nowUtc(),
      created_by: createdBy,
      status: true,
      // notifications: notifications || false,
      login_status: USER_DEFAULT_VALUES.LOGIN_STATUS,
      failed_attempts: USER_DEFAULT_VALUES.FAILED_ATTEMPTS,
      must_change_password: true,
      id: 0,
      is_deleted: false,
    };

    let newUser = (
      await DataBase.instance.user.create(user, {
        transaction,
      })
    ).toJSON();

    if (roles && roles.length > 0) {
      await setRolesForUser({
        userId: newUser.id,
        roleIds: roles,
        createdBy,
        transaction,
      });
    }

    return newUser;
  } catch (error) {
    throw error;
  }
};
// SERVICIO SIMPLE - Solo crea usuario (como estaba antes)
const createUserSimple = async ({
  createUserDto,
  createdBy,
  transaction,
}: {
  createUserDto: CreateUserDto;
  createdBy?: number;
  transaction?: Transaction;
}) => {
  const { roles, date_of_birth, document_type, document_number, ...basicData } = createUserDto;

  try {
    const { hash: encryptedPassword, salt } = await encrypt(basicData.password);

    const user: Optional<UserAttributes, NullishPropertiesOf<UserAttributes>> = {
      ...basicData,
      password: encryptedPassword,
      document_type,
      document_number,
      salt,
      date_of_birth: date_of_birth,
      created_at: nowUtc(),
      created_by: createdBy,
      status: true,
      login_status: USER_DEFAULT_VALUES.LOGIN_STATUS,
      failed_attempts: USER_DEFAULT_VALUES.FAILED_ATTEMPTS,
      must_change_password: true,
      id: 0,
      is_deleted: false,
    };

    let newUser = (
      await DataBase.instance.user.create(user, {
        transaction,
      })
    ).toJSON();

    // El rol NO se asigna acá: el único caller de esta función
    // (createUserAndSendMailServiceSimple) siempre inserta el user_role él
    // mismo vía `roleIds` inmediatamente después — hacerlo también acá con
    // `roles` duplicaba la fila y tiraba un SequelizeUniqueConstraintError
    // en user_role.PRIMARY.

    return newUser;
  } catch (error) {
    throw error;
  }
};
export const createUserAndSendMailServiceSimple = async ({
  createUserDto,
  createdBy,
}: {
  createUserDto: CreateUserDto;
  createdBy: number;
}) => {
  const transaction = await DataBase.instance.sequelize.transaction();
  try {
    const { password, salt, ...user_details }: UserAttributes = await createUserSimple({
      createUserDto,
      createdBy,
      transaction,
    });

    await DataBase.instance.userRole.create(
      {
        user_id: user_details.id,
        role_id: Number(createUserDto.roleIds),
        created_by: createdBy,
        created_at: nowUtc(),
      },
      {
        transaction,
      }
    );

    await transaction.commit();

    return user_details;
  } catch (err) {
    console.log({ err });
    await transaction.rollback();
    throw err;
  }
};
export { createUser };
