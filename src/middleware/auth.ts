import type { MiddlewareHandler } from 'hono';
import type { Context, Next } from 'hono';
import { verifyJwt } from '../lib/crypto.js';
import { UnauthorizedError } from '../lib/errors.js';
import { findById } from '../services/userService.js';
import type { UserRow } from '../db/types.js';
import { logger } from '../lib/logger.js';

export interface AuthContext {
  user?: UserRow;
}

/** Verify the Bearer token and attach the resolved user to the context. */
export const requireAuth: MiddlewareHandler = async (c: Context, next: Next) => {
  const header = c.req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new UnauthorizedError('Missing authentication token');
  const payload = await verifyJwt(token);
  if (!payload || !payload.userId) throw new UnauthorizedError('Invalid or expired token');
  const user = await findById(payload.userId as string);
  if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('Account not active');
  (c as Context & { user?: UserRow }).user = user;
  await next();
};

/** Require a store/admin role attached to a specific store. */
export const requireStoreAdmin: MiddlewareHandler = async (c: Context, next: Next) => {
  await requireAuth(c, async () => {
    const user = (c as Context & { user?: UserRow }).user;
    if (!user) throw new UnauthorizedError();
    if (!['STORE_OWNER', 'STORE_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      throw new UnauthorizedError('Insufficient permissions');
    }
    await next();
  });
};

/** Require a super admin. */
export const requireSuperAdmin: MiddlewareHandler = async (c: Context, next: Next) => {
  await requireAuth(c, async () => {
    const user = (c as Context & { user?: UserRow }).user;
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new UnauthorizedError('Super admin only');
    }
    await next();
  });
};

export function getUser(c: Context): UserRow | undefined {
  return (c as Context & { user?: UserRow }).user;
}

export { logger };
