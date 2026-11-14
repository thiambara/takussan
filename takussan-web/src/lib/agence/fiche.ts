/**
 * TCK-2670 — la fiche de l'agence en sections : ce qui part à l'enregistrement, ce que compte la
 * barre « N modifications », la section où tombe une erreur 422, et la complétude du sommaire.
 *
 * Un seul formulaire pour toutes les sections, un seul `PATCH /api/agencies/{id}` : son corps ne
 * porte QUE les clés modifiées — d'une ou de plusieurs sections. La comparaison se fait sur les
 * valeurs NORMALISÉES des deux côtés (`normaliseAgencyForm`, `chargeUtileVitrine`) : un espace en
 * trop ou une casse d'e-mail ne compte pas pour une modification, et la référence « inchangé » est
 * la dernière réponse enregistrée, jamais la saisie d'avant.
 *
 * Aucune complétude n'existe côté API : elle se calcule ici, sur la liste FERMÉE du ticket. Ce
 * module ne porte que des fonctions pures ; les composants n'ont ni règle ni calcul à eux.
 */

import { z } from 'zod';

import type { Agency } from '@/types/agency';
import type { KycDossier } from '@/types/super-admin';
import { etatEcheance } from '@/lib/kyc-echeance';
import {
  agencyFormSchema,
  normaliseAgencyForm,
  reglagesDeLaFiche,
  type AgencyFormContext,
  type AgencyFormPayload,
} from '@/lib/schemas/agency';
import { NB_POINTS, chargeUtileVitrine } from '@/lib/vitrine-agence';

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Les sections
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * L'ordre du sommaire. `verification` et `offre` sont des liens vers leurs pages (TCK-2671) : ils
 * n'ont aucun champ dans ce formulaire.
 */
export const SECTIONS_DE_LA_FICHE = [
  'identite',
  'publique',
  'paiement',
  'facturation',
  'verification',
  'regles',
  'menu',
  'offre',
] as const;

export type SectionDeLaFiche = (typeof SECTIONS_DE_LA_FICHE)[number];

export function estSectionDeLaFiche(valeur: unknown): valeur is SectionDeLaFiche {
  return typeof valeur === 'string' && (SECTIONS_DE_LA_FICHE as readonly string[]).includes(valeur);
}

/** Ce que la fiche sait du lecteur et de l'agence, et qui décide des sections montrées. */
export interface ContexteDesSections {
  /** Agence `individual` : ni équipe, donc ni menu de l'équipe. */
  readonly individuelle: boolean;
  /** `peutEcrireLaVitrine` : la fiche publique ne se propose qu'à qui peut l'écrire. */
  readonly vitrine: boolean;
}

export function sectionsMontrees(contexte: ContexteDesSections): SectionDeLaFiche[] {
  return SECTIONS_DE_LA_FICHE.filter((s) => {
    if (s === 'publique') return contexte.vitrine;
    if (s === 'menu') return !contexte.individuelle;
    return true;
  });
}

/**
 * La section de chaque clé du corps envoyé (et donc de chaque erreur 422). Les clés de `settings`
 * y sont nommées sans leur préfixe.
 */
const SECTION_DE_LA_CLE: Readonly<Record<string, SectionDeLaFiche>> = {
  name: 'identite',
  slug: 'identite',
  license_number: 'identite',
  description: 'identite',
  email: 'identite',
  phone: 'identite',
  website: 'identite',
  logo: 'identite',
  tagline: 'publique',
  highlights: 'publique',
  showcase_property_ids: 'publique',
  offline_payment_wave_number: 'paiement',
  offline_payment_orange_money_number: 'paiement',
  offline_payment_bank_details: 'paiement',
  default_tax_rate: 'facturation',
  commission_rate: 'facturation',
  currency: 'facturation',
  legal_name: 'facturation',
  ninea: 'facturation',
  rccm: 'facturation',
  legal_address: 'facturation',
  moderation_required: 'regles',
  late_fee_online_collection: 'regles',
  payout_approval_threshold: 'regles',
  require_team_two_factor: 'regles',
  hidden_modules: 'menu',
};

/**
 * La section d'une clé d'erreur de l'API (`settings.offline_payment_wave_number`, `highlights.1`,
 * `showcase_property_ids.3`, `name`…), ou `null` si elle ne vise aucun champ de la fiche — l'erreur
 * reste alors dans le bandeau.
 */
export function sectionDeLaCle(cle: string): SectionDeLaFiche | null {
  const sansReglage = cle.startsWith('settings.') ? cle.slice('settings.'.length) : cle;
  const racine = sansReglage.split('.')[0] ?? '';
  return SECTION_DE_LA_CLE[racine] ?? null;
}

/** Les sections que visent les erreurs d'un 422 (pour leur point d'alerte), dans l'ordre du sommaire. */
export function sectionsEnErreur(errors: Readonly<Record<string, unknown>> | undefined | null): SectionDeLaFiche[] {
  const visees = new Set<SectionDeLaFiche>();
  for (const cle of Object.keys(errors ?? {})) {
    const section = sectionDeLaCle(cle);
    if (section !== null) visees.add(section);
  }
  return SECTIONS_DE_LA_FICHE.filter((s) => visees.has(s));
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Le formulaire unique
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Le schéma de toute la fiche : celui de la configuration (TCK-064 et suivants) plus la vitrine
 * (TCK-2524), aux mêmes bornes que `AgencyUpdateRequest`.
 */
export const ficheDeLAgenceSchema = agencyFormSchema.extend({
  // Les bornes (120, 80, six biens) se tiennent à la saisie (`maxLength`, refus du septième) et se
  // jugent à l'API (422 reposé sur son champ) — comme dans la carte de la vitrine (TCK-2524).
  tagline: z.string(),
  highlights: z.array(z.string()),
  showcase_property_ids: z.array(z.number()),
});

export type ValeursDeLaFiche = z.infer<typeof ficheDeLAgenceSchema>;

/** Le corps du `PATCH` : les clés de la configuration et celles de la vitrine, toutes facultatives. */
export type CorpsDeLaFiche = Partial<AgencyFormPayload> & {
  tagline?: string | null;
  highlights?: string[] | null;
  showcase_property_ids?: number[] | null;
};

function egal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Ce qui part, et de quoi reposer un 422 `highlights.k` sur la bonne ligne (`chargeUtileVitrine`). */
export interface EnvoiDeLaFiche {
  readonly corps: CorpsDeLaFiche;
  /** Le k-ième point envoyé est la ligne `indexDesPoints[k]` de l'écran. */
  readonly indexDesPoints: readonly number[];
}

/** Le contexte de `normaliseAgencyForm`, tiré de l'agence ENREGISTRÉE — et d'elle seule. */
export function contexteDeLAgence(enregistree: Agency): AgencyFormContext {
  return {
    individual: enregistree.kind === 'individual',
    initialThreshold: seuilInitial(enregistree),
    slugEditable: enregistree.slug_editable === true,
    initialSlug: enregistree.slug,
    initialSettings: enregistree.settings,
  };
}

/**
 * Le corps de l'enregistrement : les seules clés dont la valeur normalisée diffère de celle de
 * l'agence ENREGISTRÉE (`enregistree`, la dernière réponse de l'API). Rien de modifié : `{}` — et
 * l'écran n'a alors rien à enregistrer.
 *
 * UNE référence : les valeurs « inchangé » du formulaire ET le contexte de `normaliseAgencyForm`
 * (réglages, seuil, slug) se tirent toutes deux de `enregistree`. Recaler l'une sans l'autre après un
 * enregistrement est le défaut de la revue de TCK-2486 (M1).
 *
 * `settings` : `normaliseAgencyForm` n'y met déjà que les clés modifiées (TCK-2486) ; il part tel
 * quel, ou pas du tout. Vitrine : `vitrine` faux (le lecteur ne peut pas l'écrire), ses clés ne
 * partent jamais.
 */
export function corpsDeLaFiche(
  valeurs: ValeursDeLaFiche,
  enregistree: Agency,
  options: { readonly vitrine: boolean },
): EnvoiDeLaFiche {
  const contexte = contexteDeLAgence(enregistree);
  const initiales = valeursDeLAgence(enregistree);
  const saisi = normaliseAgencyForm(valeurs, contexte) as unknown as Record<string, unknown>;
  const reference = normaliseAgencyForm(initiales, contexte) as unknown as Record<string, unknown>;
  const corps: Record<string, unknown> = {};

  for (const cle of Object.keys(saisi)) {
    if (cle === 'settings') continue;
    // Une clé que la référence ne porte pas (le seuil, le slug : posés seulement s'ils changent) part
    // toujours — `null` compris : le seuil vidé n'est pas « égal » au seuil absent, il le coupe.
    if (!(cle in reference) || !egal(saisi[cle], reference[cle])) corps[cle] = saisi[cle];
  }
  const reglages = saisi.settings as Record<string, unknown> | undefined;
  if (reglages !== undefined && Object.keys(reglages).length > 0) corps.settings = reglages;

  let indexDesPoints: readonly number[] = [];
  if (options.vitrine) {
    const vitrineSaisie = chargeUtileVitrine({
      accroche: valeurs.tagline,
      points: valeurs.highlights,
      selection: valeurs.showcase_property_ids,
    });
    indexDesPoints = vitrineSaisie.indexDesPoints;
    const vitrineInitiale = chargeUtileVitrine({
      accroche: initiales.tagline,
      points: initiales.highlights,
      selection: initiales.showcase_property_ids,
    }).payload;
    for (const cle of ['tagline', 'highlights', 'showcase_property_ids'] as const) {
      if (!egal(vitrineSaisie.payload[cle], vitrineInitiale[cle])) corps[cle] = vitrineSaisie.payload[cle];
    }
  }
  return { corps: corps as CorpsDeLaFiche, indexDesPoints };
}

/**
 * La nouvelle référence après un enregistrement : la réponse fusionnée sur l'ancienne — une clé que la
 * réponse ne porte pas (le seuil, absent pour qui ne tient pas `payouts.approve`) garde sa valeur.
 */
export function referenceApresEnregistrement(precedente: Agency, reponse: Partial<Agency> | null | undefined): Agency {
  return { ...precedente, ...(reponse ?? {}) };
}

/**
 * Le 422 `highlights.k` reposé sur la LIGNE d'écran : `highlights.<indexDesPoints[k]>` — sans quoi une
 * ligne vide au milieu ferait tomber l'erreur sur la ligne d'en dessous. Les clés `settings.<clé>` du
 * paiement hors ligne perdent leur préfixe (`erreursDesReglagesSurLeurChamp`, TCK-2536) ; les autres
 * passent telles quelles.
 */
export function erreursSurLeurChamp(
  errors: Readonly<Record<string, string[]>> | undefined,
  indexDesPoints: readonly number[],
): Record<string, string[]> | undefined {
  if (errors === undefined) return undefined;
  const sorties: Record<string, string[]> = {};
  for (const [cle, messages] of Object.entries(errors)) {
    const point = /^highlights\.(\d+)$/.exec(cle);
    let champ = cle;
    if (point) {
      const ligne = indexDesPoints[Number(point[1])];
      champ = ligne === undefined ? 'highlights' : `highlights.${ligne}`;
    } else if (cle.startsWith('settings.')) {
      const reglage = cle.slice('settings.'.length);
      if (SECTION_DE_LA_CLE[reglage] === 'paiement') champ = reglage;
    } else if (cle.startsWith('showcase_property_ids.')) champ = 'showcase_property_ids';
    sorties[champ] = [...(sorties[champ] ?? []), ...messages];
  }
  return sorties;
}

/**
 * Les modifications que compte la barre : une par clé du corps, une par clé de `settings`. Modifier
 * l'accroche puis le numéro Wave en fait deux (AC1).
 */
export function clesModifiees(corps: CorpsDeLaFiche): string[] {
  const cles: string[] = [];
  for (const [cle, valeur] of Object.entries(corps)) {
    if (cle === 'settings') {
      for (const reglage of Object.keys((valeur as Record<string, unknown>) ?? {})) cles.push(`settings.${reglage}`);
    } else cles.push(cle);
  }
  return cles;
}

/**
 * Les CHAMPS du formulaire que touche le corps : une clé de `settings` est le champ du même nom.
 * C'est ce que l'écran marque « modifié ».
 */
export function champsModifies(corps: CorpsDeLaFiche): Set<string> {
  return new Set(clesModifiees(corps).map((c) => (c.startsWith('settings.') ? c.slice('settings.'.length) : c)));
}

/**
 * Une nouvelle agence enregistrée arrive sans que l'admin l'ait envoyée (le logo déposé, puis
 * `router.refresh()`) : la saisie suit la nouvelle référence, SAUF les champs que l'admin a modifiés,
 * qui gardent sa saisie. Recaler la seule référence laisserait les champs non touchés sur l'ancienne
 * valeur — que l'envoi suivant jugerait modifiée et renverrait.
 */
export function rebaserLaSaisie(
  valeurs: ValeursDeLaFiche,
  ancienne: Agency,
  nouvelle: Agency,
  options: { readonly vitrine: boolean },
): ValeursDeLaFiche {
  const modifies = champsModifies(corpsDeLaFiche(valeurs, ancienne, options).corps);
  const suivantes = valeursDeLAgence(nouvelle) as Record<string, unknown>;
  for (const champ of modifies) {
    if (champ in valeurs) suivantes[champ] = (valeurs as Record<string, unknown>)[champ];
  }
  return suivantes as ValeursDeLaFiche;
}

/** Les sections que touche le corps, dans l'ordre du sommaire. */
export function sectionsModifiees(corps: CorpsDeLaFiche): SectionDeLaFiche[] {
  return sectionsEnErreur(Object.fromEntries(clesModifiees(corps).map((c) => [c, true])));
}

/**
 * Les valeurs du formulaire lues d'une agence — au chargement, et après chaque enregistrement (la
 * réponse devient la nouvelle référence « inchangé »).
 */
export function valeursDeLAgence(agence: Agency): ValeursDeLaFiche {
  const points = [...(agence.highlights ?? [])].slice(0, NB_POINTS);
  while (points.length < NB_POINTS) points.push('');
  const nombre = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return {
    name: agence.name ?? '',
    slug: agence.slug ?? '',
    license_number: agence.license_number ?? '',
    description: agence.description ?? '',
    email: agence.email ?? '',
    phone: agence.phone ?? '',
    website: agence.website ?? '',
    // TCK-962 — la commission et la devise se lisent sur leurs colonnes.
    commission_rate: nombre(agence.commission_rate),
    currency: (agence.currency ?? '').toUpperCase(),
    moderation_required: agence.moderation_required ?? false,
    // TCK-2486 — la même lecture que la référence « inchangé » de l'envoi (`initialSettings`).
    ...reglagesDeLaFiche(agence.settings),
    default_tax_rate: nombre(agence.default_tax_rate),
    payout_approval_threshold: seuilInitial(agence),
    legal_name: agence.legal_name ?? '',
    ninea: agence.ninea ?? '',
    rccm: agence.rccm ?? '',
    legal_address: agence.legal_address ?? '',
    tagline: agence.tagline ?? '',
    highlights: points,
    showcase_property_ids: [...(agence.showcase_property_ids ?? [])],
  };
}

/** TCK-594 — le seuil tel que l'écran le montre, et la référence de « modifié » de l'envoi. */
export function seuilInitial(agence: Pick<Agency, 'payout_approval_threshold'>): string {
  return agence.payout_approval_threshold != null ? String(Math.round(agence.payout_approval_threshold)) : '';
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * « Reprendre ces deux numéros »
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export interface NumerosDuDossier {
  readonly ninea: string | null;
  readonly rccm: string | null;
}

/**
 * Les numéros que portent les pièces du dossier de vérification (`document_number`, TCK-2669) : la
 * pièce la plus récente (id le plus grand) de chaque type qui en porte un.
 */
export function numerosDuDossier(dossier: Pick<KycDossier, 'documents'> | null | undefined): NumerosDuDossier {
  const lire = (type: 'ninea' | 'rccm') => {
    const pieces = (dossier?.documents ?? [])
      .filter((d) => d.document_type === type && typeof d.document_number === 'string' && d.document_number.trim() !== '')
      .sort((a, b) => b.id - a.id);
    return pieces[0]?.document_number?.trim() ?? null;
  };
  return { ninea: lire('ninea'), rccm: lire('rccm') };
}

/**
 * Ce que « Reprendre ces deux numéros » remplirait : chaque mention VIDE que le dossier porte. Vide
 * (`{}`), le bouton ne se montre pas. Une mention déjà saisie n'est jamais écrasée.
 */
export function repriseDesNumeros(
  valeurs: Pick<ValeursDeLaFiche, 'ninea' | 'rccm'>,
  numeros: NumerosDuDossier,
): Partial<Record<'ninea' | 'rccm', string>> {
  const reprise: Partial<Record<'ninea' | 'rccm', string>> = {};
  if (valeurs.ninea.trim() === '' && numeros.ninea) reprise.ninea = numeros.ninea;
  if (valeurs.rccm.trim() === '' && numeros.rccm) reprise.rccm = numeros.rccm;
  return reprise;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * La complétude — liste fermée
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Les éléments comptés, dans l'ORDRE DE LEUR IMPACT (celui de la liste « à remplir ») : ce que lit
 * le locataire sur son lien de paiement, puis ce qui s'imprime sur les factures, puis la
 * vérification, puis la fiche publique, puis l'identité.
 */
export const ELEMENTS_DE_LA_COMPLETUDE = [
  'paiement_hors_ligne',
  'raison_sociale',
  'ninea',
  'rccm',
  'adresse_du_siege',
  'verification',
  'accroche',
  'pourquoi_nous',
  'vitrine',
  'logo',
  'telephone',
  'email',
] as const;

export type ElementDeLaCompletude = (typeof ELEMENTS_DE_LA_COMPLETUDE)[number];

/** Les quatre mentions légales — absentes d'une agence `individual` (l'API les refuse). */
const MENTIONS_LEGALES: ReadonlySet<ElementDeLaCompletude> = new Set(['raison_sociale', 'ninea', 'rccm', 'adresse_du_siege']);

/** La section de chaque élément, et le champ que son lien ouvre (`null` : la section seule). */
export const OU_SE_REMPLIT: Readonly<Record<ElementDeLaCompletude, { section: SectionDeLaFiche; champ: string | null }>> = {
  paiement_hors_ligne: { section: 'paiement', champ: 'offline_payment_wave_number' },
  raison_sociale: { section: 'facturation', champ: 'legal_name' },
  ninea: { section: 'facturation', champ: 'ninea' },
  rccm: { section: 'facturation', champ: 'rccm' },
  adresse_du_siege: { section: 'facturation', champ: 'legal_address' },
  verification: { section: 'verification', champ: null },
  accroche: { section: 'publique', champ: 'tagline' },
  pourquoi_nous: { section: 'publique', champ: 'highlights.0' },
  vitrine: { section: 'publique', champ: 'showcase_property_ids' },
  logo: { section: 'identite', champ: 'logo' },
  telephone: { section: 'identite', champ: 'phone' },
  email: { section: 'identite', champ: 'email' },
};

/**
 * La vérification est « à jour » quand le dossier est vérifié ET qu'aucune échéance — celle du
 * dossier, celle d'une pièce — n'est passée. `agency.is_verified` n'en dit rien : il peut rester
 * vrai sur un dossier repassé en attente.
 */
export function verificationAJour(
  dossier: Pick<KycDossier, 'status' | 'expires_at' | 'documents'> | null | undefined,
  maintenant: Date = new Date(),
): boolean {
  if (!dossier || dossier.status !== 'verified') return false;
  if (etatEcheance(dossier.expires_at ?? null, maintenant) === 'expired') return false;
  return !(dossier.documents ?? []).some((d) => etatEcheance(d.document_expires_at ?? null, maintenant) === 'expired');
}

function rempli(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

export interface Completude {
  /** Les éléments comptés pour cette agence, dans l'ordre d'impact. */
  readonly elements: readonly ElementDeLaCompletude[];
  readonly presents: readonly ElementDeLaCompletude[];
  /** Les manquants, dans l'ordre d'impact. */
  readonly manquants: readonly ElementDeLaCompletude[];
  /** Présents sur total, arrondi à l'entier. */
  readonly pourcentage: number;
}

/**
 * La complétude de la fiche ENREGISTRÉE (ce que voient le locataire, la facture, la fiche
 * publique) — pas de la saisie en cours.
 *
 * `verification` : `verificationAJour(dossier)`, ou `null` quand le dossier n'a pas pu être lu (refus,
 * panne) — l'élément est alors HORS du compte, au numérateur comme au dénominateur : le compter
 * manquant dirait « à faire » d'une vérification peut-être à jour.
 */
export function completudeDeLaFiche(agence: Agency, verification: boolean | null): Completude {
  const individuelle = agence.kind === 'individual';
  const settings = (agence.settings ?? {}) as Record<string, unknown>;
  const texte = (v: unknown) => (typeof v === 'string' ? v : null);
  const present: Record<ElementDeLaCompletude, boolean> = {
    paiement_hors_ligne:
      rempli(texte(settings.offline_payment_wave_number)) ||
      rempli(texte(settings.offline_payment_orange_money_number)) ||
      rempli(texte(settings.offline_payment_bank_details)),
    raison_sociale: rempli(agence.legal_name),
    ninea: rempli(agence.ninea),
    rccm: rempli(agence.rccm),
    adresse_du_siege: rempli(agence.legal_address),
    verification: verification === true,
    accroche: rempli(agence.tagline),
    pourquoi_nous: (agence.highlights ?? []).some((p) => rempli(p)),
    vitrine: (agence.showcase_property_ids ?? []).length > 0,
    logo: rempli(agence.logo_url),
    telephone: rempli(agence.phone),
    email: rempli(agence.email),
  };
  const elements = ELEMENTS_DE_LA_COMPLETUDE.filter(
    (e) => !(individuelle && MENTIONS_LEGALES.has(e)) && !(e === 'verification' && verification === null),
  );
  const presents = elements.filter((e) => present[e]);
  const manquants = elements.filter((e) => !present[e]);
  return {
    elements,
    presents,
    manquants,
    pourcentage: Math.round((presents.length / elements.length) * 100),
  };
}

/**
 * La liste « à remplir » telle qu'elle s'affiche : NINEA et RCCM manquants tous deux font UNE
 * entrée (« NINEA et RCCM », une seule reprise du dossier). Le compte « N éléments à remplir »,
 * lui, reste celui de `manquants`.
 */
export type EntreeAManquer = ElementDeLaCompletude | 'ninea_et_rccm';

export function entreesARemplir(manquants: readonly ElementDeLaCompletude[]): EntreeAManquer[] {
  const deux = manquants.includes('ninea') && manquants.includes('rccm');
  const entrees: EntreeAManquer[] = [];
  for (const e of manquants) {
    if (deux && e === 'rccm') continue;
    entrees.push(deux && e === 'ninea' ? 'ninea_et_rccm' : e);
  }
  return entrees;
}

export function ouSeRemplitLEntree(entree: EntreeAManquer): { section: SectionDeLaFiche; champ: string | null } {
  return entree === 'ninea_et_rccm' ? OU_SE_REMPLIT.ninea : OU_SE_REMPLIT[entree];
}

export type EtatDeSection = 'ok' | 'incomplet' | 'alerte';

/**
 * Le point d'une section : `alerte` si un 422 la vise (ou, pour la vérification, si elle n'est pas
 * à jour alors qu'un dossier a été vérifié ou refusé), `incomplet` si un élément de la complétude y
 * manque, `ok` sinon.
 */
export function etatDesSections(
  completude: Completude,
  enErreur: readonly SectionDeLaFiche[],
  dossier?: Pick<KycDossier, 'status'> | null,
): Record<SectionDeLaFiche, EtatDeSection> {
  const etats = Object.fromEntries(SECTIONS_DE_LA_FICHE.map((s) => [s, 'ok'])) as Record<SectionDeLaFiche, EtatDeSection>;
  for (const manquant of completude.manquants) etats[OU_SE_REMPLIT[manquant].section] = 'incomplet';
  if (completude.manquants.includes('verification') && (dossier?.status === 'rejected' || dossier?.status === 'verified')) {
    etats.verification = 'alerte';
  }
  for (const s of enErreur) etats[s] = 'alerte';
  return etats;
}

/** Le lien d'une section, et d'un champ dans sa section : `?section=paiement#champ-…`. */
export function lienDeSection(section: SectionDeLaFiche, champ?: string | null): string {
  return `?section=${section}${champ ? `#${idDuChamp(champ)}` : ''}`;
}

/**
 * L'id DOM d'un champ de la fiche — celui que visent les liens de la jauge. C'est l'id par défaut de
 * `FormInput` / `FormTextarea` (`field-<nom>`) : le champ n'a rien à déclarer.
 */
export function idDuChamp(champ: string): string {
  return `field-${champ}`;
}
