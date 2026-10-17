import { IgnoreProperties, OverrideProperties } from "../../../../types";
import { IAddRemove } from "../../../interfaces/IAddRemove";
import { CreateUserDto } from "./create-user.dto";

interface IUpdateUserNoPassword
  extends IgnoreProperties<Partial<CreateUserDto>, "password"> {
    document_type?: number;
  }

export interface UpdateUserDto
  extends OverrideProperties<
    Omit<IUpdateUserNoPassword, "document_type">,
    {
      roles?: IAddRemove;
    }
  > {
    date_of_birth?: string;
    address?: string;
    document_number?: string;
    document_type?: number;
    email?: string;
    gender?: number;
    maternal_lastname?: string;
    name?: string;
    paternal_lastname?: string;
    phone_number?: string;
    status?: boolean;
  }
