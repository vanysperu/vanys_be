import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { ClientAttributes } from "../../model/client.model";

export type CreateClientDto = Omit<
  ClientAttributes,
  "id" | "is_deleted" | "created_by" | "created_at" | "updated_by" | "updated_at"
>;

const createClient = async ({
  client,
  createdBy,
}: {
  client: CreateClientDto;
  createdBy?: number;
}) => {
  return DataBase.instance.client.create({
    id: 0,
    ...client,
    is_deleted: false,
    created_by: createdBy ?? null,
    created_at: nowUtc(),
    updated_by: null,
    updated_at: null,
  });
};

export { createClient };
