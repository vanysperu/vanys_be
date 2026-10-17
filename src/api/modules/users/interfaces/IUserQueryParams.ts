import { IListQueryParams } from "../../../interfaces/IListQuery.interface";
import { UserAttributes } from "../models/user.model";

export interface IUserQueryParams extends IListQueryParams<UserAttributes> {
    office_id?: number;
    area_id?: number;
    fullName?: string;
    order?: "asc" | "desc";
}

