/**
 * TCK-2608 — l'orientation après la création du compte : ce que les portes du chercheur et du
 * professionnel calculent, sans React, pour être éprouvé seul.
 *
 * ⚠ **Une seule construction des critères** sert le compte affiché (« Voir les N biens », lu sur
 * `GET /api/public/properties`), l'alerte créée (`POST /api/saved-searches`) et la liste ouverte
 * (`/properties?…`). Trois constructions finiraient par promettre un nombre que la liste ne montre
 * pas (AC2).
 */

import type { ContractType } from '@/types/search';

/** Les tranches du budget mensuel (maquette `app-entree-orientation`, écran « Chercheur »), en F CFA. */
export const TRANCHES_DE_BUDGET = [
  { id: 'moins-150', max: 150_000 },
  { id: '150-300', min: 150_000, max: 300_000 },
  { id: '300-600', min: 300_000, max: 600_000 },
  { id: 'plus-600', min: 600_000 },
] as const satisfies ReadonlyArray<{ readonly id: string; readonly min?: number; readonly max?: number }>;

export type TrancheDeBudget = (typeof TRANCHES_DE_BUDGET)[number]['id'];

export interface ReponsesDuChercheur {
  readonly contrat: ContractType;
  readonly quartiers: readonly string[];
  readonly budget: TrancheDeBudget | null;
}

/** Sous-ensemble de `SavedSearchCriteria` (API) — et des paramètres de `/properties`. */
export interface CriteresDuChercheur {
  readonly contract_type: ContractType;
  /** Un quartier : `location`. L'API n'accepte `locations` qu'à partir de deux (TCK-2607). */
  readonly location?: string;
  readonly locations?: readonly string[];
  readonly price_min?: number;
  readonly price_max?: number;
  /** Le budget est « par mois » : une location à la nuit n'est pas dans la tranche. */
  readonly rent_period?: 'monthly';
}

/**
 * Les réponses du chercheur en critères. Quartiers et budget sont facultatifs ; à l'achat, le budget
 * mensuel ne s'applique pas (l'écran ne le montre pas).
 */
export function criteresDuChercheur({ contrat, quartiers, budget }: ReponsesDuChercheur): CriteresDuChercheur {
  const uniques = [...new Set(quartiers.map((q) => q.trim()).filter(Boolean))];
  const tranche = contrat === 'rent' && budget ? TRANCHES_DE_BUDGET.find((t) => t.id === budget) ?? null : null;
  return {
    contract_type: contrat,
    ...(uniques.length === 1 ? { location: uniques[0] } : {}),
    ...(uniques.length > 1 ? { locations: uniques } : {}),
    ...(tranche && 'min' in tranche ? { price_min: tranche.min } : {}),
    ...(tranche && 'max' in tranche ? { price_max: tranche.max } : {}),
    ...(tranche ? { rent_period: 'monthly' as const } : {}),
  };
}

/** Les paramètres de la liste (et du compte) : `locations` en liste à virgules, comme `cities`. */
export function parametresDeLaListe(criteres: CriteresDuChercheur): string {
  const p = new URLSearchParams();
  p.set('contract_type', criteres.contract_type);
  if (criteres.location) p.set('location', criteres.location);
  if (criteres.locations) p.set('locations', criteres.locations.join(','));
  if (criteres.price_min !== undefined) p.set('price_min', String(criteres.price_min));
  if (criteres.price_max !== undefined) p.set('price_max', String(criteres.price_max));
  if (criteres.rent_period) p.set('rent_period', criteres.rent_period);
  return p.toString();
}

export interface LibellesDuNom {
  readonly louer: string;
  readonly acheter: string;
  readonly partout: string;
  readonly budget: (tranche: string) => string;
}

/** La borne de l'API (`name` ≤ 100) — le titre de la cloche cite le nom. */
const NOM_MAX = 100;

/**
 * Le nom de l'alerte : « Location · Mermoz, Ngor · 150 000 – 300 000 F CFA ». Unique pour le compte
 * (`unique(user_id, name)`, 422 sinon) : un nom déjà pris reçoit « (2) », « (3) »…
 */
export function nomDeLAlerte(
  criteres: CriteresDuChercheur,
  tranche: string | null,
  libelles: LibellesDuNom,
  dejaPris: readonly string[],
): string {
  const quartiers = criteres.locations ?? (criteres.location ? [criteres.location] : []);
  const morceaux = [
    criteres.contract_type === 'rent' ? libelles.louer : libelles.acheter,
    quartiers.length > 0 ? quartiers.join(', ') : libelles.partout,
    ...(tranche && criteres.contract_type === 'rent' ? [libelles.budget(tranche)] : []),
  ];
  const base = tronquer(morceaux.join(' · '), NOM_MAX - 5);
  const pris = new Set(dejaPris);
  if (!pris.has(base)) return base;
  for (let n = 2; ; n++) {
    const nom = `${base} (${n})`;
    if (!pris.has(nom)) return nom;
  }
}

function tronquer(texte: string, max: number): string {
  return texte.length <= max ? texte : `${texte.slice(0, max - 1).trimEnd()}…`;
}

/** Les hôtes de Takussan, quel que soit l'environnement qui sert la page. */
const HOTES_TAKUSSAN = new Set(['takussan.com', 'www.takussan.com']);
/** La forme d'un jeton d'invitation (`Str::random(64)` côté API) ; large, sans autoriser autre chose. */
const FORME_DU_JETON = /^[A-Za-z0-9]{20,128}$/;

/**
 * « Je rejoins une agence » : un lien collé n'est suivi que s'il est une URL
 * `/invitations/accept?token=…` de Takussan (filtre anti-redirection). Rend le chemin RECONSTRUIT
 * — jamais le texte collé — ou `null`.
 *
 * Takussan : `takussan.com`, `www.takussan.com`, l'hôte du site configuré (`SITE_URL`, la
 * préproduction) et celui de la page (le poste de développement). Un lien sans schéma
 * (« takussan.com/invitations/… », tel que copié d'un message) est lu en https.
 */
export function lienDInvitationSuivi(colle: string, origineDuSite: string, origineDeLaPage?: string): string | null {
  const texte = colle.trim();
  if (texte === '' || texte.startsWith('//')) return null;
  const aUnSchema = /^[a-z][a-z0-9+.-]*:/i.test(texte);
  if (aUnSchema && !/^https?:\/\//i.test(texte)) return null;
  let url: URL;
  try {
    url = new URL(aUnSchema ? texte : `https://${texte}`);
  } catch {
    return null;
  }
  const hotes = new Set(HOTES_TAKUSSAN);
  for (const origine of [origineDuSite, origineDeLaPage]) {
    if (!origine) continue;
    try {
      hotes.add(new URL(origine).host);
    } catch {
      // une origine mal formée n'ajoute rien
    }
  }
  if (!hotes.has(url.host)) return null;
  if (url.pathname.replace(/\/+$/, '') !== '/invitations/accept') return null;
  const jeton = url.searchParams.get('token') ?? '';
  if (!FORME_DU_JETON.test(jeton)) return null;
  return `/invitations/accept?token=${jeton}`;
}

/** Les trois écrans de l'orientation (états d'une même page). */
export type EcranDOrientation = 'portes' | 'chercheur' | 'pro';

/**
 * L'écran à REPRENDRE quand la page est rendue à nouveau alors que la réponse est déjà écrite :
 * `null` = la page ne pose plus rien (elle mène à la destination).
 *
 * ⚠ **Pourquoi la page doit savoir reprendre.** Une server action qui pose un cookie (l'ouverture de
 * l'espace pose `active_profile_id`) fait RE-RENDRE la page courante côté serveur ; sans reprise, la
 * page — réponse écrite, profil d'agence créé — redirigeait vers `/app` pendant que l'écran du
 * professionnel menait à la demande. L'écran courant est donc dans l'URL (`?etape=`, posé sans
 * aller-retour serveur par `history.replaceState`), et vaut aussi pour un rechargement.
 *
 *  · `pro` reprend même avec un profil d'agence quand la réponse est `professional` : c'est l'espace
 *    que l'écran vient d'ouvrir. Sans profil d'agence, `pro` s'ouvre quelle que soit la réponse : c'est
 *    la porte pro du site (« Vous êtes un professionnel ? » de `/publish`, après la connexion), et la
 *    page écrit alors `professional` (`Orientation`, `ecrireProfessionnel`).
 *  · `chercheur` et `portes` (après « ← Retour ») ne reprennent jamais pour un compte qui a un
 *    profil d'agence (TCK-493 : on ne pose pas la question à un compte établi).
 *  · `publish` et `skipped` ne reprennent rien : la page les a déjà menés ailleurs.
 */
export function ecranAReprendre(
  etape: string | null | undefined,
  intention: string | null | undefined,
  aUnProfilDAgence: boolean,
): EcranDOrientation | null {
  if (etape === 'pro' && (intention === 'professional' || !aUnProfilDAgence)) return 'pro';
  if (aUnProfilDAgence) return null;
  if (etape === 'chercheur' && intention === 'search') return 'chercheur';
  if (etape === 'portes' && (intention === 'search' || intention === 'professional')) return 'portes';
  return null;
}

/**
 * L'interrupteur WhatsApp du chercheur : seulement si la capacité est ouverte
 * (`search_alerts.whatsapp_enabled`), si le compte a un numéro, ET si le canal n'est pas verrouillé pour
 * lui (numéro non vérifié, numéro sans WhatsApp) — un interrupteur qui ne peut rien écrire serait une
 * promesse. Rend le numéro à afficher, ou `null`.
 */
export function canalWhatsAppDuChercheur(
  canaux: readonly string[],
  cellules: readonly { readonly event_type: string; readonly channel: string; readonly locked: boolean }[],
  telephone: string | null | undefined,
  formater: (telephone: string) => string,
): { readonly numero: string } | null {
  if (!telephone || !canaux.includes('whatsapp')) return null;
  const cellule = cellules.find((c) => c.event_type === 'saved_search_match' && c.channel === 'whatsapp');
  if (!cellule || cellule.locked) return null;
  return { numero: formater(telephone) };
}
