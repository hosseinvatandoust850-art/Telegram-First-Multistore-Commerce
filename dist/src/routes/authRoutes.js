import { Hono } from 'hono';
import { z } from 'zod';
import { createUser, authenticateWithPassword } from '../services/userService.js';
import { createStore } from '../services/storeService.js';
import { signJwt } from '../lib/crypto.js';
import { ConflictError } from '../lib/errors.js';
import { env } from '../config/env.js';
import { requireAuth, getUser } from '../middleware/auth.js';
import { countStores } from '../services/storeService.js';
export const authRoutes = new Hono();
const registerSchema = z.object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    password: z.string().min(8),
    storeName: z.string().min(1).max(120),
    storeSlug: z.string().optional(),
    locale: z.string().optional(),
});
async function issueToken(userId, storeId) {
    return signJwt({ userId, storeId, role: 'user' }, env.security.sessionTtlSeconds);
}
authRoutes.post('/auth/register', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ ok: false, error: parsed.error.flatten() }, 400);
    }
    const { name, email, password, storeName, storeSlug, locale } = parsed.data;
    // Guards against duplicate email (unique constraint raises 23505).
    const user = await createUser({
        email,
        password,
        name,
        role: 'STORE_OWNER',
    }).catch((err) => {
        if (err.code === '23505') {
            throw new ConflictError('Email already registered');
        }
        throw err;
    });
    const store = await createStore({
        name: storeName,
        slug: storeSlug,
        locale,
        userId: user.id,
    });
    const token = await issueToken(user.id, store.id);
    return c.json({
        ok: true,
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        store: { id: store.id, slug: store.slug, name: store.name },
    });
});
authRoutes.post('/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || '');
    const password = String(body.password || '');
    const user = await authenticateWithPassword(email, password);
    const token = await issueToken(user.id, user.storeId);
    return c.json({
        ok: true,
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
});
authRoutes.get('/auth/me', requireAuth, async (c) => {
    const user = getUser(c);
    return c.json({
        ok: true,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            storeId: user.storeId,
        },
    });
});
/** Whether this is the first time (no stores yet) on the instance. */
authRoutes.get('/auth/bootstrap', async (c) => {
    const stores = await countStores();
    return c.json({ ok: true, firstRun: stores === 0, storeCount: stores });
});
