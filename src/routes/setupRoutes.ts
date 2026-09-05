import { Hono } from 'hono';
import { z } from 'zod';
import { createUser } from '../services/userService.js';
import { createStore, getStoreById, updateStore } from '../services/storeService.js';
import { signJwt } from '../lib/crypto.js';
import { env } from '../config/env.js';
import { getSetupState, updateSetupState, isSetupComplete } from '../services/setupService.js';
import { TelegramBot } from '../services/telegram.js';
import { registerStoreWebhook } from '../services/botService.js';
import { storageHealth } from '../services/storage.js';

export const setupRoutes = new Hono();

/**
 * Setup wizard routes for first-time installation.
 * These routes are only accessible when setup is not complete.
 */

// Get current setup state
setupRoutes.get('/setup/state', async (c) => {
  const state = await getSetupState();
  const isComplete = await isSetupComplete();
  return c.json({
    ok: true,
    state,
    isComplete,
    canModify: !isComplete,
  });
});

// Step 1: Create admin user and store
const adminSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  storeName: z.string().min(1).max(120),
  storeSlug: z.string().optional(),
  locale: z.string().optional().default('en'),
  currency: z.string().optional().default('USDT'),
});

setupRoutes.post('/setup/admin', async (c) => {
  const isComplete = await isSetupComplete();
  if (isComplete) {
    return c.json({ ok: false, error: 'Setup already completed' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = adminSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }

  const { name, email, password, storeName, storeSlug, locale, currency } = parsed.data;

  try {
    // Create admin user
    const user = await createUser({
      email,
      password,
      name,
      role: 'SUPER_ADMIN',
    });

    // Create store
    const store = await createStore({
      name: storeName,
      slug: storeSlug,
      locale,
      currency,
      userId: user.id,
    });

    // Update setup state
    await updateSetupState({
      adminUserId: user.id,
      storeId: store.id,
    });

    // Issue JWT token
    const token = await signJwt(
      { userId: user.id, storeId: store.id, role: 'SUPER_ADMIN' },
      env.security.sessionTtlSeconds,
    );

    return c.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      store: { id: store.id, slug: store.slug, name: store.name },
      token,
      nextStep: 'TELEGRAM_CONFIGURED',
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return c.json({ ok: false, error: 'Email already registered' }, 409);
    }
    throw err;
  }
});

// Step 2: Configure Telegram bot
const telegramSchema = z.object({
  botToken: z.string().min(10),
});

setupRoutes.post('/setup/telegram', async (c) => {
  const isComplete = await isSetupComplete();
  if (isComplete) {
    return c.json({ ok: false, error: 'Setup already completed' }, 403);
  }

  const state = await getSetupState();
  if (!state.storeId) {
    return c.json({ ok: false, error: 'Admin/store must be created first' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = telegramSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }

  const { botToken } = parsed.data;

  // Test the bot token by calling getMe
  const bot = new TelegramBot(botToken);
  try {
    const botInfo = await bot.getMe();
    if (!botInfo || !(botInfo as Record<string, unknown>).username) {
      return c.json({ ok: false, error: 'Invalid bot token' }, 400);
    }

    // Update store with bot token
    const store = await getStoreById(state.storeId);
    if (!store) {
      return c.json({ ok: false, error: 'Store not found' }, 404);
    }

    await updateStore(state.storeId, {
      telegramBotToken: botToken,
      telegramUsername: (botInfo as Record<string, string>).username,
    });

    // Try to register webhook
    let webhookRegistered = false;
    let webhookUrl = '';
    try {
      const result = await registerStoreWebhook(store);
      webhookRegistered = true;
      webhookUrl = result.url;
    } catch (err) {
      // Webhook registration may fail if URL is not HTTPS yet - that's okay
      webhookRegistered = false;
    }

    await updateSetupState({
      telegramBotConnected: true,
    });

    return c.json({
      ok: true,
      botUsername: (botInfo as Record<string, string>).username,
      webhookRegistered,
      webhookUrl,
      nextStep: 'PAYMENTS_CONFIGURED',
    });
  } catch (err) {
    return c.json({ 
      ok: false, 
      error: `Failed to connect bot: ${(err as Error).message}` 
    }, 400);
  }
});

// Step 3: Configure payments
const paymentSchema = z.object({
  method: z.enum(['TON', 'MANUAL', 'BOTH']),
  tonPaymentAddress: z.string().optional(),
  tonNetwork: z.enum(['mainnet', 'testnet']).optional().default('mainnet'),
  manualInstructions: z.string().optional(),
});

setupRoutes.post('/setup/payments', async (c) => {
  const isComplete = await isSetupComplete();
  if (isComplete) {
    return c.json({ ok: false, error: 'Setup already completed' }, 403);
  }

  const state = await getSetupState();
  if (!state.storeId) {
    return c.json({ ok: false, error: 'Admin/store must be created first' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }

  const { method, tonPaymentAddress, tonNetwork, manualInstructions } = parsed.data;

  // Store payment settings
  const settings: Record<string, unknown> = {
    paymentsEnabled: true,
    paymentMethods: method === 'BOTH' ? ['TON', 'MANUAL'] : [method],
  };

  if (tonPaymentAddress) {
    settings.tonPaymentAddress = tonPaymentAddress;
  }
  if (tonNetwork) {
    settings.tonNetwork = tonNetwork;
  }
  if (manualInstructions) {
    settings.manualPaymentInstructions = manualInstructions;
  }

  await updateStore(state.storeId, {
    settings: settings as any,
  });

  await updateSetupState({
    paymentsConfigured: true,
  });

  return c.json({
    ok: true,
    configuredMethods: method === 'BOTH' ? ['TON', 'MANUAL'] : [method],
    nextStep: 'STORAGE_VERIFIED',
  });
});

// Step 4: Verify storage (optional but recommended)
setupRoutes.get('/setup/storage/check', async (c) => {
  const isComplete = await isSetupComplete();
  if (isComplete) {
    return c.json({ ok: false, error: 'Setup already completed' }, 403);
  }

  const healthy = await storageHealth();
  const isS3 = env.storage.type === 's3';

  return c.json({
    ok: true,
    storageHealthy: healthy,
    storageType: env.storage.type,
    isPersistent: isS3, // S3 is always persistent
    warning: !healthy 
      ? 'Storage is not properly configured. Files may be lost on redeploy.' 
      : null,
  });
});

setupRoutes.post('/setup/storage/verify', async (c) => {
  const isComplete = await isSetupComplete();
  if (isComplete) {
    return c.json({ ok: false, error: 'Setup already completed' }, 403);
  }

  const healthy = await storageHealth();
  
  await updateSetupState({
    storageVerified: healthy,
  });

  const state = await getSetupState();
  const isFullyComplete = state.step === 'COMPLETED';

  return c.json({
    ok: true,
    storageHealthy: healthy,
    setupComplete: isFullyComplete,
  });
});

// Final completion check
setupRoutes.get('/setup/complete', async (c) => {
  const state = await getSetupState();
  const isComplete = state.step === 'COMPLETED';

  return c.json({
    ok: true,
    isComplete,
    state,
    readyForProduction: isComplete && state.storageVerified,
  });
});

// Lock setup after completion (called automatically)
setupRoutes.post('/setup/finalize', async (c) => {
  const state = await getSetupState();
  
  if (state.step !== 'COMPLETED') {
    return c.json({ ok: false, error: 'Cannot finalize incomplete setup' }, 400);
  }

  // Setup is already marked complete by updateSetupState
  // This endpoint just confirms finalization
  
  return c.json({
    ok: true,
    message: 'Setup completed successfully',
    state,
  });
});
