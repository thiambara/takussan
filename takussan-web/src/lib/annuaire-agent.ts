/**
 * TCK-2524 — ce que l'agent dit de lui à l'annuaire public : ses langues (liste fermée,
 * `LANGUES_DE_L_ANNUAIRE`, miroir gardé de `config/directory.php`) et ses quartiers (référentiel, cinq
 * au plus — `UpdateDirectoryAgentProfileRequest::MAX_NEIGHBORHOODS`). Écrit par
 * `PATCH /api/me/agent-profiles/{id}/directory` : `[]` vide la liste, et la fiche s'en passe.
 */

export const MAX_QUARTIERS = 5;

export interface QuartierChoisi {
  readonly id: number;
  readonly name: string;
}

/**
 * La liste que le sélecteur propose de retenir. Plus de cinq : REFUSÉE, la liste d'avant est rendue
 * (même référence) — l'appelant le sait par `===` et le dit, rien ne part.
 */
export function quartiersRetenus(
  avant: readonly QuartierChoisi[],
  proposes: readonly QuartierChoisi[],
): readonly QuartierChoisi[] {
  const uniques = [...new Map(proposes.map((q) => [q.id, q])).values()];
  return uniques.length > MAX_QUARTIERS ? avant : uniques;
}

/** Coche ou décoche une langue, dans l'ordre de la liste fermée (l'ordre de la fiche). */
export function basculerLangue(
  langues: readonly string[],
  code: string,
  ordre: readonly string[],
): string[] {
  const suivantes = langues.includes(code) ? langues.filter((c) => c !== code) : [...langues, code];
  return ordre.filter((c) => suivantes.includes(c));
}

/** Un 422 reposé sur son champ : `languages(.n)` → les langues, `neighborhood_ids(.n)` → les quartiers. */
export function erreursAnnuaireAgent(errors: Readonly<Record<string, readonly string[]>> | undefined): {
  readonly langues?: string;
  readonly quartiers?: string;
  readonly autres: string[];
} {
  let langues: string | undefined;
  let quartiers: string | undefined;
  const autres: string[] = [];
  for (const [cle, messages] of Object.entries(errors ?? {})) {
    const message = messages?.[0];
    if (!message) continue;
    if (cle === 'languages' || cle.startsWith('languages.')) langues ??= message;
    else if (cle === 'neighborhood_ids' || cle.startsWith('neighborhood_ids.')) quartiers ??= message;
    else autres.push(message);
  }
  return { langues, quartiers, autres };
}
