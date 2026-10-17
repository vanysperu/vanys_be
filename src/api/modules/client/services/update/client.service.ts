import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { ClientPartialAttributes } from "../../model/client.model";

const updateClientById = async ({
  client,
  clientId,
  updatedBy,
}: {
  client: ClientPartialAttributes;
  clientId: number;
  updatedBy?: number;
}) => {
  // Whitelist explícita — nunca `{...client}` directo: sin esto, el dueño
  // de un cliente propio podía mandar `company_id`/`business_unit_id` en el
  // body de `PUT /client/update/:id` y transferir el cliente (con su
  // documento/teléfono/dirección) a otra empresa.
  const safePayload = {
    name: client.name,
    document_number: client.document_number,
    email: client.email,
    phone: client.phone,
    address: client.address,
  };

  return DataBase.instance.client.update(
    { ...safePayload, updated_by: updatedBy, updated_at: nowUtc() },
    { where: { id: clientId } }
  );
};

export { updateClientById };
