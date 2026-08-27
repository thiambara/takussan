import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { User } from '@/types/user';

/**
 * TCK-379 — le chemin entrant DÉLIVRE ce qu'il promet.
 *
 * Mesure du 2026-08-27 qui CONTREDIT le ticket : celui-ci décrit
 * `TenantOnboardingChecklistWidget.tsx:133` comme l'unique chemin atteignant
 * `/app/inventories/new`, « avec `?lease_id=` ». Le paramètre lu par la page s'appelle `lease`.
 * Ce chemin-là n'atteignait donc PAS le formulaire : il tombait sur l'écran de sélection de bail.
 *
 * *Un lien qui mène à une page vide coche « le lien existe » aussi bien qu'un vrai correctif* —
 * ce test refuse ce coche-là : il vérifie ce que la page RÉPOND, pas qu'un `href` existe.
 */

vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 1, roles: ['tenant'] }) as unknown as User,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (cle: string) => cle,
}));
vi.mock('@/components/inventory', () => ({
  InventoryForm: ({ leaseId }: { leaseId: number }) => (
    <div data-testid="formulaire">bail {leaseId}</div>
  ),
  InventoryLeasePicker: () => <div data-testid="selecteur" />,
}));

async function ouvre(query: Record<string, string>) {
  const { default: Page } = await import('../page');
  render(await Page({ searchParams: Promise.resolve(query) }));
}

describe('/app/inventories/new — le paramètre de bail', () => {
  it('rend le formulaire pour le paramètre que la page lit réellement', async () => {
    await ouvre({ lease: '42' });
    expect(screen.getByTestId('formulaire')).toHaveTextContent('bail 42');
  });

  it('rend le sélecteur de bail — et non un cul-de-sac — quand aucun bail n’est donné', async () => {
    // Avant ce ticket : « Aucun bail sélectionné » + un bouton vers `/app/leases`, c'est-à-dire
    // le renvoi vers une autre section que le ticket condamne sur `/app/inventories`.
    await ouvre({});
    expect(screen.getByTestId('selecteur')).toBeInTheDocument();
  });

  it('le widget locataire écrit le paramètre que la page lit', async () => {
    // Ce test lit les DEUX moitiés et les compare. Une assertion qui ne regarderait que le
    // `href` du widget serait verte avec `?lease_id=` — c'est exactement ce qui a tenu jusqu'ici.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const widget = fs.readFileSync(
      path.resolve(__dirname, '../../../../../../components/tenant/TenantOnboardingChecklistWidget.tsx'),
      'utf8',
    );
    const lien = /\/app\/inventories\/new\?([a-z_]+)=/.exec(widget);
    expect(lien, 'le widget ne produit plus de lien vers /app/inventories/new').not.toBeNull();

    const parametre = (lien as RegExpExecArray)[1];
    await ouvre({ [parametre]: '7' });
    expect(
      screen.queryByTestId('formulaire'),
      `le widget écrit « ?${parametre}= », que la page n'exploite pas`,
    ).toHaveTextContent('bail 7');
  });
});
