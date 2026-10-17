import { ResourceType } from "../models/resource.model";

export interface CreateResourceDto {
  module_id: number;
  parent_id?: number | null;
  type: ResourceType;
  code: string;
  name: string;
  description?: string | null;
  route?: string | null;
  verb?: string | null;
  icon?: string | null;
  show_in_menu?: boolean;
  position?: number;
}

export interface UpdateResourceDto {
  module_id?: number;
  parent_id?: number | null;
  type?: ResourceType;
  code?: string;
  name?: string;
  description?: string | null;
  route?: string | null;
  verb?: string | null;
  icon?: string | null;
  show_in_menu?: boolean;
  position?: number;
}
