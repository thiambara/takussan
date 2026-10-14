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
