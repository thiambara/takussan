import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgencyStandardWelcomeWizard } from '@/components/agency/AgencyStandardWelcomeWizard';
import { AgentWelcomeWizard } from '@/components/agent/AgentWelcomeWizard';
import { CustomerWelcomeWizard } from '@/components/customer/CustomerWelcomeWizard';
import { OwnerWelcomeWizard } from '@/components/owner/OwnerWelcomeWizard';
import { TenantWelcomeWizard } from '@/components/tenant/TenantWelcomeWizard';
import { marquerArriveeDeParcours } from '@/lib/arrivee-de-parcours';
import { withIntl } from '@/test/intl';

/**
 * TCK-2615 — plus de modale de bienvenue par-dessus un écran plein, après un assistant ou après une
 * publication (décision 4 b de l'audit, famille 2).
 *
 * Les cinq fenêtres RÉELLES de la coque sont montées ; seules leurs données sont doublées : la
 * session, les clés déjà vues (`useAccueilsVus`, vide : personne n'a encore rien vu), les baux du
 * locataire, et la route courante.
 */

let route = '/app';
vi.mock('next/navigation', () => ({
  usePathname: () => route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, first_name: 'Awa', roles: ['owner', 'agent', 'customer', 'agency_admin'], agency_id: 5 },
    token: 'jeton',
    isLoading: false,
  }),
}));

const marquerVu = vi.fn();
vi.mock('@/hooks/useAccueilsVus', () => ({
  useAccueilsVus: () => ({ vus: [], echec: false, marquerVu }),
}));

vi.mock('@/lib/queries/leases-active-summaries', () => ({
  useActiveLeaseSummaries: () => ({ data: { data: [{ id: 9 }] } }),
}));

const MARQUEUR_AGENCE = { agencyId: 5, unlockedAt: '2026-11-01T10:00:00Z' };

const FENETRES: Array<[string, ComponentType]> = [
  ['bailleur', OwnerWelcomeWizard],
  ['agent', AgentWelcomeWizard],
  ['client', CustomerWelcomeWizard],
  ['locataire', TenantWelcomeWizard],
  ['administrateur d’agence standard', () => <AgencyStandardWelcomeWizard marqueur={MARQUEUR_AGENCE} />],
];

/**
 * AC1 dit « sans `role="dialog"` dans le DOM » : on compte dans le DOM, pas dans l'arbre
 * d'accessibilité. Une modale ouverte rend le reste `aria-hidden` — deux fenêtres ouvertes se
 * masquent l'une l'autre, et `queryByRole` n'en verrait AUCUNE.
 */
const fenetresDansLeDom = () => document.querySelectorAll('[role="dialog"]').length;

/** Monter puis démonter la coque : `unmount` + un tour de minuterie (la fin de l'arrivée). */
async function quitterLaCoque(demonter: () => void) {
  demonter();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

beforeEach(() => {
  route = '/app';
  marquerVu.mockClear();
  sessionStorage.clear();
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
});

describe.each(FENETRES)('TCK-2615 — la fenêtre de bienvenue %s', (_nom, Fenetre) => {
  it('AC3 — arrivée ordinaire sur /app d’un compte qui ne l’a jamais vue : elle s’ouvre, comme avant', () => {
    render(withIntl(<Fenetre />));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('AC2 — sur l’écran plein /app/properties/new : aucune fenêtre, et rien n’est marqué vu', () => {
    route = '/app/properties/new';
    render(withIntl(<Fenetre />));
    expect(fenetresDansLeDom()).toBe(0);
    expect(marquerVu).not.toHaveBeenCalled();
  });

  it('AC1 — arrivée qui suit un assistant : aucune fenêtre ; l’arrivée ordinaire suivante la montre', async () => {
    marquerArriveeDeParcours('assistant');
    const premiere = render(withIntl(<Fenetre />));
    expect(fenetresDansLeDom()).toBe(0);
    expect(marquerVu).not.toHaveBeenCalled();
    await quitterLaCoque(premiere.unmount);

    render(withIntl(<Fenetre />));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('TCK-2615 — l’arrivée qui suit une publication', () => {
  it('l’écran plein publie puis ouvre la fiche : la coque reste montée, aucune fenêtre ne s’ouvre', () => {
    route = '/app/properties/new';
    const vue = render(withIntl(<OwnerWelcomeWizard />));
    expect(fenetresDansLeDom()).toBe(0);

    act(() => marquerArriveeDeParcours('publication'));
    route = '/app/properties/42';
    vue.rerender(withIntl(<OwnerWelcomeWizard />));
    expect(fenetresDansLeDom()).toBe(0);
  });

  it('quitter l’écran plein SANS publier, dans la même visite, rend la fenêtre (elle n’a pas été marquée vue)', () => {
    route = '/app/properties/new';
    const vue = render(withIntl(<OwnerWelcomeWizard />));
    expect(fenetresDansLeDom()).toBe(0);

    route = '/app';
    vue.rerender(withIntl(<OwnerWelcomeWizard />));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('TCK-2615 — le marqueur d’arrivée', () => {
  it('un marqueur périmé (assistant fini il y a plus de deux minutes, jamais suivi de /app) ne suspend rien', () => {
    const maintenant = Date.now();
    const horloge = vi.spyOn(Date, 'now').mockReturnValue(maintenant - 3 * 60_000);
    marquerArriveeDeParcours('assistant');
    horloge.mockReturnValue(maintenant);

    render(withIntl(<OwnerWelcomeWizard />));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    horloge.mockRestore();
  });

  it('toutes les fenêtres d’une même arrivée sont suspendues, pas seulement la première qui lit le marqueur', () => {
    marquerArriveeDeParcours('assistant');
    render(
      withIntl(
        <>
          <OwnerWelcomeWizard />
          <AgentWelcomeWizard />
          <TenantWelcomeWizard />
        </>,
      ),
    );
    expect(fenetresDansLeDom()).toBe(0);
  });
});
