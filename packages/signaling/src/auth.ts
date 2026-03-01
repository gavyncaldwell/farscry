import {jwtVerify} from 'jose';
import {logger} from './logger.js';

export interface AuthResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? '';

let secretKey: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!secretKey) {
    if (!SUPABASE_JWT_SECRET) {
      throw new Error('SUPABASE_JWT_SECRET environment variable is not set');
    }
    secretKey = new TextEncoder().encode(SUPABASE_JWT_SECRET);
  }
  return secretKey;
}

export async function validateToken(token: string): Promise<AuthResult> {
  try {
    if (!token || typeof token !== 'string') {
      return {valid: false, error: 'missing token'};
    }

    const {payload} = await jwtVerify(token, getSecret(), {
      audience: 'authenticated',
    });

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
