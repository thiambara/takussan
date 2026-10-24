/**
 * TCK-1903 (P197.03) — l'écran des intégrations suit le profil actif.
 *
 * `fetchIntegrationsAction` lit les intégrations sous l'indice du profil actif (le cookie).
 * `IntegrationsManager` les copie dans son état local (`useState(initialIntegrations)`) : après un
 * changement de profil, `router.refresh()` rend la page sous le nouveau profil sans la démonter,
 * et sans `key` l'état local gardait les intégrations de l'agence quittée.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';

const profil = vi.hoisted(() => ({ actif: 'profil-a' as string | undefined }));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: async () => undefined }));
vi.mock('@/lib/session', () => ({ getActiveProfileId: async () => profil.actif }));

function integration(id: number, provider: string, agence: number) {
  return {
    id,
    provider,
    agency_id: agence,
    is_active: true,
    last_used_at: null,
    metadata: null,
    created_at: null,
    updated_at: null,
  };
}

vi.mock('@/app/actions/admin-settings', () => ({
  fetchIntegrationsAction: async () => ({
    ok: true,
    data: {
      data: profil.actif === 'profil-a' ? [integration(42, 'wave', 1)] : [integration(77, 'sms_orange', 2)],
    },
  }),
  fetchPaymentProviderSchemasAction: async () => ({ ok: true, data: [] }),
  fetchIntegrationWebhookEndpointAction: async () => ({ ok: false, message: '' }),
  createIntegrationAction: vi.fn(),
  updateIntegrationAction: vi.fn(),
  testIntegrationAction: vi.fn(),
  deleteIntegrationAction: vi.fn(),
  rotateIntegrationWebhookEndpointAction: vi.fn(),
}));

async function pageRendue() {
  const { default: Page } = await import('../page');
  return withIntl(await Page());
}

describe('/app/agency/integrations — changement de profil (TCK-1903)', () => {
  it('rend les intégrations de la nouvelle agence quand la page est rendue sous un autre profil', async () => {
    profil.actif = 'profil-a';
    const { rerender } = render(await pageRendue());
    expect(screen.getByRole('heading', { name: /wave/i })).toBeInTheDocument();

    profil.actif = 'profil-b';
    rerender(await pageRendue());

    expect(screen.queryByRole('heading', { name: /wave/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /orange/i })).toBeInTheDocument();
  });
});
