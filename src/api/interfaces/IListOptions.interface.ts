import { Order, WhereOptions, ProjectionAlias } from "sequelize";

export interface IListOptions<T> {
  order?: [string, "asc" | "desc"];
  where?: WhereOptions<T>;
  columns?: ((keyof T) | string)[]
  page?: number;
  limit?: number;
  pageSize?: number;
  endDate?: string;
  isActive?: boolean;
  roleId?: number;
  startDate?: string;
  searchTerm?: string;
  sort?: string;
  brandId?: string;
  modelId?: string;
  categoryId?: string;
  equipmentTypeId?: number;
  clientId?: number;
}
