import { OverrideProperties } from "../../../../types";

interface IRole {
  id: number;
  name: string;
}

export interface IDBUserInformation {
  id: number;
  username: string;
  email: string;
  name: string;
  paternal_lastname: string;
  maternal_lastname: string;
  date_of_birth: Date | null;
  // notifications: boolean;
  status: boolean;

  office_id: number | null;
  office_name: string | null;
  area_id: number | null;
  area_name: string | null;
  program_id: number | null;
  program_name: string | null;

  roles: string;
}

export interface IUserInformation
  extends OverrideProperties<
    IDBUserInformation,
    {
      roles: IRole[];
    }
  > {}
