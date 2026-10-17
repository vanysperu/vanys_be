import { IgnoreProperties, OverrideProperties } from "../../types";
import { IListOptions } from "./IListOptions.interface";

export interface IListQueryParams<T>
  extends OverrideProperties<
    IgnoreProperties<IListOptions<T>, "where" | "order">,
    { columns?: string, useFilters?: 0 | 1 }
  > {}
