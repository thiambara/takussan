/**
 * TCK-2589 (maquette a-1) — `variant="default"` rend le bouton plein de la fiche client ; sans la
 * prop, le contour de tous les autres appelants ne change pas, place réservée comprise.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { PlanifierUneVisite } from '../PlanifierUneVisite';

const profils = vi.hoisted(() => ({ isPending: false, data: undefined as unknown }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => profils }));
vi.mock('@/lib/queries/visits', () => ({ usePlanVisit: () => ({ mutateAsync: vi.fn(), isPending: false }), useCreneauxDeVisite: () => ({ isPending: true }) }));

const personnel = {
  data: [{ id: 'agency_admin:7', type: 'agency_admin', numeric_id: 7, agency_id: 3, status: 'active', created_at: null }],
  meta: { active_profile_id: 'agency_admin:7', count: 1 },
};

// Les classes propres à chaque variante de `buttonVariants`.
const PLEIN = 'bg-primary';
const CONTOUR = 'bg-fond-contour';

beforeEach(() => {
  profils.isPending = false;
  profils.data = personnel;
});

describe('<PlanifierUneVisite variant>', () => {
  it('sans la prop : le contour, comme avant', () => {
    render(withIntl(<PlanifierUneVisite agencyId={3} />));
    const bouton = screen.getByRole('button', { name: 'Planifier une visite' });
    expect(bouton).toHaveClass(CONTOUR);
    expect(bouton).not.toHaveClass(PLEIN);
  });

  it('variant="default" : le bouton plein', () => {
    render(withIntl(<PlanifierUneVisite agencyId={3} variant="default" />));
    const bouton = screen.getByRole('button', { name: 'Planifier une visite' });
    expect(bouton).toHaveClass(PLEIN);
    expect(bouton).not.toHaveClass(CONTOUR);
  });

  it('la place réservée prend la même variante que le bouton qu’elle attend', () => {
    profils.isPending = true;
    profils.data = undefined;
    const { container, unmount } = render(withIntl(<PlanifierUneVisite agencyId={3} placeReservee variant="default" />));
    expect(container.querySelector('[data-slot="place-reservee"]')).toHaveClass(PLEIN);
    unmount();
    const sans = render(withIntl(<PlanifierUneVisite agencyId={3} placeReservee />));
    expect(sans.container.querySelector('[data-slot="place-reservee"]')).toHaveClass(CONTOUR);
  });
});
