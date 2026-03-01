import { logger } from './logger.js';

export interface AuthResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

// TODO: Set from environment variable (Supabase project settings -> JWT Secret)
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? '';

/**
 * Validates a Supabase JWT access token.
 *
 * For production, replace this with proper verification using the `jose` library:
 *   import { jwtVerify } from 'jose';
 *   const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
 *   const { payload } = await jwtVerify(token, secret);
 *
 * Current implementation: decode-only with basic structural + expiry checks.
 * This is NOT secure for production — install jose and verify the signature.
 */
export function validateToken(token: string): AuthResult {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'missing token' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'malformed token' };
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    );

    if (!payload.sub || typeof payload.sub !== 'string') {
      return { valid: false, error: 'missing subject claim' };
    }

    // Verify token hasn't expired
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return { valid: false, error: 'token expired' };
    }

    // Verify this is a Supabase-issued token (aud claim)
    if (payload.aud && payload.aud !== 'authenticated') {
      return { valid: false, error: 'invalid audience' };
    }

    // In production, verify signature against SUPABASE_JWT_SECRET using jose
    if (!SUPABASE_JWT_SECRET) {
      logger.warn('SUPABASE_JWT_SECRET not set — skipping signature verification');
    }

    return { valid: true, userId: payload.sub };
  } catch {
    logger.warn('Token validation failed');
    return { valid: false, error: 'invalid token' };
  }
}
