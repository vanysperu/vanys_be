import { IgnoreProperties } from "../../../../types/ignore-properties";
import { OverrideProperties } from "../../../../types/override-properties";
import { UserAttributes, UserCreationAttributes } from "../models/user.model";

// Para ignorar algunas propiedades
interface UserOmit
  extends IgnoreProperties<
    UserCreationAttributes,
    | "id"
    | "salt"
    | "status"
    | "login_status"
    | "failed_attempts"
    | "last_lock_date"
    | "last_unlock_date"
    | "lockout_minutes"
    | "recovery_code"
    | "created_at"
    | "created_by"
    | "updated_at"
    | "updated_by"
    
  > {}

// Por si requerimos sobreescribir algunas propiedades
export interface CreateUserDto
  extends OverrideProperties<
    UserOmit,
    {
      is_deleted?: boolean;
      roleIds?: number;
    }
  > {
  roles: number[];
}
