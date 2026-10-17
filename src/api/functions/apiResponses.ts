import { ApiResponse } from "../interfaces/ApiResponse.interface";

function successResponse<T>({ data, code, message }: { data: T; code: number; message?: string }): ApiResponse<T> {
  return {
    status: true,
    message: message,
    code: code,
    data: data,
  };
}

function errorResponse({
  message,
  code,
  errorDetail,
}: {
  message: string;
  code: number;
  errorDetail?: string | undefined;
}): ApiResponse<null> {
  return {
    status: false,
    message: message,
    code: code,
    errors: errorDetail || message,
  };
}

export { successResponse, errorResponse };
