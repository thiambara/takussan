/**
 * E.164 phone helpers — kept tiny and dependency-free.
 *
 * Strict E.164: leading "+", country code in [1-9], 7 to 15 total digits.
 * Senegalese mobiles match `^\+221[37]\d{8}$`, but this helper stays
 * country-agnostic so the same form works for the diaspora.
 *
 * The backend (`UpdateProfileRequest::rules`) enforces the same regex —
 * client validation is purely UX (live error feedback).
 */

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export function isE164(value: string): boolean {
  return E164_REGEX.test(value);
}

/**
 * Normalises a user-typed phone string by stripping spaces, parens and dashes,
 * leaving only the leading `+` and digits. Does NOT validate — pair with
 * `isE164` after normalisation if you need both.
 *
 * TCK-574 repair-1 — also drops a national trunk `0` typed right after the
 * country code (`+33 06 12 34 56 78` → `+33612345678`, `+33 (0)6…` likewise),
 * except where that 0 is a digit of the number (see `sansPrefixeNational`).
 * The free field of the profile page used to keep `+330612345678`, which the
 * API stored and « Vérifier » then sent to the SMS gateway.
 */
export function normalizePhoneInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  const compact = trimmed.replace(/[\s()\-.]/g, '');
  return compact.startsWith('+') ? sansPrefixeNational(compact) : compact;
}

// ────────────────────────────────────────────────────────────────────────────
// TCK-566 — l'INDICATIF est affiché, jamais édité
// ────────────────────────────────────────────────────────────────────────────
//
// L'assistant « Publier votre premier bien » amorçait le champ avec la VALEUR
// `+221` (l'indicatif géo). Un clic posé en tête du champ, et les chiffres
// tapés s'inséraient AVANT l'indicatif : `78|+221` à l'écran, `780143710+221`
// au récapitulatif — et c'est cette chaîne-là que le serveur enregistrait.
//
// Le remède n'est pas de déplacer le curseur : c'est de sortir l'indicatif de
// la valeur éditable. `<PhoneInput>` l'affiche en préfixe, la personne ne tape
// que la suite, et la valeur rendue au parent est composée ICI, toujours dans
// le même ordre. Un « + » (ou « 00 ») tapé en tête reste possible : c'est le
// numéro international complet de la diaspora, que l'indicatif géo ne connaît
// pas.

/** L'indicatif de la plateforme quand la géolocalisation n'en fournit aucun. */
export const INDICATIF_PAR_DEFAUT = '+221';

const INDICATIF_REGEX = /^\+[1-9]\d{0,3}$/;

/**
 * Rend un indicatif sous la forme `+XXX`, ou {@link INDICATIF_PAR_DEFAUT} si
 * l'entrée est absente ou illisible (`country_calling_code` d'ipapi arrive
 * avec ou sans `+`).
 */
export function normaliserIndicatif(brut: string | null | undefined): string {
  const chiffres = (brut ?? '').replace(/[^\d]/g, '');
  const indicatif = `+${chiffres}`;
  return INDICATIF_REGEX.test(indicatif) ? indicatif : INDICATIF_PAR_DEFAUT;
}

/**
 * Compose la valeur enregistrée à partir de ce que la personne TAPE dans le
 * champ (qui ne contient pas l'indicatif). Chaîne vide si rien n'est tapé :
 * un indicatif seul n'est pas un numéro.
 */
export function composerTelephone(saisie: string, indicatif: string): string {
  const brut = saisie.trim();
  if (brut === '') return '';

  if (brut.startsWith('+') || brut.startsWith('00')) {
    const chiffres = brut.replace(/\D/g, '').replace(/^00/, '');
    return sansPrefixeNational(`+${chiffres}`);
  }

  let chiffres = brut.replace(/\D/g, '');
  if (chiffres === '') return '';
  // +221 : un numéro national compte 9 chiffres. Douze chiffres commençant par
  // 221, c'est l'indicatif tapé sans « + » — ne pas le doubler.
  if (indicatif === '+221' && chiffres.length === 12 && chiffres.startsWith('221')) {
    chiffres = chiffres.slice(3);
  }
  const compose = sansPrefixeNational(`${indicatif}${chiffres}`);
  // `0` seul sous `+33` : le 0 retiré, il ne reste que l'indicatif — pas un numéro.
  return compose === indicatif ? '' : compose;
}

// ────────────────────────────────────────────────────────────────────────────
// TCK-574 — le « 0 » de PRÉFIXE NATIONAL ne s'écrit pas après l'indicatif
// ────────────────────────────────────────────────────────────────────────────
//
// En France, en Belgique, au Royaume-Uni, au Maroc… on compose un 0 devant le
// numéro à l'intérieur du pays (`06 12 34 56 78`), et on le retire derrière
// l'indicatif (`+33 6 12 34 56 78`). Tapé sous `+33`, il donnait
// `+330612345678` : E.164 de 12 chiffres, accepté par le champ comme par
// l'API, et pourtant aucun SMS n'y arrive.
//
// Dans quelques pays, le 0 qui suit l'indicatif FAIT PARTIE du numéro :
// l'Italie (les fixes, `+39 06 …` ; le Vatican emploie aussi `+39 06`),
// Saint-Marin (`+378 0549 …`), la Côte d'Ivoire (plan à 10 chiffres de 2021,
// `+225 07 …`), le Bénin (plan à 10 chiffres du 30 novembre 2024, `+229 01 …`),
// le Gabon (`+241 06 …`) et le Congo (`+242 06 …`). Là, on le garde.
//
// La même règle est tenue côté API (`PhoneNumber::hasNationalTrunkPrefix`) :
// les deux listes doivent bouger ensemble.

/**
 * Indicatifs à DEUX chiffres (zones 2 à 9 de l'UIT). `+1` et `+7` en ont un ;
 * tous les autres en ont trois. Les indicatifs de l'UIT forment un code
 * préfixe : cette table suffit à situer la fin de l'indicatif.
 */
const INDICATIFS_A_DEUX_CHIFFRES = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46',
  '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63',
  '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
]);

/** Pays où le 0 qui suit l'indicatif est un chiffre du numéro, pas un préfixe. */
export const INDICATIFS_A_ZERO_SIGNIFICATIF: ReadonlySet<string> = new Set([
  '+39',
  '+378',
  '+225',
  '+229',
  '+241',
  '+242',
]);

/** L'indicatif d'une valeur `+…` (`+33`, `+221`, `+1`), ou `null` s'il est incomplet. */
export function indicatifDe(valeur: string): string | null {
  const chiffres = /^\+(\d+)$/.exec(valeur)?.[1];
  if (!chiffres || chiffres.startsWith('0')) return null;
  const longueur =
    chiffres[0] === '1' || chiffres[0] === '7'
      ? 1
      : INDICATIFS_A_DEUX_CHIFFRES.has(chiffres.slice(0, 2))
        ? 2
        : 3;
  return chiffres.length >= longueur ? `+${chiffres.slice(0, longueur)}` : null;
}

/** Vrai si un 0 de préfixe national suit l'indicatif (`+330612…`). */
export function aPrefixeNational(valeur: string): boolean {
  const indicatif = indicatifDe(valeur);
  if (!indicatif || INDICATIFS_A_ZERO_SIGNIFICATIF.has(indicatif)) return false;
  return valeur.charAt(indicatif.length) === '0';
}

/** Retire UN 0 de préfixe national placé juste après l'indicatif. */
export function sansPrefixeNational(valeur: string): string {
  if (!aPrefixeNational(valeur)) return valeur;
  const indicatif = indicatifDe(valeur) as string;
  return indicatif + valeur.slice(indicatif.length + 1);
}

/**
 * Décompose une valeur enregistrée en ce que le champ doit afficher :
 * - `international: false` — l'indicatif est en préfixe, `saisie` n'en porte
 *   que la suite ;
 * - `international: true` — un autre indicatif : `saisie` est le numéro
 *   complet, `+` compris, et aucun préfixe n'est affiché.
 *
 * Reconnaît aussi la forme corrompue `<chiffres>+<indicatif>` que le défaut de
 * TCK-566 a produite et enregistrée.
 */
export function decomposerTelephone(
  valeur: string,
  indicatif: string,
): { international: boolean; saisie: string } {
  const v = valeur.replace(/[^\d+]/g, '');
  if (v === '') return { international: false, saisie: '' };
  if (v.startsWith(indicatif)) {
    return { international: false, saisie: v.slice(indicatif.length) };
  }
  const colle = /^(\d+)\+(\d+)$/.exec(v);
  if (colle && `+${colle[2]}` === indicatif) {
    return { international: false, saisie: colle[1] };
  }
  if (v.startsWith('+')) return { international: true, saisie: v };
  return { international: false, saisie: v.replace(/\+/g, '') };
}

/** Normalise une valeur enregistrée (éventuellement corrompue) en E.164. */
export function recomposerTelephone(valeur: string, indicatif: string): string {
  const { international, saisie } = decomposerTelephone(valeur, indicatif);
  return international ? sansPrefixeNational(saisie) : composerTelephone(saisie, indicatif);
}

/**
 * Un numéro auquel on peut envoyer un SMS : E.164 de 8 à 15 chiffres — la
 * forme exacte que `PhoneNumber::E164_REGEX` exige côté API avant tout envoi
 * —, exactement 9 chiffres après `+221`, et sans 0 de préfixe national derrière
 * l'indicatif (TCK-574).
 */
export function numeroComposable(valeur: string): boolean {
  if (!/^\+[1-9]\d{7,14}$/.test(valeur)) return false;
  if (aPrefixeNational(valeur)) return false;
  if (valeur.startsWith('+221')) return /^\+221\d{9}$/.test(valeur);
  return true;
}

/** Lecture humaine : `+221 78 014 37 10`. Les autres numéros sont rendus tels quels. */
export function formaterTelephone(valeur: string): string {
  const senegal = /^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(valeur);
  if (!senegal) return valeur;
  return `+221 ${senegal[1]} ${senegal[2]} ${senegal[3]} ${senegal[4]}`;
}

/**
 * TCK-566 — relit le téléphone d'un brouillon de parcours enregistré sous un
 * ancien comportement, dans la forme que les assistants écrivent aujourd'hui :
 * E.164, ou chaîne vide.
 *
 * - `+221` seul (l'indicatif que l'assistant hôte amorçait comme VALEUR) → `''` :
 *   un indicatif seul n'est pas un numéro, et c'est ce qui permet de reconnaître
 *   comme VIERGE le brouillon fantôme que l'ancien autosave a écrit ;
 * - `771234567` (forme nationale) ou `780143710+221` (forme corrompue) →
 *   `+221…`, que `numeroComposable` accepte ;
 * - `null` (le serveur enregistrait `''` en `null` avant TCK-574 ; ces brouillons
 *   restent en base) ou toute valeur non textuelle → `''`.
 *
 * - un indicatif seul AUTRE que l'indicatif courant (`+221` relu sous `+33`) →
 *   `''` aussi : l'ancien autosave amorçait avec l'indicatif géo DU JOUR de
 *   l'écriture, et un fantôme rouvert en voyage passait sinon pour un numéro
 *   international — donc pour une saisie, jamais supprimée. Le prix, assumé :
 *   un `+` suivi d'au plus quatre chiffres, tapé puis abandonné, est oublié ;
 *   aucun numéro composable n'a cette longueur ;
 *
 * Idempotente : une valeur déjà en E.164 est rendue telle quelle.
 */
export function relireTelephoneBrouillon(valeur: unknown, indicatif: string): string {
  if (typeof valeur !== 'string') return '';
  if (INDICATIF_SEUL_REGEX.test(valeur.replace(/[^\d+]/g, ''))) return '';
  return recomposerTelephone(valeur, indicatif);
}

/** Un `+` seul, ou un indicatif seul (`+221`, `+33`, `+1268`) : jamais un numéro. */
const INDICATIF_SEUL_REGEX = /^\+(?:[1-9]\d{0,3})?$/;
