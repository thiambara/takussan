import { CURRENCY_METADATA } from '@/lib/format/currency';

/**
 * TCK-2448 (ADR-0086) — l'argent du socle IA à l'écran. L'API le rend en chaînes décimales, en dollars,
 * sans nombre de décimales figé. Il ne passe jamais par `Number` : la comparaison et l'équivalent en XOF
 * se calculent sur des entiers (`BigInt`), et `Intl.NumberFormat` reçoit la chaîne, qu'il lit exactement.
 * L'arrondi n'arrive qu'ici : un montant minuscule garde ses chiffres significatifs et ne se lit pas 0.
 */

const FORME = /^\d+(\.\d+)?$/;
const CHIFFRES_SIGNIFICATIFS = 3;
/** Le plafond d'`Intl.NumberFormat` : un tarif plus long s'afficherait arrondi à ce rang. */
const DECIMALES_MAX = 100;
const ABSENT = '—';

/** Sous ce seuil, les décimales de la devise liraient 0 : on passe aux chiffres significatifs. */
const SEUIL = { USD: '0.01', XOF: '1' } as const;

type DeviseIa = keyof typeof SEUIL;

export function estMontantIa(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && FORME.test(valeur);
}

function lire(montant: string): { entier: bigint; echelle: number } {
  const [entiers, decimales = ''] = montant.split('.');
  return { entier: BigInt(entiers + decimales), echelle: decimales.length };
}

/** -1, 0 ou 1 : exact au dernier chiffre de l'un comme de l'autre. */
export function comparerMontantsIa(a: string, b: string): -1 | 0 | 1 {
  const x = lire(a);
  const y = lire(b);
  const echelle = Math.max(x.echelle, y.echelle);
  const gauche = x.entier * BigInt(10) ** BigInt(echelle - x.echelle);
  const droite = y.entier * BigInt(10) ** BigInt(echelle - y.echelle);
  if (gauche === droite) return 0;
  return gauche < droite ? -1 : 1;
}

/** Le produit exact, sans zéro inutile. */
export function multiplierMontantsIa(a: string, b: string): string {
  const x = lire(a);
  const y = lire(b);
  const echelle = x.echelle + y.echelle;
  const chiffres = (x.entier * y.entier).toString().padStart(echelle + 1, '0');
  if (echelle === 0) return chiffres;
  const entiers = chiffres.slice(0, -echelle);
  const decimales = chiffres.slice(-echelle).replace(/0+$/, '');
  return decimales === '' ? entiers : `${entiers}.${decimales}`;
}

function habiller(nombre: string, devise: DeviseIa): string {
  const { symbol, position } = CURRENCY_METADATA[devise];
  return position === 'before' ? `${symbol}${nombre}` : `${nombre} ${symbol}`;
}

function enChaine(montant: string): `${number}` {
  return montant as `${number}`;
}

/** Un coût ou un plafond : les décimales de la devise, ou 3 chiffres significatifs sous son seuil. */
export function formaterMontantIa(montant: string | null | undefined, devise: DeviseIa = 'USD'): string {
  if (!estMontantIa(montant)) return ABSENT;
  const { locale, decimalPlaces } = CURRENCY_METADATA[devise];
  const infime = comparerMontantsIa(montant, '0') !== 0 && comparerMontantsIa(montant, SEUIL[devise]) < 0;
  const options: Intl.NumberFormatOptions = infime
    ? { maximumSignificantDigits: CHIFFRES_SIGNIFICATIFS }
    : { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces };
  return habiller(new Intl.NumberFormat(locale, options).format(enChaine(montant)), devise);
}

/** Un tarif saisi : tous ses chiffres, car c'est lui qu'on relit avant de le corriger. */
export function formaterTarifIa(montant: string | null | undefined): string {
  if (!estMontantIa(montant)) return ABSENT;
  const { locale, decimalPlaces } = CURRENCY_METADATA.USD;
  return habiller(new Intl.NumberFormat(locale, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: DECIMALES_MAX }).format(enChaine(montant)), 'USD');
}

/** L'équivalent en XOF, à présenter comme approximatif ; `null` sans taux lisible. */
export function equivalentXofIa(usd: string | null | undefined, taux: string | null | undefined): string | null {
  return estMontantIa(usd) && estMontantIa(taux) ? formaterMontantIa(multiplierMontantsIa(usd, taux), 'XOF') : null;
}

/** Une saisie humaine : la virgule vaut le point. `null` si ce n'est pas un montant. */
export function lireSaisieMontantIa(saisie: string): string | null {
  const montant = saisie.trim().replace(',', '.');
  return estMontantIa(montant) ? montant : null;
}
