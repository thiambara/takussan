/**
 * TCK-775 (P14.11) — une erreur qui n'est pas une `ApiError` laisse une trace côté serveur.
 *
 * Avant ce ticket, un `TypeError` (un bug, un corps mal formé) levé dans une server action rendait
 * le message de repli (« erreur réseau, réessayez ») et n'écrivait RIEN : le bug devenait une
 * panne réseau aux yeux de l'utilisateur, et personne côté serveur ne le voyait.
 *
 * Deux gardes :
 * 1. **les cas exécutés** — `notifications.ts` et `admin-settings.ts`, les deux modules du
 *    constat : le nom, le message et la pile sont journalisés, jamais les données saisies ; une
 *    `ApiError` (réponse de l'API, déjà journalisée par elle) ne l'est pas ;
 * 2. **le recensement** — tout module `'use server'` de `src/app/actions/` qui attrape une erreur
 *    passe par `journaliserErreurInattendue`, et aucun `catch` n'y jette l'erreur sans la nommer.
 *    Il ÉCHOUE s'il ne scanne rien.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton-de-test',
  getActiveProfileId: async () => undefined,
}));

const fetchNotificationsMock = vi.fn();
vi.mock('@/lib/notifications', () => ({
  fetchNotifications: (...a: unknown[]) => fetchNotificationsMock(...a),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationUnread: vi.fn(),
}));

const createIntegrationMock = vi.fn();
vi.mock('@/lib/queries/settings', () => ({
  createIntegration: (...a: unknown[]) => createIntegrationMock(...a),
  deleteIntegration: vi.fn(),
  fetchIntegrations: vi.fn(),
  fetchIntegrationWebhookEndpoint: vi.fn(),
  fetchPaymentProviderSchemas: vi.fn(),
  rotateIntegrationWebhookEndpoint: vi.fn(),
  testIntegration: vi.fn(),
  updateIntegration: vi.fn(),
}));

import { ApiError } from '@/lib/api';
import { getNotificationsAction } from '@/app/actions/notifications';
import { createIntegrationAction } from '@/app/actions/admin-settings';

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => vi.clearAllMocks());

function journal(): string {
  return consoleError.mock.calls.map((appel) => appel.map(String).join(' ')).join('\n');
}

describe('une erreur hors ApiError est journalisée côté serveur', () => {
  it('notifications : nom, message et pile du TypeError', async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'data')");
    fetchNotificationsMock.mockRejectedValueOnce(bug);

    const res = await getNotificationsAction();

    expect(res.ok).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
    const texte = journal();
    expect(texte).toContain('notifications');
    expect(texte).toContain('TypeError');
    expect(texte).toContain("Cannot read properties of undefined (reading 'data')");
    expect(texte).toContain(bug.stack!.split('\n')[1].trim());
  });

  it('notifications : une ApiError ne se journalise pas', async () => {
    fetchNotificationsMock.mockRejectedValueOnce(new ApiError(500, null));

    const res = await getNotificationsAction();

    expect(res.ok).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('admin-settings : le journal porte l’erreur, jamais les données saisies', async () => {
    createIntegrationMock.mockRejectedValueOnce(new SyntaxError('Unexpected token < in JSON'));

    const res = await createIntegrationAction({
      provider: 'wave',
      name: 'Compte Wave',
      credentials: { api_key: 'sk-secret-de-test-8841' },
    } as never);

    expect(res.ok).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
    const texte = journal();
    expect(texte).toContain('admin-settings');
    expect(texte).toContain('SyntaxError');
    expect(texte).toContain('Unexpected token < in JSON');
    expect(texte).not.toContain('sk-secret-de-test-8841');
    expect(texte).not.toContain('Compte Wave');
  });
});

describe('recensement : toute server action qui attrape une erreur la journalise', () => {
  const DOSSIER = 'src/app/actions';
  const modules = readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ f, src: readFileSync(join(DOSSIER, f), 'utf8') }))
    .filter(({ src }) => /^'use server';/m.test(src) && /\bcatch\b/.test(src.replace(/\/\/.*$/gm, '')));

  it('scanne au moins un module (sinon il ne garde rien)', () => {
    expect(modules.length).toBeGreaterThan(10);
  });

  it.each(modules.map(({ f }) => f))('%s passe par journaliserErreurInattendue', (f) => {
    const { src } = modules.find((m) => m.f === f)!;
    expect(src).toContain('journaliserErreurInattendue(');
  });

  it.each(modules.map(({ f }) => f))('%s : aucun `catch` sans nom d’erreur', (f) => {
    const { src } = modules.find((m) => m.f === f)!;
    expect(src.replace(/\/\/.*$/gm, '')).not.toMatch(/\bcatch\s*\{/);
  });
});
