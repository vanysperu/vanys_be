import { Transaction } from "sequelize";
import { DataBase } from "../../database";

// Modo enseñanza (21-nov): las empresas de práctica (company.is_practice) son
// empresas normales para el aislamiento, pero no deben mezclarse con las
// reales cuando el Super Administrador mira "todas las empresas" (estadísticas
// de plataforma, Caja sin empresa elegida, listas de empresas y tiendas).
//
// Fragmento SQL para los listados con `:companyId` opcional: si hay empresa
// elegida no cambia nada (ya filtra por ella); si no, saca las de práctica.
export const excludePracticeCompaniesSql = (companyColumn: string): string =>
  `(:companyId IS NOT NULL OR ${companyColumn} NOT IN (SELECT practice_company.id FROM company practice_company WHERE practice_company.is_practice = true))`;

// ¿La empresa es una empresa de práctica? (null = sin empresa: no lo es).
export const isPracticeCompany = async (companyId: number | null | undefined, transaction?: Transaction): Promise<boolean> => {
  if (!companyId) return false;
  const company = await DataBase.instance.company.findOne({ where: { id: companyId }, attributes: ["is_practice"], transaction });
  return Boolean(company?.is_practice);
};

// En una empresa de práctica, el correo de un usuario nuevo se guarda con una
// marca (+practica-N): el correo es único en todo el sistema y, si alguien
// practica creando a un compañero con su correo real, ese correo no debe
// quedar ocupado para cuando le creen su cuenta de verdad.
export const practiceSafeEmail = async (email: string, companyId: number | null | undefined): Promise<string> => {
  if (!(await isPracticeCompany(companyId))) return email;
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local}+practica-${companyId}@${domain}`;
};
