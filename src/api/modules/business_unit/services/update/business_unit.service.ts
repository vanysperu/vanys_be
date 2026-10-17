import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { UpdateBusinessUnitDto } from "../../dtos/business_unit.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

const updateBusinessUnitById = async ({
  businessUnit,
  businessUnitId,
  updatedBy,
  transaction,
}: {
  businessUnit: UpdateBusinessUnitDto;
  businessUnitId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  // Whitelist explícita de campos editables — nunca `{...businessUnit}`
  // directo al `.update()`. `company_id` NO es editable acá: un admin de
  // empresa que pasa `assertBusinessUnitBelongsToCaller` para SU propia
  // tienda podía, antes de este fix, mandar `company_id` de otra empresa en
  // el body y "mover" la tienda (y en cascada todos sus usuarios/clientes/
  // cotizaciones, vía COALESCE(business_unit.company_id, user.company_id))
  // hacia esa otra empresa. Cambiar de empresa una tienda ya existente no es
  // una operación soportada por este endpoint.
  const safePayload = {
    business_code: businessUnit.business_code,
    logo_url: businessUnit.logo_url,
    address: businessUnit.address,
    primary_color: businessUnit.primary_color,
    secondary_color: businessUnit.secondary_color,
    working_days: businessUnit.working_days,
    opens_at: businessUnit.opens_at,
    closes_at: businessUnit.closes_at,
  };

  try {
    return await DataBase.instance.business_unit.update(
      { ...safePayload, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: businessUnitId }, transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { updateBusinessUnitById };
