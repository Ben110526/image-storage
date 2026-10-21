import type { Context } from 'hono';
import type { ApiSuccessResponse, ApiErrorResponse } from '../types';

export function jsonSuccess<T>(c: Context, data: T, status: 200 | 201 = 200) {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
  };
  return c.json(body, status);
}

export function jsonError(
  c: Context,
  code: string,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503 = 400
) {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };
  return c.json(body, status);
}
