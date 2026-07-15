import "server-only";
import { storage } from "@/lib/storage";

/**
 * Extracts the Bearer token from a request's Authorization header.
 * Returns null when absent or malformed.
 */
export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7) || null;
}

/**
 * Validates that the request carries a valid, unexpired admin session token.
 */
export async function isAuthenticated(req: Request): Promise<boolean> {
  const token = getBearerToken(req);
  if (!token) return false;
  return storage.validateAdminSession(token);
}
