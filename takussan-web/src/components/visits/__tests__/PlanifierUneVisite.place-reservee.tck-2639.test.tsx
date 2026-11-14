/**
 * TCK-2639 (AC-F5, CLS nul) — « Planifier une visite » dépend des profils de l'appelant, lus après
 * l'hydratation. Sous `placeReservee`, la rangée d'actions de la fiche du bien garde sa place tant
 * qu'ils sont en vol (un bouton invisible, hors de l'accessibilité), puis ne rend rien pour qui n'est
 * pas du personnel : rien ne bouge quand la réponse arrive. Sans la prop, rien n'est réservé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { withIntl } from '@/test/intl';
import { PlanifierUneVisite } from '../PlanifierUneVisite';

const profils = vi.hoisted(() => ({ isPending: true, data: undefined as unknown }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => profils }));
vi.mock('@/lib/queries/visits', () => ({ usePlanVisit: () => ({ mutateAsync: vi.fn(), isPending: false }), useCreneauxDeVisite: () => ({ isPending: true }) }));

const bailleur = {
  data: [{ id: 'owner:1', type: 'owner', numeric_id: 1, agency_id: 3, status: 'active', created_at: null }],
  meta: { active_profile_id: 'owner:1', count: 1 },
};

const personnelDeLAgence3 = {
  data: [{ id: 'agency_admin:7', type: 'agency_admin', numeric_id: 7, agency_id: 3, status: 'active', created_at: null }],
  meta: { active_profile_id: 'agency_admin:7', count: 1 },
};

describe('<PlanifierUneVisite placeReservee> (TCK-2639)', () => {
  beforeEach(() => {
    profils.isPending = true;
    profils.data = undefined;
  });

  it('réserve la place du bouton, invisible et hors de l’accessibilité, tant que les profils sont en vol', () => {
    const { container } = render(withIntl(<PlanifierUneVisite agencyId={3} placeReservee />));
    const place = container.querySelector('[data-slot="place-reservee"]');
    expect(place).not.toBeNull();
    expect(place).toHaveClass('invisible');
    expect(place).toHaveAttribute('aria-hidden');
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('ne rend plus rien une fois les profils lus, pour qui n’est pas du personnel', () => {
    profils.isPending = false;
    profils.data = bailleur;
    const { container } = render(withIntl(<PlanifierUneVisite agencyId={3} placeReservee />));
    expect(container.querySelector('[data-slot="place-reservee"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('sans la prop, rien n’est réservé pendant la lecture', () => {
    const { container } = render(withIntl(<PlanifierUneVisite agencyId={3} />));
    expect(container.querySelector('[data-slot="place-reservee"]')).toBeNull();
  });

  /*
   * Relevé au navigateur le 2026-11-12, au repos (2 essais sur 4) : la place restait invisible alors
   * que la requête des profils était `success`. Le serveur rend la place (pas de profils) ; la coque,
   * hydratée avant cette frontière, a déjà lu les profils : le client rendait le VRAI bouton au
   * premier passage. Même balise, même texte — React hydrate et garde les attributs du serveur
   * (« won't be patched up ») : le bouton restait `invisible`, `data-slot="place-reservee"`.
   */
  it('à l’hydratation, rend ce que le serveur a rendu, puis le vrai bouton — même si le client a déjà les profils', async () => {
    const html = renderToString(withIntl(<PlanifierUneVisite agencyId={3} placeReservee />));
    expect(html).toContain('place-reservee');
    const conteneur = document.createElement('div');
    conteneur.innerHTML = html;
    document.body.appendChild(conteneur);
    profils.isPending = false;
    profils.data = personnelDeLAgence3;
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    let racine: Root | undefined;
    try {
      await act(async () => {
        racine = hydrateRoot(conteneur, withIntl(<PlanifierUneVisite agencyId={3} placeReservee />));
      });
      const bouton = within(conteneur).getByRole('button', { name: 'Planifier une visite' });
      expect(bouton).not.toHaveClass('invisible');
      expect(bouton).not.toHaveAttribute('data-slot', 'place-reservee');
      expect(bouton).not.toHaveAttribute('aria-hidden');
      expect(erreurs).not.toHaveBeenCalled();
    } finally {
      erreurs.mockRestore();
      act(() => racine?.unmount());
      conteneur.remove();
    }
  });
});
