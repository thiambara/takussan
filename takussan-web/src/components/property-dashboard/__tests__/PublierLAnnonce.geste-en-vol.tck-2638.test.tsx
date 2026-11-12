/**
 * TCK-2638 — contre-vérification (verif-commercial) : « Publier l'annonce » de la ligne du mode Gestion
 * lit le registre des gestes EN VOL du bien (`gestes-en-vol`). Un statut, une duplication ou une
 * suppression partis du « ⋯ » du même bien le désactivent jusqu'à leur issue — sinon deux actions
 * serveur partent sur le même bien. Le registre est le vrai : seul le geste qui le marque est simulé.
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublierLAnnonce } from '@/components/property-dashboard/GestionDuBien';
import { marquerGesteEnVol } from '@/lib/biens/gestes-en-vol';
import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/property-dashboard/useGestesDuBien', () => ({
  useGestesDuBien: () => ({ canPublish: true, canDelete: true }),
}));
vi.mock('@/components/contact/PublicationAvecCoordonnees', () => ({
  usePublicationAvecCoordonnees: () => ({ publier: vi.fn(), enCours: false, dialogue: null }),
}));

/** Un bien vacant à louer, hors ligne : celui auquel la ligne propose « Publier l'annonce ». */
const STUDIO = {
  id: 41,
  reference_number: 'TK-41',
  title: 'Studio',
  slug: 'studio',
  price: 150_000,
  currency: 'XOF',
  type: 'apartment',
  contract_type: 'rent',
  rent_period: 'monthly',
  status: 'draft',
  visibility: 'private',
  is_online: false,
  occupancy: {
    state: 'vacant',
    vacant_since: null,
    lease: null,
    tenant: null,
    rent: null,
    current_month: null,
  },
} as unknown as PropertyListItem;

const bouton = () => screen.getByRole('button', { name: 'Publier l’annonce — Studio' });

let liberer: (() => void) | null = null;
afterEach(() => {
  liberer?.();
  liberer = null;
});

describe('« Publier l’annonce » et les gestes en vol du même bien', () => {
  it('actif sans geste en vol', () => {
    render(withIntl(<PublierLAnnonce property={STUDIO} />));
    expect(bouton()).toBeEnabled();
  });

  it('un geste du « ⋯ » en vol sur ce bien le désactive, et son issue le rend', () => {
    render(withIntl(<PublierLAnnonce property={STUDIO} />));

    act(() => {
      liberer = marquerGesteEnVol(STUDIO.id);
    });
    expect(bouton()).toBeDisabled();

    act(() => {
      liberer?.();
      liberer = null;
    });
    expect(bouton()).toBeEnabled();
  });

  it('un geste en vol sur un AUTRE bien ne le touche pas', () => {
    render(withIntl(<PublierLAnnonce property={STUDIO} />));
    act(() => {
      liberer = marquerGesteEnVol(STUDIO.id + 1);
    });
    expect(bouton()).toBeEnabled();
  });

  it('déjà en vol au montage (la carte remontée le retrouve) : désactivé d’emblée', () => {
    liberer = marquerGesteEnVol(STUDIO.id);
    render(withIntl(<PublierLAnnonce property={STUDIO} />));
    expect(bouton()).toBeDisabled();
  });
});
