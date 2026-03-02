import {createRemoteJWKSet, jwtVerify} from 'jose';
import {logger} from './logger.js';

export interface AuthResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';

// Support both legacy HS256 (shared secret) and new ES256 (JWKS) verification
let hmacSecret: Uint8Array | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getHmacSecret(): Uint8Array {
  if (!hmacSecret) {
    hmacSecret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
  }
  return hmacSecret;
}

function getJWKS() {
  if (!jwks) {
    if (!SUPABASE_URL) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }
    const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', SUPABASE_URL);
    jwks = createRemoteJWKSet(jwksUrl);
  }
  return jwks;
}

export async function validateToken(token: string): Promise<AuthResult> {
  try {
    if (!token || typeof token !== 'string') {
      return {valid: false, error: 'missing token'};
    }

    let payload;

    // Try JWKS (ES256) first if SUPABASE_URL is set, fall back to HS256
    if (SUPABASE_URL) {
      try {
        const result = await jwtVerify(token, getJWKS(), {
          audience: 'authenticated',
        });
        payload = result.payload;
      } catch {
        // Fall back to HS256 if JWKS fails and we have a secret
        if (SUPABASE_JWT_SECRET) {
          const result = await jwtVerify(token, getHmacSecret(), {
            audience: 'authenticated',
          });
          payload = result.payload;
        } else {
          throw new Error('JWKS verification failed and no JWT secret configured');
        }
      }
    } else if (SUPABASE_JWT_SECRET) {
      const result = await jwtVerify(token, getHmacSecret(), {
        audience: 'authenticated',
      });
      payload = result.payload;
    } else {
      throw new Error('No SUPABASE_URL or SUPABASE_JWT_SECRET configured');
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      return {valid: false, error: 'missing subject claim'};
    }

    return {valid: true, userId: payload.sub};
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid token';
    logger.warn(`Token validation failed: ${message}`);
    return {valid: false, error: message};
  }
}
