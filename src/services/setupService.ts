import { query, queryOne } from '../db/pool.js';

/** Setup state machine for first-run wizard. */
export type SetupStep = 
  | 'PENDING'        // No setup started
  | 'ADMIN_CREATED'  // Admin user created
  | 'STORE_CREATED'  // Store created  
  | 'TELEGRAM_CONFIGURED'  // Telegram bot connected
  | 'PAYMENTS_CONFIGURED'  // Payment methods configured
  | 'STORAGE_VERIFIED'     // Storage verified (optional)
  | 'COMPLETED';    // Setup fully complete

export interface SetupState {
  step: SetupStep;
  completedAt?: string;
  adminUserId?: string;
  storeId?: string;
  telegramBotConnected: boolean;
  paymentsConfigured: boolean;
  storageVerified: boolean;
  startedAt: string;
  lastUpdatedAt: string;
}

const SETUP_KEY = '_system_setup';

async function getSystemSetting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    'SELECT value FROM "Setting" WHERE key = $1 AND "storeId" IS NULL',
    [key]
  );
  return row?.value ? JSON.parse(row.value as string) : null;
}

async function setSystemSetting(key: string, value: unknown): Promise<void> {
  await query(
    `INSERT INTO "Setting" (key, value, "storeId")
     VALUES ($1, $2, NULL)
     ON CONFLICT (key, "storeId") 
     DO UPDATE SET value = $2, "updatedAt" = now()`,
    [key, JSON.stringify(value)]
  );
}

export async function getSetupState(): Promise<SetupState> {
  const stored = await getSystemSetting(SETUP_KEY);
  if (!stored) {
    return {
      step: 'PENDING',
      completedAt: undefined,
      adminUserId: undefined,
      storeId: undefined,
      telegramBotConnected: false,
      paymentsConfigured: false,
      storageVerified: false,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
  }
  return stored as unknown as SetupState;
}

export async function updateSetupState(partial: Partial<SetupState>): Promise<SetupState> {
  const current = await getSetupState();
  const updated: SetupState = {
    ...current,
    ...partial,
    lastUpdatedAt: new Date().toISOString(),
  };
  
  // Auto-advance step based on completed actions
  if (partial.adminUserId && current.step === 'PENDING') {
    updated.step = 'ADMIN_CREATED';
  }
  if (partial.storeId && current.step === 'ADMIN_CREATED') {
    updated.step = 'STORE_CREATED';
  }
  if (partial.telegramBotConnected && current.step === 'STORE_CREATED') {
    updated.step = 'TELEGRAM_CONFIGURED';
  }
  if (partial.paymentsConfigured && current.step === 'TELEGRAM_CONFIGURED') {
    updated.step = 'PAYMENTS_CONFIGURED';
  }
  if (partial.storageVerified && ['TELEGRAM_CONFIGURED', 'PAYMENTS_CONFIGURED'].includes(current.step)) {
    updated.step = 'STORAGE_VERIFIED';
  }
  if (updated.step === 'PAYMENTS_CONFIGURED' || updated.step === 'STORAGE_VERIFIED') {
    if (updated.paymentsConfigured && updated.telegramBotConnected) {
      updated.step = 'COMPLETED';
      updated.completedAt = new Date().toISOString();
    }
  }
  
  await setSystemSetting(SETUP_KEY, updated);
  return updated;
}

export async function isSetupComplete(): Promise<boolean> {
  const state = await getSetupState();
  return state.step === 'COMPLETED';
}

export async function resetSetup(): Promise<void> {
  await query('DELETE FROM "Setting" WHERE key = $1 AND "storeId" IS NULL', [SETUP_KEY]);
}
