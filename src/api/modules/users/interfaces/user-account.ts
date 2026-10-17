import { IncludeProperties, OverrideProperties } from "../../../../types";
import { UserAttributes } from "../models/user.model";

interface IUserRole {
  id: number;
  name: string;
}

export interface IDbUserAccount
  extends IncludeProperties<
    UserAttributes,
    | "id"
    | "username"
    | "email"
    | "name"
    | "paternal_lastname"
    | "maternal_lastname"
    | "date_of_birth"
  > {
  roles: string;
}

export interface IUserAccount
  extends OverrideProperties<
    IDbUserAccount,
    {
      roles: IUserRole[] | [];
    }
  > {}
