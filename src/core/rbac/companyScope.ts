import { DataBase } from "../../database";
import { IToken } from "../../api/interfaces/IToken.interface";
import { AppError } from "../errors/AppError";

// Empresa a la que pertenece un registro nuevo (producto, técnica,
// movimiento de caja, ...) — CLAUDE.md sección 10:
// - Usuario de empresa: SIEMPRE la suya (nunca se confía en el body; si
//   manda otra, 403).
// - Super Administrador (is_system, sin empresa propia): la elige en el
//   formulario (pedido explícito del usuario: "un super admin debería poder
//   crear cosas, solo debe salirle la empresa"), así que es obligatoria en
//   el body y tiene que existir.
// Filtro de empresa para un LISTADO: un usuario de empresa siempre ve solo
// la suya (se ignora lo que mande el query); el Super Administrador ve todo,
// salvo que pida una empresa puntual con ?companyId= — así los selectores de
// un formulario (cliente, producto, técnica...) muestran solo los de la
// empresa elegida y no se mezcla información entre empresas.
export function resolveListCompanyFilter(user: IToken, queryCompanyId: unknown): number | null {
  if (!user.isSystem) return user.companyId ?? null;
  const companyId = Number(queryCompanyId);
  return Number.isInteger(companyId) && companyId > 0 ? companyId : null;
}

export async function resolveTargetCompanyId(user: IToken, bodyCompanyId: unknown, entityLabel: string): Promise<number> {
  if (!user.isSystem) {
    if (bodyCompanyId !== undefined && bodyCompanyId !== null && bodyCompanyId !== "" && Number(bodyCompanyId) !== user.companyId) {
      throw new AppError(403, `No puedes crear ${entityLabel} para otra empresa`);
    }
    return user.companyId!;
  }

  const companyId = Number(bodyCompanyId);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new AppError(400, "Selecciona la empresa");
  }
  const company = await DataBase.instance.company.findByPk(companyId);
  if (!company) throw new AppError(404, "La empresa seleccionada no existe");
  return companyId;
}
