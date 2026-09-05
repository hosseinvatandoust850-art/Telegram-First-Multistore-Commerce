import { verifyJwt } from '../lib/crypto.js';
import { UnauthorizedError } from '../lib/errors.js';
import { findById } from '../services/userService.js';
import { logger } from '../lib/logger.js';
/** Verify the Bearer token and attach the resolved user to the context. */
export const requireAuth = async (c, next) => {
    const header = c.req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token)
        throw new UnauthorizedError('Missing authentication token');
    const payload = await verifyJwt(token);
    if (!payload || !payload.userId)
        throw new UnauthorizedError('Invalid or expired token');
    const user = await findById(payload.userId);
    if (!user || user.status !== 'ACTIVE')
        throw new UnauthorizedError('Account not active');
    c.user = user;
    await next();
};
/** Require a store/admin role attached to a specific store. */
export const requireStoreAdmin = async (c, next) => {
    await requireAuth(c, async () => {
        const user = c.user;
        if (!user)
            throw new UnauthorizedError();
        if (!['STORE_OWNER', 'STORE_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            throw new UnauthorizedError('Insufficient permissions');
        }
        await next();
    });
};
/** Require a super admin. */
export const requireSuperAdmin = async (c, next) => {
    await requireAuth(c, async () => {
        const user = c.user;
        if (!user || user.role !== 'SUPER_ADMIN') {
            throw new UnauthorizedError('Super admin only');
        }
        await next();
    });
};
export function getUser(c) {
    return c.user;
}
export { logger };
