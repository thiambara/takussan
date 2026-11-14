import { cache } from 'react';

import { getMeAction } from '@/app/actions/auth';
import { accesAdmin, capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { modulesMasquesDe, type CodeDeModule } from '@/lib/navigation/modules';
import type { ContexteDesRapports } from '@/lib/navigation/rapports';
import { personaDeLaCoque, profilLieDeLaCoque, typeDuProfilActif, type Persona } from '@/lib/navigation/personas';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { getActiveProfileId, getToken } from '@/lib/session';
import type { User } from '@/types/user';

export interface ContexteServeurDesRapports extends ContexteDesRapports {
  readonly user: User;
  readonly persona: Persona;
  readonly modulesMasques: readonly CodeDeModule[];
  readonly cheminsAdmin: readonly string[];
  readonly capacites: readonly string[] | null;
}

/**
 * TCK-2628 — la persona et les modules masqués de « Rapports », par LA formule de la coque
 * (`personaDeLaCoque`, avec les entrées que lui donne `app/layout.tsx` : profil lié, `espaceIndividuel`
 * d'`accesAdmin`, `kind` de l'agence lu pour l'admin seul, les modules masqués (`modulesMasquesDe`) de l'agence du profil
 * actif) : la barre d'onglets ne peut pas montrer ce que le menu ne montre pas, ni l'inverse.
 *
 * Les pages d'administration ouvertes (`accesAdmin`) et les capacités du profil actif décident
 * d'Équipe et d'Impayés (`PAGE_D_ORIGINE_DE_L_ONGLET`), en usage d'AFFICHAGE : la barre ne fait que les
 * montrer ; le layout de chaque onglet rejuge sa page d'origine en `'decision'` (`garderPageAdmin`).
 *
 * Aucune requête de plus que la coque : `getMeAction`, `accesAdmin`, les capacités et
 * `resolveAgencyOrNull` sont les promesses `cache()`ées du rendu. L'agence se lit en usage d'affichage, comme dans la coque : elle
 * ne fait que CHOISIR des onglets ; là où le `kind` garde un accès (la vue d'agence), la garde de la
 * vue relit en `'decision'`.
 */
export const lireLeContexteDesRapports = cache(async (): Promise<ContexteServeurDesRapports> => {
  const user = await getMeAction();
  let modulesMasques: CodeDeModule[] = [];
  let agencyIsStandard: boolean | undefined;
  const rattache = isAdmin(user.roles) || isAgent(user.roles) || isOwner(user.roles);
  if (rattache && typeof user.agency_id === 'number') {
    const token = await getToken();
    const agence = token ? await resolveAgencyOrNull(token, user.agency_id, 'reports (persona)') : null;
    modulesMasques = modulesMasquesDe(agence?.settings);
    if (user.roles.includes('agency_admin') && agence) agencyIsStandard = agence.kind === 'standard';
  }
  const [acces, capacites] = await Promise.all([accesAdmin(user), capacitesDuProfilActif()]);
  const persona = personaDeLaCoque({
    roles: user.roles,
    typeProfilActif: typeDuProfilActif(profilLieDeLaCoque(await getActiveProfileId(), user)),
    espaceIndividuel: acces.espaceIndividuel,
    agencyIsStandard,
  });
  return { user, persona, modulesMasques, cheminsAdmin: acces.chemins, capacites };
});
