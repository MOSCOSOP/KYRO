import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Source = 'body' | 'query' | 'params';

/** Valida y reemplaza el contenido de la petición por el dato ya tipado. */
export function validate<T extends ZodTypeAny>(schema: T, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    if (source === 'query') {
      Object.defineProperty(req, 'validatedQuery', { value: result.data, writable: true });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

export function validated<T>(req: Request, source: Source = 'body'): T {
  if (source === 'query') return (req as unknown as { validatedQuery: T }).validatedQuery;
  return req[source] as T;
}

/** Envuelve handlers async para que los errores lleguen al error handler. */
export function handler<T extends (req: Request, res: Response) => Promise<unknown> | unknown>(
  fn: T,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export type Infer<T extends ZodTypeAny> = z.infer<T>;
