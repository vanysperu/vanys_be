import { ResourceType } from "../../resource/models/resource.model";

export interface ResourceTreeItem {
  id: number;
  module_id: number;
  parent_id: number | null;
  type: ResourceType;
  code: string;
  name: string;
  route: string | null;
  verb: string | null;
  icon: string | null;
  show_in_menu: boolean;
  position: number;
  granted: boolean;
  children: ResourceTreeItem[];
}

export interface ModuleTreeItem {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  position: number;
  resources: ResourceTreeItem[];
}

export interface RoleResourceTreeResponse {
  role: { id: number; name: string };
  modules: ModuleTreeItem[];
}
