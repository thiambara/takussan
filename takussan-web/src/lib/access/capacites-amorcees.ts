/**
 * TCK-1278 (P136.02) — la lecture de `GET /api/me/capabilities` que le layout serveur de `/app` a
 * faite, passée au navigateur pour amorcer son cache. Module sans directive : le layout (serveur) et
 * `AmorceCapacites` (client) en partagent le type et la clé.
 */
export interface LectureDesCapacites {
  /** La donnée de la réponse, telle que `useMyCapabilities` la range sous `data`. */
  readonly reponse: { readonly agency_id: number | null; readonly capabilities: readonly string[] };
  /** L'heure de la lecture : une donnée plus récente du navigateur n'est jamais écrasée. */
  readonly lueA: number;
}

/** La clé de `useMyCapabilities()` sans agence explicite (`meCapabilityKeys.forAgency()`). */
export const CLE_CAPACITES_ACTIVES = ['me', 'capabilities', 'active'] as const;
