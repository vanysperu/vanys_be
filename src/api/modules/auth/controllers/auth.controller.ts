import { Request, Response } from "express";
import { SignInDto } from "../dtos/signInDto";
import { validateSignIn } from "../services/auth.service";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createToken } from "../../token/services/create/token.service";
import { getRoleIdsByUserId } from "../../user_role/services/find/user_role.service";
import { generateJWT } from "../../../../helpers/generate-jwt";
import { closeAllSessions } from "../../token/services/update/token.service";
import { IToken } from "../../../interfaces/IToken.interface";
import { basicUpdateUserById, findOneUser, getUserTenantInfo } from "../../users/services";
import { getRandomInt } from "../../../../utils/numbers";
import { nowUtc } from "../../../../utils/dateUtils";
import { encrypt, verify } from "../../../../security/criptoService";
import { LoginStatus } from "../../users/constants/loginStatus";
import { UserPartialAttributes } from "../../users/models/user.model";
import { DataBase } from "../../../../database";
import { LogAction } from "../../logs/model/log.model";
import { createLogController } from "../../logs/controllers/log.controller";
export interface ValidateSignInResponse {
  UserId: number;
  Username: string;
  FullName: string;
  Email: string;
  Jwt: string;
}

export const signInController = asyncHandler(async (req: Request, res: Response) => {
  const auth = req.body as SignInDto;

  const loginValidations = await validateSignIn(auth);

  if (!loginValidations.success) {
    throw new AppError(loginValidations.statusCode, loginValidations.message);
  }

  if (!loginValidations.data) {
    throw new AppError(500, "Sucedió un problema al verificar la existencia del usuario");
  }

  const user = loginValidations.data;

  // Se cierran las sesiones abiertas
  await closeAllSessions({ user_id: user.id });

  // Se obtienen los roles
  const roles = await getRoleIdsByUserId(user.id);

  // Se genera el token en BD
  const token = await createToken({ user_id: user.id });

  // Se genera el JWT (el tenant/empresa del usuario NO se cachea acá — se
  // resuelve siempre por request desde BD, igual que los roles, para poder
  // revocarlo/cambiarlo en caliente sin reemitir el token).
  const payload = {
    _key: token.uuid,
    _userId: user.id,
    _roles: roles,
  };

  const jwt = await generateJWT(payload);
  const { companyId, mustChangePassword } = await getUserTenantInfo(user.id);
  const payloadLog = {
    user_id: user.id,
    action: LogAction.LOGIN,
    module: "token",
    description: `Usuario con ID ${user.id} ingreso al sistema mediante inicio de sesión.`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: companyId,
  };

  createLogController(payloadLog);

  ok(
    res,
    200,
    {
      UserId: user.id,
      Username: user.username,
      // Nombre para mostrar: SOLO nombre + apellido paterno (nunca el
      // materno, aunque exista) — pedido explícito del usuario. Igual se
      // filtran partes vacías/null por si el nombre o el apellido paterno
      // llegaran incompletos.
      FullName: [user.name, user.paternal_lastname]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(" "),
      Email: user.email,
      Jwt: jwt,
      MustChangePassword: mustChangePassword,
    },
    "Sesión iniciada correctamente"
  );
});

export const signOutController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, companyId } = req.user as IToken;

  const finish = await closeAllSessions({
    user_id: userId,
  });

  // eliminar el device Id — no bloquea el logout si falla, por eso el
  // try/catch acá solo se traga el error puntual de este paso secundario.
  try {
    await DataBase.instance.user.update(
      {
        device_id: "",
      },
      {
        where: {
          id: userId,
        },
      }
    );
  } catch (error) {}

  const payloadLog = {
    user_id: userId,
    action: LogAction.LOGOUT,
    module: "token",
    description: `Usuario con ID ${userId} ha cerrado sesión`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: companyId,
  };

  createLogController(payloadLog);

  ok(res, 200, finish, "Sesión finalizada correctamente");
});

export const sendCodeForRecoveryPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await findOneUser({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(404, "Error al solicitar código de recuperación");
  }

  const code = getRandomInt(1001, 9999).toString();

  // Se establece el código
  await basicUpdateUserById({
    userId: user.id,
    user: {
      recovery_code: code,
    },
  });

  const { companyId: recoveryCompanyId } = await getUserTenantInfo(user.id);
  const payloadLog = {
    user_id: user.id,
    action: LogAction.APPLICATION,
    module: "user",
    description: `Usuario con ID ${user.id} solicito codigo para cambio de contraseña`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: recoveryCompanyId,
  };

  createLogController(payloadLog);

  ok(res, 200, email, "¡Código enviado a tu correo!");
});

export const verifyRecoveryCodeController = asyncHandler(async (req: Request, res: Response) => {
  const { email, verificationCode } = req.body;

  const user = await findOneUser({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(404, "Sucedió un error al intentar validar la información");
  }

  if (user.recovery_code != verificationCode) {
    throw new AppError(400, "El código proporcionado no coincide con el enviado");
  }

  const { companyId: verifyCompanyId } = await getUserTenantInfo(user.id);
  const payloadLog = {
    user_id: user.id,
    action: LogAction.ENTER,
    module: "user",
    description: `Usuario con ID ${user.id} ingreso y verifico el codigo para cambio de contraseña`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: verifyCompanyId,
  };

  createLogController(payloadLog);

  ok(res, 200, { email, verificationCode }, "Código validado correctamente");
});

export const recoveryUserAccountController = asyncHandler(async (req: Request, res: Response) => {
  const { email, password: newPassword, verificationCode } = req.body;
  const user = await findOneUser({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(404, "Sucedió un error al intentar validar la información");
  }

  const encryptedData = await encrypt(newPassword);

  // Se vuelve a validar
  if (user.recovery_code != verificationCode) {
    throw new AppError(400, "El código proporcionado no coincide con el enviado");
  }

  const isSamePassword = await verify(newPassword, user.salt, user.password);

  if (isSamePassword) {
    throw new AppError(400, "No es posible registrar la misma contraseña");
  }

  let message;
  let resp;
  if (user.login_status == LoginStatus.BI) {
    const dataForRecover: UserPartialAttributes = {
      password: encryptedData.hash,
      salt: encryptedData.salt,
      last_unlock_date: nowUtc(),
      status: true,
      login_status: LoginStatus.H,
      failed_attempts: 0,
      lockout_minutes: null,
      last_lock_date: null,
      recovery_code: null,
    };

    resp = await basicUpdateUserById({
      user: dataForRecover,
      userId: user.id,
    });

    message = "Cuenta restaurada correctamente";
  } else {
    const dataForUpdate: UserPartialAttributes = {
      password: encryptedData.hash,
      salt: encryptedData.salt,
    };

    resp = await basicUpdateUserById({
      user: dataForUpdate,
      userId: user.id,
    });

    message = "Contraseña actualizada correctamente";
  }

  const { companyId: recoverAccountCompanyId } = await getUserTenantInfo(user.id);
  const payloadLog = {
    user_id: user.id,
    action: LogAction.UPDATE,
    module: "user",
    description: `Usuario con ID ${user.id} actualizo su contraseña`,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: recoverAccountCompanyId,
  };

  createLogController(payloadLog);

  ok(res, 200, resp, message);
});
