// src/lib/apiHelper.js
import { ZodError } from 'zod';

/**
 * Format Zod validation errors into client-friendly structure
 * @param {ZodError} error
 * @returns {{ message: string, fieldErrors: Record<string, string[]> }}
 */
export function formatZodError(error) {
  /** @type {Record<string, string[]>} */
  const fieldErrors = {};

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
 * @param {any} res
 * @param {number} statusCode
 * @param {any} data
 */
export function sendJson(res, statusCode, data) {
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
 * @param {any} req
 * @returns {any}
 */
export function parseRequestBody(req) {
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
