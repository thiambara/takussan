import type {
  RadarAdvertiserDetail,
  RadarAdvertiserListing,
  RadarClaim,
  RadarConsent,
  RadarMessageSegment,
  RadarOutreach,
  RadarVerdict,
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
    send_blocked: null,
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

/** Un message d'accord à quatre clauses numérotées : `nombreDeClauses` en lit quatre. */
export const MESSAGE_QUATRE_CLAUSES = [
  'Bonjour Awa, je suis de Takussan.',
  '1. Vous acceptez d’être contacté.',
  '2. Vous pouvez dire STOP.',
  '3. Vos données restent chez nous.',
  '4. Vous pouvez demander leur effacement.',
].join('\n');

/** Le verdict d'un accord net : concordant, quatre clauses sur quatre, aucun écart. */
export function verdict(partiel: Partial<RadarVerdict> = {}): RadarVerdict {
  return {
    classification: 'consent',
    confidence: 'high',
    transcript: 'Moi : Bonjour\nLui : Oui d’accord',
    reply_text: 'Oui d’accord',
    counterpart_phone: '+221771234567',
    counterpart_name: 'Moussa',
    number_matches: true,
    number_checked_by: 'code',
    name_matches: true,
    clauses_found: [1, 2, 3, 4],
    clauses_complete: true,
    discordances: [],
    ...partiel,
  };
}

/** Une réponse déposée et vérifiée. */
export function reponse(partiel: Partial<RadarConsent> = {}): RadarConsent {
  return {
    id: 31,
    proof: 'screenshot',
    captures: [{ id: 1, url: 'https://media.takussan.test/capture-1.png?signature=abc', sha256: null }],
    verification_status: 'done',
    verification_reason: null,
    verdict: verdict(),
    transcript: 'Moi : Bonjour\nLui : Oui d’accord',
    confirmed_by: null,
    confirmed_at: null,
    confirmation_reason: null,
    revoked_at: null,
    created_at: '2026-10-28T11:00:00+00:00',
    ...partiel,
  };
}

/** Un message envoyé, sans issue, qui attend une réponse. */
export function messageEnvoye(partiel: Partial<RadarOutreach> = {}): RadarOutreach {
  return message({
    id: 5,
    status: 'sent',
    sent_at: '2026-10-20T10:00:00+00:00',
    wa_me_url: null,
    message: MESSAGE_QUATRE_CLAUSES,
    follow_up: { due_at: '2026-12-31T00:00:00+00:00', propose_no_answer: false },
    ...partiel,
  });
}
