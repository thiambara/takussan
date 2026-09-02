import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { fetchAdminPlans } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { Plan } from '@/types/super-admin';

import { AdminPlansClient } from '../AdminPlansClient';

vi.mock('@/lib/queries/super-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/super-admin')>()),
  fetchAdminPlans: vi.fn(),
}));

const plan: Plan = {
  id: 1,
  code: 'starter',
  label: 'Starter',
  description: null,
  monthly_price_xof: 15000,
  platform_fee_pct: 5,
  trial_days: 0,
  limits: { max_active_listings: 10, max_agents: 3, max_branches: 1 },
  is_active: true,
  sort_order: 1,
  created_at: null,
  updated_at: null,
};

function monte() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <AdminPlansClient />
      </QueryClientProvider>
    </ToastProvider>,
  ));
}

/** Les deux grilles du composant : le formulaire de création et la ligne d'un plan. */
function grilles(): HTMLElement[] {
  return screen.getAllByRole('textbox').map((input) => input.parentElement as HTMLElement)
    .filter((el, i, arr) => arr.indexOf(el) === i);
}

/**
 * TCK-505, défaut #7 — les deux grilles `[1fr_1fr_160px_140px_auto(_auto)]` se posaient dès
 * `md`, c'est-à-dire à 768 px, DANS la coque super-admin dont la barre latérale prend 256 px.
 * Mesuré le 2026-09-02 à 768 : 480 px de contenu pour six colonnes, dont 300 px fixes et deux
 * boutons — les champs `1fr` tombaient à ~20 px et le bouton « Supprimer » sortait du viewport.
 *
 * À 1024 (seuil `lg`, 720 px de contenu), mesuré le même jour : le formulaire de création
 * (cinq colonnes) laisse 126 px à ses champs `1fr`, mais la ligne de plan (six colonnes, deux
 * boutons de 124 et 121 px) n'en laisse que 41 — sous les 120 px que l'AC5 exige. Le seuil est
 * donc `xl` (1280) pour les deux grilles : elles partagent leurs colonnes, et un formulaire en
 * colonnes au-dessus de lignes empilées ne s'aligne plus.
 *
 * L'ablation : remettre `md:` (ou `lg:`) sur l'une ou l'autre grille rougit l'assertion
 * d'absence — un `md:grid-cols-[…] xl:grid-cols-[…]` ne passerait pas non plus.
 */
describe('<AdminPlansClient> — grilles en colonnes dès xl seulement (TCK-505 #7)', () => {
  beforeEach(() => {
    vi.mocked(fetchAdminPlans).mockResolvedValue({ data: [plan] });
  });

  it('le formulaire de création et la ligne de plan se posent en colonnes dès xl, jamais dès md ni lg', async () => {
    monte();
    await screen.findByDisplayValue('starter');

    const cibles = grilles();
    expect(cibles).toHaveLength(2);

    const creation = cibles.find((g) => g.className.includes('grid-cols-[1fr_1fr_160px_140px_auto]'));
    const ligne = cibles.find((g) => g.className.includes('grid-cols-[1fr_1fr_160px_140px_auto_auto]'));
    expect(creation).toBeDefined();
    expect(ligne).toBeDefined();

    for (const grille of [creation!, ligne!]) {
      expect(grille.className).not.toMatch(/\b(md|lg):grid-cols-\[/);
      expect(grille.className).toMatch(/\bxl:grid-cols-\[1fr_1fr_160px_140px_auto(_auto)?\]/);
    }
  });
});
