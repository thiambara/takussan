/**
 * TCK-1814 (P180.03) — le logo d'agence passe par le loader de `next/image` (ADR-0029 §4).
 *
 * `logo_url` est l'ORIGINAL du seau public, jusqu'à 10 Mo et 20 Mpx. Posé en `<img>` brut, en
 * `AvatarImage` ou en `Image unoptimized`, il est téléchargé entier pour une pastille de 44 à
 * 64 px. Passé par le loader, il sort au palier 128 de Cloudflare Transformations.
 *
 * Ce qui est éprouvé : l'image rendue porte un `sizes` et une source qui N'EST PAS l'original —
 * sous vitest, le loader par défaut de Next (`/_next/image?url=…`) tient lieu du `loaderFile`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ProfileCard, type LibellesDeCarte } from '@/components/public/index/ProfileCard';
import type { ProfilPublic } from '@/lib/queries/public-profiles';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { AdminAgency, AdminAgencyDetail } from '@/types/super-admin';
import { AgencyDetailHeader } from '../agency-detail';
import { AgencyModerationCard } from '../AgencyModerationCard';

const LOGO = 'https://media.takussan.com/12/logo.png?v=1700000000';

function rendre(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{avecGestes(ui)}</QueryClientProvider>));
}

function imagesDuLogo(container: HTMLElement): HTMLImageElement[] {
  return Array.from(container.querySelectorAll('img')).filter((img) =>
    (img.getAttribute('src') ?? '').includes(encodeURIComponent('/12/logo.png')) || img.getAttribute('src') === LOGO,
  );
}

function attendLeLoader(container: HTMLElement, sizes: string) {
  const images = imagesDuLogo(container);
  expect(images).toHaveLength(1);
  expect(images[0].getAttribute('src')).not.toBe(LOGO);
  expect(images[0].getAttribute('sizes')).toBe(sizes);
}

const LIBELLES: LibellesDeCarte = {
  portefeuille: (n) => `${n} biens`,
  aLouer: (n) => `${n} à louer`,
  aVendre: (n) => `${n} à vendre`,
  avis: (n) => `${n} avis`,
  verifie: 'Vérifiée',
  noteAria: (note) => `Note ${note}`,
  roles: { agent: 'Agent', owner: 'Propriétaire' },
};

function profil(logo_url: string | null): ProfilPublic {
  return {
    id: 12,
    slug: 'dakar-immo',
    nom: 'Dakar Immo',
    logo_url,
    is_verified: true,
    city: 'Dakar',
    cities: ['Dakar'],
    portfolio_count: 3,
    rent_count: 2,
    sale_count: 1,
    reviews: { average: null, count: 0 },
  };
}

const AGENCE = {
  id: 12,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
  status: 'active',
  is_verified: true,
  verified_at: '2026-05-01T10:00:00+00:00',
  primary_admin_id: 4,
  license_number: 'LIC-221',
  email: 'contact@dakar.test',
  phone: '+221770000000',
  logo_url: LOGO,
  properties_count: 18,
  members_count: 7,
  created_at: '2026-01-15T10:00:00+00:00',
  last_activity_at: '2026-05-08T12:00:00+00:00',
  public_url: '/agencies/dakar-immo',
};

describe('TCK-1814 — le logo d’agence passe par le loader de next/image', () => {
  it('annuaire public : la pastille de 56 px', () => {
    const { container } = rendre(<ProfileCard profil={profil(LOGO)} base="/agencies" libelles={LIBELLES} forme="carre" />);
    attendLeLoader(container, '56px');
  });

  it('annuaire public : sans logo, les initiales', () => {
    const { container, getByText } = rendre(
      <ProfileCard profil={profil(null)} base="/agencies" libelles={LIBELLES} forme="carre" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(getByText('DI')).toBeInTheDocument();
  });

  it('console super-admin : l’en-tête de la fiche d’agence (64 px)', () => {
    const { container } = rendre(<AgencyDetailHeader agency={AGENCE as unknown as AdminAgencyDetail} />);
    attendLeLoader(container, '64px');
  });

  it('console super-admin : la carte de modération (44 px)', () => {
    const { container } = rendre(<AgencyModerationCard agency={AGENCE as AdminAgency} />);
    attendLeLoader(container, '44px');
  });
});
