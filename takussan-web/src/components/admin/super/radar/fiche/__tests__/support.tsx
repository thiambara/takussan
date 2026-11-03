import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { avecGestes } from '@/test/habilitations';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { RadarExtracted, RadarListingDetail, RadarMatch, RadarMatchesResponse } from '@/types/radar';
import { RadarListingFiche } from '../RadarListingFiche';

export const TEXTE = 'Appartement F3 à louer aux Almadies.\nLoyer : 350 000 FCFA par mois.\nContact via WhatsApp.';

export const EXTRACTED: RadarExtracted = {
  title: { value: 'Appartement F3', confidence: 'high', evidence: 'Appartement F3 à louer', flags: [] },
  property_type: { value: 'apartment', confidence: 'high', evidence: 'Appartement', flags: [] },
  contract: { value: 'rent', confidence: 'high', evidence: 'à louer', flags: [] },
  price: { value: 350000, confidence: 'high', evidence: 'Loyer : 350 000 FCFA', flags: [], raw: '350 000 FCFA', period: 'monthly' },
  rent_period: { value: 'monthly', confidence: 'medium', evidence: 'par mois', flags: [] },
  bedrooms: { value: 3, confidence: 'high', evidence: 'F3', flags: [] },
  neighborhood: {
    value: 'Almadies',
    confidence: 'high',
    evidence: 'aux Almadies',
    flags: [],
    neighborhood_id: null,
    suggestions: [{ id: 12, name: 'Almadies', city: 'Dakar' }],
  },
  advertiser_nature: { value: 'unknown', confidence: 'low', evidence: null, flags: [] },
  nature_signals: [],
  phones: ['+221771234567'],
  phones_dropped: ['+221761112233'],
};

export function fiche(partiel: Partial<RadarListingDetail> = {}): RadarListingDetail {
  return {
    id: 42,
    source_kind: 'text',
    source_site: 'whatsapp',
    source_url: null,
    extracted: EXTRACTED,
    stage: 'extracted',
    stage_reason: null,
    created_at: '2026-10-27T10:00:00+00:00',
    updated_at: '2026-10-27T10:05:00+00:00',
    radar_advertiser_id: null,
    raw_text: TEXTE,
    photo_urls: [],
    extracted_at: '2026-10-27T10:01:00+00:00',
    property_id: null,
    duplicate_of_listing_id: null,
    duplicate_of_property_id: null,
    photo_fingerprints: { status: 'none', total: 0, done: 0 },
    neighborhood_link: null,
    advertiser: null,
    ...partiel,
  };
}

export const BIEN_PUBLIC: RadarMatch = {
  kind: 'property',
  id: 7,
  strength: 'high',
  signals: [
    { signal: 'phone', strength: 'medium' },
    { signal: 'photo', strength: 'high', distance: 1 },
  ],
  target: {
    title: 'Villa aux Almadies',
    price: 450000,
    bedrooms: 3,
    neighborhood: 'Almadies',
    status: 'published',
    is_public: true,
    slug: 'villa-aux-almadies',
    reference_number: 'TKS-0007',
    thumbnail_url: 'https://cdn.test/bien-7.jpg',
  },
};

export const BIEN_PRIVE: RadarMatch = {
  kind: 'property',
  id: 8,
  strength: 'medium',
  signals: [{ signal: 'neighborhood_price_bedrooms', strength: 'medium', price_gap: 0.02 }],
  target: {
    title: 'Brouillon Mermoz',
    price: 350000,
    bedrooms: 3,
    neighborhood: 'Mermoz',
    status: 'draft',
    is_public: false,
    slug: 'brouillon-mermoz',
    reference_number: 'TKS-0008',
    thumbnail_url: null,
  },
};

export const ANNONCE: RadarMatch = {
  kind: 'listing',
  id: 51,
  strength: 'low',
  signals: [{ signal: 'neighborhood_price_bedrooms', strength: 'low', price_gap: 0.1 }],
  target: { title: 'F3 Almadies (autre site)', price: 360000, stage: 'extracted', source_site: 'coinafrique', thumbnail_url: null },
};

export const AUCUNE_EMPREINTE = { status: 'none', total: 0, done: 0 } as const;

export function reponseMatches(matches: RadarMatch[], photos: RadarMatchesResponse['data']['photos'] = AUCUNE_EMPREINTE): RadarMatchesResponse {
  return { data: { photos, matches } };
}

/** Un serveur d'essai : `fetchRadarListing` rend toujours l'état courant, que les réponses des gestes mettent à jour. */
export async function rendreFiche(detail: RadarListingDetail, locale: LocaleDeTest = 'fr') {
  const { fetchRadarListing } = await import('@/lib/queries/radar');
  const serveur = { courant: detail };
  vi.mocked(fetchRadarListing).mockImplementation(async () => ({ data: serveur.courant }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarListingFiche id={detail.id} />)}
    </QueryClientProvider>,
    locale,
  ));
  await screen.findByTestId('radar-fiche');
  return { serveur, user: userEvent.setup(), queryClient };
}
