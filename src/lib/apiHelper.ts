// src/lib/apiHelper.ts
import { ZodError } from 'zod';

export interface FormattedZodError {
  message: string;
  fieldErrors: Record<string, string[]>;
}

/**
 * Format Zod validation errors into client-friendly structure
 */
export function formatZodError(error: ZodError): FormattedZodError {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  }

  const firstMessage = error.issues[0]?.message || 'Validation error';
  return {
    message: firstMessage,
    fieldErrors,
  };
}

/**
 * Send JSON response helper
 */
export function sendJson(res: any, statusCode: number, data: any): any {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
  return res;
}

/**
 * Parse request body safely
 */
export function parseRequestBody(req: any): any {
  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body;
}

