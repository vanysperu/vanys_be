import { randomBytes, randomInt } from "crypto";
import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { encrypt } from "../../../../../security/criptoService";
import { UserModel } from "../../../users/models/user.model";
import { PracticeOwner } from "../../types/tutorial.types";
import { createSampleCatalog } from "./sample_catalog.service";

// Empresa de práctica de UNA persona (modo enseñanza, 21-nov): cada quien
// practica en la suya, así "Reiniciar práctica" de uno no le borra nada a otro.

const PRACTICE_STORE_CODE = "PRACTICA";
const RUC_ATTEMPTS = 10;
const RUC_SPACE = 10_000_000_000;

export interface PracticeWorkspace {
  companyId: number;
  storeId: number;
}

// RUC inventado de 11 dígitos que empieza en 9 (ningún RUC real empieza así) y
// no repetido (la columna es única). Intentos acotados (CLAUDE.md §8).
const uniquePracticeRuc = async (transaction: Transaction): Promise<string> => {
  for (let attempt = 0; attempt < RUC_ATTEMPTS; attempt += 1) {
    const ruc = `9${String(randomInt(0, RUC_SPACE)).padStart(10, "0")}`;
    const taken = await DataBase.instance.company.findOne({ where: { ruc }, attributes: ["id"], transaction });
    if (!taken) return ruc;
  }
  throw new AppError(500, "No se pudo crear la empresa de práctica, inténtalo otra vez", undefined, "PRACTICE_RUC_EXHAUSTED");
};

// Crea la empresa de práctica, su tienda y los ejemplos. Copia de la empresa
// real solo lo que se ve en la cotización (nombre, color, datos de contacto)
// para que el PDF de práctica se parezca al de verdad.
export const createPracticeWorkspace = async ({
  owner,
  transaction,
}: {
  owner: PracticeOwner;
  transaction: Transaction;
}): Promise<PracticeWorkspace> => {
  const realCompany = await DataBase.instance.company.findByPk(owner.realCompanyId, { transaction });
  if (!realCompany) throw new AppError(404, "No se encontró tu empresa");
  const now = nowUtc();

  const company = await DataBase.instance.company.create(
    {
      id: 0,
      ruc: await uniquePracticeRuc(transaction),
      business_name: `Práctica · ${realCompany.business_name}`.slice(0, 255),
      theme_color: realCompany.theme_color,
      tagline: realCompany.tagline ?? null,
      address: realCompany.address ?? null,
      phone: realCompany.phone ?? null,
      email: realCompany.email ?? null,
      is_practice: true,
      practice_of_company_id: owner.realCompanyId,
      is_deleted: false,
      created_by: owner.realUserId,
      created_at: now,
    },
    { transaction }
  );
  const companyId = Number(company.id);

  const store = await DataBase.instance.business_unit.create(
    {
      id: 0,
      business_code: PRACTICE_STORE_CODE,
      company_id: companyId,
      logo_url: "",
      primary_color: "#000000",
      secondary_color: "#000000",
      created_by: owner.realUserId,
      created_at: now,
    },
    { transaction }
  );
  const storeId = Number(store.id);

  await createSampleCatalog({ companyId, storeId, actorId: owner.realUserId, transaction });
  return { companyId, storeId };
};

// El usuario de práctica sigue usable si su empresa de práctica está activa y
// es de la misma empresa real (si la persona cambió de empresa, se crea otra).
export const usableWorkspace = async (
  practiceUser: UserModel,
  owner: PracticeOwner,
  transaction: Transaction
): Promise<PracticeWorkspace | null> => {
  if (!practiceUser.company_id || !practiceUser.business_unit_id) return null;
  const company = await DataBase.instance.company.findByPk(practiceUser.company_id, { transaction });
  if (!company?.is_practice || company.is_deleted) return null;
  if (Number(company.practice_of_company_id) !== owner.realCompanyId) return null;
  const store = await DataBase.instance.business_unit.findByPk(practiceUser.business_unit_id, { transaction });
  if (!store || store.is_deleted || Number(store.company_id) !== Number(company.id)) return null;
  return { companyId: Number(company.id), storeId: Number(store.id) };
};

// Los roles de práctica son los mismos de la persona real: aprende con
// exactamente lo que puede hacer (un gestor practica como gestor).
const syncPracticeRoles = async (practiceUserId: number, realUserId: number, transaction: Transaction) => {
  const realRoles = await DataBase.instance.userRole.findAll({ where: { user_id: realUserId }, attributes: ["role_id"], transaction });
  if (realRoles.length === 0) throw new AppError(409, "Tu usuario no tiene un rol asignado", undefined, "PRACTICE_WITHOUT_ROLE");
  await DataBase.instance.userRole.destroy({ where: { user_id: practiceUserId }, transaction });
  await DataBase.instance.userRole.bulkCreate(
    realRoles.map((role) => ({ user_id: practiceUserId, role_id: role.role_id, created_by: realUserId, created_at: nowUtc() })),
    { transaction }
  );
};

// Crea (o mueve a la empresa de práctica nueva) el usuario de práctica.
// No entra con contraseña: la suya es aleatoria y nadie la conoce; su sesión
// la abre la persona real desde "Aprender".
export const upsertPracticeUser = async ({
  owner,
  existing,
  workspace,
  transaction,
}: {
  owner: PracticeOwner;
  existing: UserModel | null;
  workspace: PracticeWorkspace;
  transaction: Transaction;
}): Promise<number> => {
  const now = nowUtc();
  if (existing) {
    await existing.update(
      { company_id: workspace.companyId, business_unit_id: workspace.storeId, status: true, updated_by: owner.realUserId, updated_at: now },
      { transaction }
    );
    await syncPracticeRoles(Number(existing.id), owner.realUserId, transaction);
    return Number(existing.id);
  }

  const realUser = await DataBase.instance.user.findByPk(owner.realUserId, { transaction });
  if (!realUser) throw new AppError(404, "No se encontró tu usuario");
  const { hash, salt } = await encrypt(randomBytes(32).toString("hex"));
  // Dominio .invalid: reservado, nunca recibe correos.
  const email = `practica.${owner.realUserId}@practica.invalid`;
  const created = await DataBase.instance.user.create(
    {
      id: 0,
      name: realUser.name,
      paternal_lastname: realUser.paternal_lastname,
      maternal_lastname: realUser.maternal_lastname,
      username: email,
      email,
      password: hash,
      salt,
      status: true,
      gender: realUser.gender,
      login_status: "H",
      failed_attempts: 0,
      must_change_password: false,
      is_deleted: false,
      company_id: workspace.companyId,
      business_unit_id: workspace.storeId,
      practice_of_user_id: owner.realUserId,
      created_by: owner.realUserId,
      created_at: now,
    },
    { transaction }
  );
  await syncPracticeRoles(Number(created.id), owner.realUserId, transaction);
  return Number(created.id);
};

// Al reiniciar: la empresa de práctica anterior queda deshabilitada (soft,
// CLAUDE.md §1) con todo lo que se hizo en ella; la persona sigue en una nueva.
export const retireWorkspace = async (workspace: PracticeWorkspace, actorId: number, transaction: Transaction) => {
  const now = nowUtc();
  await DataBase.instance.company.update(
    { is_deleted: true, updated_by: actorId, updated_at: now },
    { where: { id: workspace.companyId, is_practice: true }, transaction }
  );
  await DataBase.instance.business_unit.update(
    { is_deleted: true, updated_by: actorId, updated_at: now },
    { where: { id: workspace.storeId, company_id: workspace.companyId }, transaction }
  );
};
