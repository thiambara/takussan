import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getMeAction } from '@/app/actions/auth';
import { ApiError, apiRequest } from '@/lib/api';
import { ROUTE_VERIF_INDISPONIBLE, resolveAgencyOrNull } from '@/lib/access/server-guards';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { getActiveProfileId, getToken } from '@/lib/session';
import type { User } from '@/types/user';

import {
  accesDepuis,
  pageAccessible,
  pageAdmin,
  type AccesAdmin,
  type CheminAdmin,
  type ContexteAdmin,
} from './pages-admin';

/**
 * TCK-633 (lot B) — la face SERVEUR de `PAGES_ADMIN` : construire le contexte du profil actif, et
 * en tirer la décision d'une page (`garderPageAdmin`) ou l'inventaire à peindre (`accesAdmin`).
 *
 * Coût : l'agence passe par `resolveAgencyOrNull`, donc par `agenceDuRendu`, `cache()`é par rendu —
 * le layout, la page et la carte du profil partagent UNE requête. Les capacités, de même, par
 * `capacitesDuRendu`. Elles ne sont lues que pour un `agency_admin` (le super-admin passe tout), et
 * seulement quand la page en exige une.
 */

/** L'étiquette de ce module dans les journaux `[access]`. */
const OU = 'pages-admin';

/**
 * `GET /api/me/capabilities`, une fois par rendu.
 *
 * Trois issues, comme `resolveAgencyOrNull` : 401/403/404 sont une RÉPONSE (aucune capacité), une
 * autre panne n'en est pas une (`null` : « je ne sais pas »). `fetchMyCapabilities`
 * (`lib/queries/dashboard.ts`) ne convient pas ici : il avale tout en `[]` — une panne passerait pour
 * un refus — et n'envoie pas le hint de profil.
 */
const capacitesDuRendu = cache(
  async (token: string, activeProfileId?: string): Promise<readonly string[] | null> => {
    try {
      const reponse = await apiRequest<{ data: { capabilities?: readonly string[] } }>(
        '/api/me/capabilities',
        { token, activeProfileId },
      );
      return reponse.data.capabilities ?? [];
    } catch (e: unknown) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) return [];
      // Journal serveur, jamais affiché : même forme que `resolveAgencyOrNull` (`[access] ${ou} : …`).
      console.error(`[access] ${OU} : /api/me/capabilities illisible`, e instanceof Error ? e.message : e);
      return null;
    }
  },
);

interface Besoins {
  readonly agence: boolean;
  readonly capacites: boolean;
}

const TOUT: Besoins = { agence: true, capacites: true };

async function contexteAdmin(
  user: User,
  besoins: Besoins,
  usage: 'decision' | 'affichage',
): Promise<ContexteAdmin> {
  const roles = user.roles;
  // Ni le super-admin (il passe tout) ni un non-admin (il n'a rien) n'ont besoin d'une lecture.
  if (!isAdmin(roles) || isSuperAdmin(roles)) return { roles, agence: null, capacites: [] };

  const token = await getToken();
  let agence: ContexteAdmin['agence'] = null;
  if (typeof user.agency_id === 'number') {
    // Sans besoin, `{ kind: null }` : la page en cours n'a pas d'exigence d'agence, la valeur n'est
    // pas consultée. Sans jeton, la même chose — et c'est un refus pour toute page qui l'exige.
    if (besoins.agence && token) {
      const lue = await resolveAgencyOrNull(token, user.agency_id, OU, usage);
      agence = { kind: lue?.kind ?? null };
    } else {
      agence = { kind: null };
    }
  }

  let capacites: readonly string[] | null = null;
  if (besoins.capacites) {
    capacites = token ? await capacitesDuRendu(token, await getActiveProfileId()) : [];
  }
  return { roles, agence, capacites };
}

/** Les pages `/admin/*` accessibles au profil actif — pour PEINDRE (menu, liens, carte du profil). */
export async function accesAdmin(user?: User): Promise<AccesAdmin> {
  const moi = user ?? (await getMeAction());
  return accesDepuis(await contexteAdmin(moi, TOUT, 'affichage'));
}

/**
 * LA garde d'une page `/admin/*`. Première instruction de chaque page — `check-pro-routes` le vérifie.
 *
 *  · page accessible → rien ;
 *  · capacités ILLISIBLES sur une page qui en exige une → `/verification-indisponible` ;
 *    (le `kind` illisible y va déjà, par `resolveAgencyOrNull` en usage `decision`) ;
 *  · sinon → la première page accessible, `/app` s'il n'y en a aucune.
 *
 * *Une page refusée renvoie là où l'on peut aller, pas là où l'on était.*
 */
export async function garderPageAdmin(chemin: CheminAdmin): Promise<void> {
  const page = pageAdmin(chemin);
  if (page === undefined) {
    throw new Error(`garderPageAdmin : « ${chemin} » n'est pas dans PAGES_ADMIN.`);
  }
  const user = await getMeAction();
  const besoins: Besoins = {
    agence: page.exige.agence === 'standard',
    capacites: page.exige.capacite !== undefined,
  };
  const ctx = await contexteAdmin(user, besoins, 'decision');
  if (pageAccessible(page, ctx)) return;
  if (besoins.capacites && ctx.capacites === null) redirect(ROUTE_VERIF_INDISPONIBLE);

  const acces = accesDepuis(await contexteAdmin(user, TOUT, 'affichage'));
  redirect(acces.chemins.find((c) => c !== chemin) ?? '/app');
}
