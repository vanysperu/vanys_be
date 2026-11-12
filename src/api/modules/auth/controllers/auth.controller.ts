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
import { getUserTenantInfo } from "../../users/services";
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

