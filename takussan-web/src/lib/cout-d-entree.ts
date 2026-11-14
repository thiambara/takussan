/**
 * TCK-633 — le coût d'entrée d'une location mensuelle, pour l'APERÇU du parcours de création, qui
 * l'affiche avant que le bien existe.
 *
 *     total = (loyer + charges) × mois d'avance + loyer × mois de caution + loyer × mois de frais
 *
 * ⚠ Jumelle de `CoutDEntree::pour` (API). Les deux sont jugées par la MÊME fixture,
 * `takussan-api/tests/fixtures/cout-d-entree.json` : un écart d'un franc rougit une des deux
 * suites. La fiche publiée lit le total de l'API, jamais celui-ci.
 *
 * Le calcul est fait en ENTIERS (centièmes × centièmes = dix-millièmes) : en flottants,
 * `333 333 × 1,5` vaut `499 999,49999…` sur certaines entrées, et l'arrondi « demi vers le haut »
 * tombe du mauvais côté. `BigInt(…)` et non `10000n` : la cible TypeScript est ES2017.
 */
export interface EntreeCoutDEntree {
  readonly price: number | string | null | undefined;
  readonly currency: string | null | undefined;
  readonly contract_type: string | null | undefined;
  readonly rent_period: string | null | undefined;
  readonly advance_months: number | string | null | undefined;
  readonly deposit_months: number | string | null | undefined;
  readonly agency_fee_months: number | string | null | undefined;
  readonly monthly_charges: number | string | null | undefined;
}

/** Les devises sans sous-unité : le total s'arrondit au franc (principe n°3). */
const SANS_DECIMALES = new Set(['XOF', 'XAF']);

const ZERO = BigInt(0);
const DEUX = BigInt(2);
const CENT = BigInt(100);
const DIX_MILLE = BigInt(10000);

type Valeur = number | string | null | undefined;

function vide(v: Valeur): v is null | undefined | '' {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));
}

/** « 1500.5 », 1500.5, « 0.33 » → un entier de centièmes, sans multiplier un flottant. */
function centiemes(v: Valeur): bigint {
  if (vide(v)) return ZERO;
  const texte = typeof v === 'number' ? v.toFixed(2) : String(v).trim();
  const m = /^(\d+)(?:\.(\d{1,2})\d*)?$/.exec(texte);
  if (!m) return ZERO;
  return BigInt(m[1]) * CENT + BigInt((m[2] ?? '').padEnd(2, '0'));
}

function mois(v: Valeur): bigint {
  return vide(v) ? ZERO : BigInt(Math.trunc(Number(v)) || 0);
}

/** Le total, arrondi à l'unité de la devise (la moitié vers le haut) ; `null` = aucun bloc. */
export function coutDEntreeTotal(e: EntreeCoutDEntree): number | null {
  // Une location sans période EST mensuelle (`Property::booted()`, côté API).
  if (e.contract_type !== 'rent' || (e.rent_period || 'monthly') !== 'monthly') return null;
  if ([e.advance_months, e.deposit_months, e.agency_fee_months, e.monthly_charges].every(vide)) return null;

  const loyer = centiemes(e.price);
  const charges = centiemes(e.monthly_charges);
  const frais = centiemes(e.agency_fee_months);
  const dixMilliemes = ((loyer + charges) * mois(e.advance_months) + loyer * mois(e.deposit_months)) * CENT + loyer * frais;

  const pas = SANS_DECIMALES.has(e.currency || 'XOF') ? DIX_MILLE : CENT;
  const arrondi = (DEUX * dixMilliemes + pas) / (DEUX * pas);
  return Number(arrondi * (pas / CENT)) / 100;
}

/**
 * TCK-2643 — le « Total à l'entrée » d'un bail EN COURS DE SAISIE : la formule de `coutDEntreeTotal`
 * (décision de la session du 2026-11-12 : une seule source), mais sur les valeurs du FORMULAIRE — le
 * loyer et les charges tels que l'agent les a gardés, la caution en MONTANT (elle se saisit librement,
 * un nombre de mois n'en est que le raccourci) —, l'avance et les frais d'agence venant du bien
 * (le bail n'a pas ces colonnes).
 *
 *     total = (loyer + charges) × mois d'avance + caution + loyer × mois de frais
 *
 * Chaque part est rendue pour le détail (« Loyer … + charges … + caution … »). `null` sans loyer
 * (une vente, ou un loyer pas encore saisi).
 */
export interface EntreeDuBail {
  readonly loyer: number | null | undefined;
  readonly charges: number | null | undefined;
  readonly caution: number | null | undefined;
  readonly moisDAvance: number | null | undefined;
  readonly moisDeFrais: number | null | undefined;
  readonly devise: string | null | undefined;
}

export interface TotalALEntree {
  readonly total: number;
  /** Les parts, chacune arrondie comme le total : loyer et charges × mois d'avance, caution, frais. */
  readonly loyer: number;
  readonly charges: number;
  readonly caution: number;
  readonly frais: number;
  readonly moisDAvance: number;
}

export function totalALEntreeDuBail(e: EntreeDuBail): TotalALEntree | null {
  if (vide(e.loyer) || !(Number(e.loyer) > 0)) return null;
  const pas = SANS_DECIMALES.has(e.devise || 'XOF') ? DIX_MILLE : CENT;
  // Des dix-millièmes, arrondis à l'unité de la devise (la moitié vers le haut), rendus en unités.
  const arrondir = (dixMilliemes: bigint) => Number(((DEUX * dixMilliemes + pas) / (DEUX * pas)) * (pas / CENT)) / 100;

  const avance = mois(e.moisDAvance);
  const loyer = centiemes(e.loyer) * avance * CENT;
  const charges = centiemes(e.charges) * avance * CENT;
  const caution = centiemes(e.caution) * CENT;
  const frais = centiemes(e.loyer) * centiemes(e.moisDeFrais);

  return {
    total: arrondir(loyer + charges + caution + frais),
    loyer: arrondir(loyer),
    charges: arrondir(charges),
    caution: arrondir(caution),
    frais: arrondir(frais),
    moisDAvance: Number(avance),
  };
}
