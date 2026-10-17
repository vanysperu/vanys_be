
export interface BasicSignInResponse<T>  {
    statusCode: number,
    message: string,
    success: boolean,
    data: T | null;
}
