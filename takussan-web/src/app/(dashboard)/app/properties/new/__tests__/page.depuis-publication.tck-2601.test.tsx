import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-2601 (AC3) — `?brouillon=publication` fait reprendre à l'assistant connecté l'annonce commencée
 * sans compte (sa clé de brouillon à elle) ; toute autre valeur, ou aucune, l'assistant de toujours.
 * Harnais de `page.quota.test.tsx`.
 */

const mockGetMe = vi.fn();
const mockQuota = vi.fn();

// P152.03 — l'admin du rôle système porte `properties.create`.
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => ['properties.create'] }));
// TCK-2638 — le traducteur RÉEL de next-intl (et non le double qui rend le gabarit brut) : les messages
// du quota sont de l'ICU (`plural`), et l'écran se juge sur la phrase que lit l'utilisateur.
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const fr = (await import('@/messages/fr.json')).default as Record<string, unknown>;
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: 'fr', messages: fr, namespace: namespace as never, timeZone: 'Africa/Dakar' }),
    getLocale: async () => 'fr',
    getMessages: async () => fr,
  };
});
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({ fetchListingQuotaAction: () => mockQuota() }));
vi.mock('@/components/property-form/PropertyWizard', () => ({
  PropertyWizard: ({ depuisPublication }: { depuisPublication?: boolean }) => (
    <div data-testid="assistant">{depuisPublication ? 'publication' : 'toujours'}</div>
  ),
}));

import Page from '../page';

describe('/app/properties/new — l’annonce reprise depuis /publish (TCK-2601)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agency_admin'] });
    mockQuota.mockResolvedValue({ limit: null, used: 0, can_create: true });
  });

  it.each([
    [{ brouillon: 'publication' }, 'publication'],
    [{ brouillon: 'autre' }, 'toujours'],
    [{}, 'toujours'],
  ])('%j → l’assistant %s', async (parametres, attendu) => {
    render(withIntl(await Page({ searchParams: Promise.resolve(parametres) })));
    expect(screen.getByTestId('assistant')).toHaveTextContent(attendu);
    cleanup();
  });

  it('sans paramètres du tout (appel historique) : l’assistant de toujours', async () => {
    render(withIntl(await Page()));
    expect(screen.getByTestId('assistant')).toHaveTextContent('toujours');
  });
});
