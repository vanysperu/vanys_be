export interface CreateModuleDto {
  code: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  position?: number;
}

export interface UpdateModuleDto {
  code?: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
  position?: number;
}
