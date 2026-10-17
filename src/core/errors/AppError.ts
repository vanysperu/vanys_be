// Clase única para representar errores de negocio/HTTP en toda la app
// (CLAUDE.md sección 5). Se lanza con `throw new AppError(...)` y el
// middleware central `errorHandler` es el único que la traduce a la
// respuesta HTTP — ningún controller/service arma la respuesta a mano.
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: unknown,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
