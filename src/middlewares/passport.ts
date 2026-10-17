import { Strategy, ExtractJwt, StrategyOptions } from "passport-jwt";
import config from "../config/environments";
import { TokenAttributes } from "../api/modules/token/models/token.model";
import { findOneToken } from "../api/modules/token/services/find/token.service";
import moment from "moment";
import { updateLastRequest } from "../api/modules/token/services/update/token.service";
import { AllowedRoute, IToken } from "../api/interfaces/IToken.interface";
import { getUserRolesAndRoutes } from "../api/modules/resource/services/find/getAllowedRoutesByUser.service";
import { getUserTenantInfo } from "../api/modules/users/services";
import { JwtPayload } from "../helpers/generate-jwt";
import { userHasViewAllBusinessUnitsGrant } from "../core/rbac/businessUnitScope";

const opts: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.SECRET_HIDDEN_KEY!,
};

export type CustomPassportErrorReason =
  | "TokenNotFound"
  | "TokenExpired"
  | "RolesNotFound"
  | "RolesOrRoutesNotFound"
  | "AccountDisabled"
  | "InternalError";

export interface CustomPassportError {
  message: string;
  reason: CustomPassportErrorReason;
  source: "Passport";
}

export default new Strategy(opts, async (payload: JwtPayload, done) => {
  const customError: CustomPassportError = {
    message: "Error desconocido. Consulte con su administrador",
    reason: "InternalError",
    source: "Passport",
  };

  try {
    const token: TokenAttributes | null = await findOneToken({
      where: {
        uuid: payload._key,
      },
    });

    if (!token) {
      customError.reason = "TokenNotFound";
      customError.message = "Token no encontrado";
      return done(customError, false);
    }

    const momentNow = moment().utc();
    const momentExpiresAt = moment(token.expires_at);

    // Se verifica si el token ya expiró
    if (momentNow.isAfter(momentExpiresAt) || token.status == false) {
      customError.reason = "TokenExpired";
      customError.message = "Sesión expirada";
      return done(customError, false);
    }

    const respRoles = await getUserRolesAndRoutes(token.user_id);

    const rolesId = JSON.parse(respRoles[0]?.roles ?? "[]") as number[];
    const allowedRoutes = JSON.parse(respRoles[0]?.routes ?? "[]") as AllowedRoute[];

    // OJO: allowedRoutes vacío es un estado VÁLIDO (ej. un rol recién creado
    // en una empresa nueva, aún sin ningún resource otorgado) — no bloquea
    // el login, solo hace que verifyAccess rechace después cada request a
    // una ruta protegida hasta que se le otorguen accesos. Lo único que sí
    // bloquea el login es no tener ningún rol activo en absoluto.
    if (rolesId.length === 0) {
      customError.reason = "RolesNotFound";
      customError.message = "Permisos insuficientes";
      return done(customError, false);
    }

    const tenantInfo = await getUserTenantInfo(token.user_id);

    // Revocación en caliente: aunque el JWT siga vigente, si deshabilitan al
    // usuario (o su tienda/empresa, salvo que sea is_system) el acceso se
    // corta en el siguiente request, sin esperar a que expire el token.
    if (!tenantInfo.userActive) {
      customError.reason = "AccountDisabled";
      customError.message = "Usuario desactivado";
      return done(customError, false);
    }

    if (!tenantInfo.isSystem && (tenantInfo.businessUnitDisabled || tenantInfo.companyDisabled)) {
      customError.reason = "AccountDisabled";
      customError.message = "La empresa o tienda asociada a este usuario está deshabilitada";
      return done(customError, false);
    }

    await updateLastRequest({ uuid: payload._key });

    const canViewAllBusinessUnits = await userHasViewAllBusinessUnitsGrant(
      Number(token.user_id),
      tenantInfo.isSystem
    );

    const user: IToken = {
      userId: Number(token.user_id),
      rolesId,
      allowedRoutes,
      companyId: tenantInfo.companyId,
      businessUnitId: tenantInfo.businessUnitId,
      isSystem: tenantInfo.isSystem,
      mustChangePassword: tenantInfo.mustChangePassword,
      canViewAllBusinessUnits,
    };

    return done(null, user);
  } catch (error) {
    console.log(error);
    return done(customError, false);
  }
});
