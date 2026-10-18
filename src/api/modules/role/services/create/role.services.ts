import { Transaction } from "sequelize";
import { RoleAttributes } from "../../model/role.model";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

// Accesos que todo rol recibe al crearse: "Inicio" es navegación básica (el
// mismo destino que el logo de la app). Sin esto, un rol recién creado por
// una empresa no vería "Inicio" en su menú hasta que alguien se lo otorgue.
// "Recordatorios" también: cualquiera puede recibir uno, y sin el módulo no
// vería la campana ni podría marcarlo como visto.
const DEFAULT_RESOURCE_CODES = [
  "inicio.view",
  "reminder.list",
  "reminder.create.button",
  "reminder.update.button",
  "reminder.disable.button",
  "reminder.list.endpoint",
  "reminder.due.endpoint",
  "reminder.read.endpoint",
  "reminder.recipients.endpoint",
];

const grantDefaultResources = async (roleId: number, createdBy: number | undefined, transaction: Transaction) => {
  const resources = await DataBase.instance.resource.findAll({
    where: { code: DEFAULT_RESOURCE_CODES, active: true },
    attributes: ["id"],
    transaction,
  });
  if (resources.length === 0) return;

  await DataBase.instance.rolesResources.bulkCreate(
    resources.map((resource) => ({
      role_id: roleId,
      resource_id: resource.id,
      created_by: createdBy ?? null,
      created_at: nowUtc(),
    })),
    { transaction }
  );
};

const createRole = async ({
  role,
  createdBy,
  companyId,
  transaction,
}: {
  role: RoleAttributes;
  createdBy?: number;
  companyId?: number | null;
  transaction?: Transaction;
}) => {
  const run = async (activeTransaction: Transaction) => {
    const newRole: RoleAttributes = {
      ...role,
      status: true,
      company_id: companyId ?? null,
      created_by: createdBy,
      created_at: nowUtc(),
    };

    const created = await DataBase.instance.role.create(newRole, { transaction: activeTransaction });
    await grantDefaultResources(created.id, createdBy, activeTransaction);
    return created;
  };

  // Rol + sus accesos por defecto: todo o nada (CLAUDE.md sección 12).
  if (transaction) return run(transaction);
  return DataBase.instance.sequelize.transaction(run);
};

export { createRole };
