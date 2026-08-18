export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Sesión no válida o expirada') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'No tienes permisos para hacer esto') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'No encontrado') => new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

export const tooLarge = (message: string) => new AppError(413, 'payload_too_large', message);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable', message, details);
