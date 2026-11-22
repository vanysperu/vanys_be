import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { listEnabledFeatures } from "../../../company_feature/services/shared/feature_store";

// La empresa de práctica tiene las MISMAS funcionalidades contratadas que la
// real (inventario, guías de remisión, stock de proveedores): así cada
// persona aprende justo lo que su empresa usa. Se sincroniza al entrar y al
// reiniciar (si el Super Administrador cambió algo, la práctica lo sigue).
export const syncPracticeFeatures = async ({
  realCompanyId,
  practiceCompanyId,
  actorId,
  transaction,
}: {
  realCompanyId: number;
  practiceCompanyId: number;
  actorId: number;
  transaction: Transaction;
}): Promise<void> => {
  const codes = await listEnabledFeatures(realCompanyId, transaction);
  const now = nowUtc();
  if (codes.length > 0) {
    // Una fila por (empresa, funcionalidad) (uq_company_feature): se enciende o se crea.
    await DataBase.instance.company_feature.bulkCreate(
      codes.map((featureCode) => ({
        id: 0,
        company_id: practiceCompanyId,
        feature_code: featureCode,
        enabled: true,
        settings: null,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      })),
      { transaction, updateOnDuplicate: ["enabled", "updated_by", "updated_at"] }
    );
  }
  // Lo que la empresa real ya no tiene se apaga también en la práctica.
  await DataBase.instance.company_feature.update(
    { enabled: false, updated_by: actorId, updated_at: now },
    {
      where: { company_id: practiceCompanyId, enabled: true, ...(codes.length > 0 ? { feature_code: { [Op.notIn]: codes } } : {}) },
      transaction,
    }
  );
};
