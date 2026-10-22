import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getMeAction } from '@/app/actions/auth';
import { ApiError, apiRequest } from '@/lib/api';
import { ROUTE_VERIF_INDISPONIBLE, resolveAgencyOrNull } from '@/lib/access/server-guards';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { getActiveProfileId, getToken } from '@/lib/session';
import type { User } from '@/types/user';
import type { LectureDesCapacites } from './capacites-amorcees';

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
 * seulement quand la page en exige une — ou, pour un profil sans rôle d'administration rattaché à
 * une agence, toujours : ce sont elles qui lui ouvrent une page (TCK-1412).
 */

/** L'étiquette de ce module dans les journaux `[access]`. */
const OU = 'pages-admin';

/**
 * `GET /api/me/capabilities`, une fois par rendu.
 *
 * Trois issues, comme `resolveAgencyOrNull` : 401/403/404 sont une RÉPONSE (aucune capacité), une
 * autre panne n'en est pas une (`null` : « je ne sais pas »). `fetchMyCapabilities`, retiré par
 * TCK-1376,
 * (`lib/queries/dashboard.ts`) ne convient pas ici : il avale tout en `[]` — une panne passerait pour
 * un refus — et n'envoie pas le hint de profil.
 */
const capacitesDuRendu = cache(
  async (
    token: string,
    activeProfileId?: string,
  ): Promise<{ readonly capacites: readonly string[]; readonly lecture: LectureDesCapacites | null } | null> => {
    try {
      const reponse = await apiRequest<{ data: { agency_id?: number | null; capabilities?: readonly string[] } }>(
        '/api/me/capabilities',
        { token, activeProfileId },
      );
      const capacites = reponse.data.capabilities ?? [];
      // TCK-1278 (P136.02) — la réponse entière, et son heure, pour amorcer le cache du navigateur.
      return {
        capacites,
        lecture: { reponse: { agency_id: reponse.data.agency_id ?? null, capabilities: capacites }, lueA: Date.now() },
      };
    } catch (e: unknown) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
        return { capacites: [], lecture: null };
      }
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
  // Le super-admin passe tout : aucune lecture.
  if (isSuperAdmin(roles)) return { roles, agence: null, capacites: [] };
  // TCK-1412 (P148.01, P148.02) — un profil sans rôle d'administration ouvre les pages que ses
  // capacités ouvrent (`ouvertePar`, délégations comprises) : on les lit, mais seulement s'il est
  // rattaché à une agence. Sans agence, aucune capacité d'agence, donc aucune page.
  if (!isAdmin(roles) && typeof user.agency_id !== 'number') return { roles, agence: null, capacites: [] };

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
    capacites = token ? ((await capacitesDuRendu(token, await getActiveProfileId()))?.capacites ?? null) : [];
  }
  return { roles, agence, capacites };
}

/**
 * TCK-1278 (P136.02) — la lecture des capacités que ce rendu fait déjà pour un `agency_admin`
 * (`accesAdmin`, même promesse `cache()`ée), rendue au layout pour amorcer la clé
 * `['me','capabilities','active']` du navigateur (`AmorceCapacites`). `null` quand le rendu ne lit
 * pas les capacités (super-admin, non-admin) ou que la lecture n'a pas répondu : le navigateur lit
 * alors comme avant.
 */
export async function capacitesAmorcees(user: User): Promise<LectureDesCapacites | null> {
  if (!isAdmin(user.roles) || isSuperAdmin(user.roles)) return null;
  const token = await getToken();
  if (!token) return null;
  return (await capacitesDuRendu(token, await getActiveProfileId()))?.lecture ?? null;
}

/**
 * TCK-1376 (P138.07) — les capacités du profil actif, par la lecture de ce rendu (`capacitesDuRendu`,
 * avec l'indice de profil) : la vue agent partage ainsi la lecture que `accesAdmin` fait déjà pour
 * un `agency_admin`. `[]` sans jeton ou sur une réponse 401/403/404 ; `null` sur une panne.
 */
export async function capacitesDuProfilActif(): Promise<readonly string[] | null> {
  const token = await getToken();
  if (!token) return [];
  return (await capacitesDuRendu(token, await getActiveProfileId()))?.capacites ?? null;
}

/** Les pages d'administration accessibles au profil actif — pour PEINDRE (section d'agence du menu, liens, carte du profil). */
export async function accesAdmin(user?: User): Promise<AccesAdmin> {
  const moi = user ?? (await getMeAction());
  return accesDepuis(await contexteAdmin(moi, TOUT, 'affichage'));
}

/**
 * LA garde d'une page d'administration (`/app/agency/*`, TCK-649). Première instruction de chaque
 * page — `check-pro-routes` le vérifie.
 *
 * ⚠ Elle refuse par `redirect()` depuis la PAGE : son 307 ne tient que tant qu'aucun `loading.tsx`
 * ne couvre la page (TCK-426) — `app/__tests__/etats-de-route.test.ts` le garde.
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
    // TCK-1412 — sans rôle d'administration, ce sont les capacités qui ouvrent la page.
    capacites: page.exige.capacite !== undefined || !isAdmin(user.roles),
  };
  const ctx = await contexteAdmin(user, besoins, 'decision');
  if (pageAccessible(page, ctx)) return;
  if (besoins.capacites && ctx.capacites === null) redirect(ROUTE_VERIF_INDISPONIBLE);

  const acces = accesDepuis(await contexteAdmin(user, TOUT, 'affichage'));
  redirect(acces.chemins.find((c) => c !== chemin) ?? '/app');
}
