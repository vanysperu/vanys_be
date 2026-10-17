export interface ApiResponse<T> {
  status: boolean;
  message?: string;
  code?: number;
  data?: T;
  errors?: string | { [key: string]: string }[];
}
