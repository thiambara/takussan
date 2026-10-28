import { RADAR_FIELD_FLAGS, type RadarExtractedField, type RadarFieldFlag } from '@/types/radar';

/**
 * TCK-2387 — comment un champ lu se présente à l'opérateur.
 *
 * - `alerte` : confiance `low` ou un drapeau levé — le champ attire l'œil (bordure, avertissement, et
 *   le libellé de chaque drapeau) ;
 * - `discret` : confiance `medium` — une mention, pas d'alarme ;
 * - `rien` : confiance `high` — le champ ne dit rien de plus que sa valeur.
 *
 * Un champ CORRIGÉ (par l'opérateur, ou en cours de correction) ne s'alarme plus : sa valeur n'est
 * plus celle que le modèle a lue, la confiance qu'il y mettait ne dit plus rien d'elle.
 */
export type NiveauConfiance = 'alerte' | 'discret' | 'rien';

export interface EtatChamp {
  readonly niveau: NiveauConfiance;
  readonly drapeaux: readonly RadarFieldFlag[];
  readonly corrige: boolean;
}

const estDrapeauConnu = (drapeau: string): drapeau is RadarFieldFlag =>
  (RADAR_FIELD_FLAGS as readonly string[]).includes(drapeau);

/**
 * Un champ sans valeur n'a rien à justifier : l'API le rend en confiance `low` sans drapeau
 * (`ExtractionNormalizer::field`), et ce n'est pas une alerte — la nature `unknown` en fait partie.
 */
function aUneValeur(champ: RadarExtractedField<unknown>): boolean {
  const valeur = champ.value;
  if (valeur === null || valeur === undefined || valeur === '' || valeur === 'unknown') return false;
  return !(Array.isArray(valeur) && valeur.length === 0);
}

export function etatDuChamp(champ: RadarExtractedField<unknown> | undefined, modifie: boolean): EtatChamp {
  const corrige = modifie || champ?.corrected === true;
  if (corrige || !champ) return { niveau: 'rien', drapeaux: [], corrige };

  const drapeaux = (champ.flags ?? []).filter(estDrapeauConnu);
  // Un drapeau que ce front ne connaît pas alerte aussi : il vient de l'API, jamais masqué.
  const alerte = (champ.confidence === 'low' && aUneValeur(champ)) || (champ.flags?.length ?? 0) > 0;
  if (alerte) return { niveau: 'alerte', drapeaux, corrige };
  return { niveau: champ.confidence === 'medium' && aUneValeur(champ) ? 'discret' : 'rien', drapeaux, corrige };
}
