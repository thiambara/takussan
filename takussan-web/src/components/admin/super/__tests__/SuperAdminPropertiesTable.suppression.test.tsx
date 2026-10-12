/**
 * TCK-633 (AC2, décision D2 du porteur) — la modale super-admin de suppression d'un bien
 * promettait elle aussi une restauration (« peuvent être restaurés depuis l'admin »). Aucune
 * route ni aucun écran ne restaure un bien supprimé, pour personne : la corbeille est hors
 * périmètre. Même traitement que la modale du tableau de bord
 * (`src/components/property-dashboard/__tests__/suppression-sans-promesse.test.tsx`).
 *
 * Le texte attendu est écrit ici EN CLAIR, par langue, et comparé à l'égalité : une liste de
 * motifs interdits laisse passer toute promesse qu'elle n'a pas prévue, une égalité stricte
 * refuse tout ajout quelle qu'en soit la forme.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl } from '@/test/intl';
import type { AdminPropertyRow } from '@/types/super-admin';
import { SuperAdminPropertiesTable } from '../SuperAdminPropertiesTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/queries/super-admin', () => ({
  archiveProperties: vi.fn(),
  deleteProperty: vi.fn(),
  postPropertyAction: vi.fn(),
}));

const DICTIONNAIRES = { fr, en, wo } as const;

const BIEN: AdminPropertyRow = {
  id: 47,
  reference_number: 'TK-47',
  title: 'Studio à Ouakam',
  slug: 'studio-ouakam',
  type: 'apartment',
  status: 'available',
  status_label: null,
  visibility: 'public',
  contract_type: 'rent',
  rent_period: 'monthly',
  price: 250000,
  currency: 'XOF',
  published_at: '2026-10-01T10:00:00+00:00',
  created_at: '2026-09-30T10:00:00+00:00',
  location: { city: 'Dakar', region: 'Dakar', country: 'SN' },
  agency: null,
};

/** Ce que la modale doit dire, mot pour mot : la suppression, et qu'elle est définitive. */
const ATTENDU = {
  fr: 'La suppression retire le bien des listes et du site. Cette action est irréversible.',
  en: 'Deletion takes the property off the lists and the site. This action cannot be undone.',
  wo: 'Kër gi dañu koy far, te du feeñati ci limu yi ak ci sit bi. Jëf bii mënatul dellu.',
} as const;

describe('SuperAdminPropertiesTable — supprimer un bien (TCK-633, AC2)', () => {
  it.each(['fr', 'en', 'wo'] as const)(
    'en %s, la modale dit exactement que la suppression est définitive, sans promesse de retour',
    async (locale) => {
      const user = userEvent.setup();
      const t = { ...fr.superAdmin.properties.table, ...DICTIONNAIRES[locale].superAdmin.properties.table };
      const supprimer = { ...fr.common.actions, ...DICTIONNAIRES[locale].common.actions }.delete;
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      render(
        withIntl(
          <QueryClientProvider client={queryClient}>
            <SuperAdminPropertiesTable rows={[BIEN]} total={1} onChange={vi.fn()} />
          </QueryClientProvider>,
          locale,
        ),
      );

      await user.click(screen.getByRole('button', { name: t.rowActionsAria.replace('{title}', BIEN.title) }));
      await user.click(await screen.findByRole('menuitem', { name: supprimer }));
      const dialogue = await screen.findByRole('dialog');

      expect(dialogue).toHaveAccessibleDescription(ATTENDU[locale]);
    },
  );
});
