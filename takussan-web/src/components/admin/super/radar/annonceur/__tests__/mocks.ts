import type {
  RadarAdvertiserDetail,
  RadarAdvertiserListing,
  RadarClaim,
  RadarMessageSegment,
  RadarOutreach,
} from '@/types/radar';

/** Les fiches de test de la fiche annonceur (TCK-2388) : la forme exacte de `RadarAdvertiserResource::asCard`. */

export const LIEN_CONDITIONS = 'https://takussan.test/fr/legal/terms';

export const SEGMENTS: readonly RadarMessageSegment[] = [
  { kind: 'fixed', text: 'Bonjour, ' },
  { kind: 'salutation', text: 'Bonjour Awa,' },
  { kind: 'fixed', text: '\n\nJe suis de Takussan. Votre annonce : ' },
  { kind: 'resume', text: 'F3 aux Almadies, 350 000 F CFA par mois' },
  { kind: 'fixed', text: `\n\n1. Vous acceptez d’être contacté.\n2. Vous pouvez dire STOP.\nConditions : ${LIEN_CONDITIONS}` },
];

export const MESSAGE_PREPARE = SEGMENTS.map((s) => s.text).join('');

export const WA_ME = `https://wa.me/221771234567?text=${encodeURIComponent(MESSAGE_PREPARE)}`;

export function prise(partiel: Partial<RadarClaim> = {}): RadarClaim {
  return {
    by: { id: 1, name: 'Awa Diop' },
    until: '2026-10-28T10:10:00+00:00',
    mine: true,
    ...partiel,
  };
}

export function annonce(id: number, partiel: Partial<RadarAdvertiserListing> = {}): RadarAdvertiserListing {
  return {
    id,
    stage: 'reviewed',
    source_site: 'coinafrique',
    title: `Appartement ${id}`,
    price: 350000,
    property_type: 'apartment',
    contract: 'rent',
    neighborhood: 'Almadies',
    bedrooms: 3,
    covered_by_consent: false,
    created_at: '2026-10-27T10:00:00+00:00',
    ...partiel,
  };
}

export function message(partiel: Partial<RadarOutreach> = {}): RadarOutreach {
  return {
    id: 5,
    locale: 'fr',
    clauses_version: '2026-10-28',
    status: 'prepared',
    listing_ids: [12, 13],
    salutation: 'Bonjour Awa,',
    summary: 'F3 aux Almadies, 350 000 F CFA par mois',
    message: MESSAGE_PREPARE,
    segments: SEGMENTS,
    wa_me_url: WA_ME,
    follow_up_of_id: null,
    follow_up_rank: 0,
    created_by: { id: 1, name: 'Awa Diop' },
    created_at: '2026-10-28T09:00:00+00:00',
    sent_at: null,
    outcome: null,
    outcome_at: null,
    follow_up: null,
    consents: [],
    ...partiel,
  };
}

export function annonceur(partiel: Partial<RadarAdvertiserDetail> = {}): RadarAdvertiserDetail {
  return {
    id: 7,
    phone: '+221771234567',
    display_name: 'Moussa Immo',
    nature: 'probable_intermediary',
    do_not_contact_at: null,
    claim: prise(),
    nature_signals: [{ signal: 'Plusieurs biens en location', evidence: 'Nos biens disponibles' }],
    listings: [annonce(12), annonce(13), annonce(14, { stage: 'extracted', title: 'Villa 14' })],
    outreaches: [],
    ...partiel,
  };
}
