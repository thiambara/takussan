/**
 * TCK-1313 (P85.04) — un espace `individual` n'a plus de fiche d'agence (`/api/public/agencies/{slug}`
 * répond 404) : la carte de contact d'un bien de l'espace ne lie plus `/agencies/{slug}`, elle lie
 * la fiche de la personne. Une agence `standard` garde son lien.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyAgencyLite, PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';

vi.mock('@/components/contact/WhatsAppButton', () => ({ WhatsAppButton: () => null }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const CONTACT: PropertyOwnerLite = {
  id: 2,
  name: 'Awa Diop',
  slug: 'awa-diop',
  avatar_url: null,
  is_agent: false,
  member_since: null,
};

const ESPACE: PropertyAgencyLite = {
  id: 1,
  name: 'Espace de Awa',
  slug: 'espace-de-awa',
  logo_url: null,
  verified: false,
  rating: null,
  kind: 'individual',
};

function rendre(contact: PropertyOwnerLite, agency: PropertyAgencyLite) {
  render(
    withIntl(
      <PropertyAgentCard
        contact={contact}
        agency={agency}
        propertySlug="villa-a-ngor"
        propertyTitle="Villa à Ngor"
        onMessage={() => {}}
      />,
    ),
  );
}

function liens(): string[] {
  return screen.queryAllByRole('link').map((lien) => lien.getAttribute('href') ?? '');
}

describe('<PropertyAgentCard> — un espace individual ne lie pas une fiche d’agence (TCK-1313)', () => {
  it('le nom de l’espace mène à la fiche de la personne, jamais à /agencies/…', () => {
    rendre(CONTACT, ESPACE);

    expect(liens().some((href) => href.includes('/agencies/'))).toBe(false);
    expect(screen.getByRole('link', { name: ESPACE.name }).getAttribute('href')).toContain('/agents/awa-diop');
  });

  it('sans slug de contact, le nom de l’espace est écrit sans lien', () => {
    rendre({ ...CONTACT, slug: null }, ESPACE);

    expect(liens()).toEqual([]);
    expect(screen.getByText(ESPACE.name)).toBeTruthy();
  });

  it('une agence standard garde le lien de sa fiche', () => {
    rendre(CONTACT, { ...ESPACE, name: 'Agence de la Corniche', slug: 'agence-de-la-corniche', kind: 'standard' });

    expect(screen.getByRole('link', { name: 'Agence de la Corniche' }).getAttribute('href')).toContain(
      '/agencies/agence-de-la-corniche',
    );
  });
});
