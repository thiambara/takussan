import { redirect } from 'next/navigation';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import type { UserRole } from '@/types/user';

/**
 * Les gardes d'accès des surfaces pro de `/app` — et pourquoi elles redirigent au lieu de refuser.
 *
 * `forbidden()` / `unauthorized()` de `next/navigation` sont derrière le drapeau
 * `experimental.authInterrupts`, que ce dépôt N'ACTIVE PAS (AC3 de TCK-167, reconduite par
 * TCK-378). Appelé sans le drapeau, `forbidden()` ne rend pas un 403 : il LÈVE `E488`, la
 * frontière `(dashboard)/error.tsx` l'attrape, et l'utilisateur non autorisé reçoit un écran de
 * panne générique avec un bouton « réessayer » qui relèvera la même erreur.
 *
 * Mesuré le 2026-08-27, par exécution du module réellement installé
 * (`node_modules/next/dist/client/components/forbidden.js`) :
 *
 *     sans le drapeau : throw E488  « `forbidden()` is experimental and only allowed… »
 *     avec le drapeau : throw E1019, digest `NEXT_HTTP_ERROR_FALLBACK;403`
 *
 * *Un refus n'est pas une panne, et les deux ne doivent pas se ressembler.* La destination du
 * refus est donc un écran qui marche : le tableau de bord de l'utilisateur.
 *
 * `scripts/check-auth-interrupts.mjs` rejoue cette propriété à chaque CI — c'est ce qui manquait
 * à TCK-167, dont l'AC a été vraie une fois puis fausse pendant quatre mois, le temps que trois
 * pages écrites après lui réintroduisent l'appel.
 */

/**
 * Refuse l'accès à qui ne tient AUCUN rôle du côté agence, au sens large :
 * `agent`, `owner` (bailleur), `agency_admin` ou `super_admin`.
 *
 * C'est la garde des surfaces que le bailleur partage avec l'agence — biens, clients, agenda,
 * pipeline. Pour celles qui excluent le bailleur, voir `assertCanReachAgencyStaffArea`.
 */
export function assertCanReachAgentArea(roles: UserRole[]): void {
  if (!(isAgent(roles) || isOwner(roles) || isAdmin(roles))) {
    redirect('/app');
  }
}

/**
 * Refuse l'accès à qui n'est pas du PERSONNEL de l'agence : `agent`, `agency_admin` ou
 * `super_admin` — le bailleur EXCLU.
 *
 * ⚠ Cette garde existe parce que le périmètre est réellement plus étroit, pas par symétrie.
 * `/app/leases/onboarding-pending` liste les checklists d'entrée en retard : c'est un écran de
 * relance interne. Factoriser les deux gardes en une seule ÉLARGIRAIT cet écran-là — TCK-378
 * l'interdit explicitement.
 *
 * ⚠ Cette phrase a déjà été fausse, et c'était la classe de faux que TCK-378 existe pour
 * supprimer. Elle invoquait « la table de vérité du menu ET CELLE DE L'API ». Mesuré par
 * exécution le 2026-08-27 : un `User` porteur d'un simple `OwnerProfile` sur l'agence obtenait
 * **200** sur `GET /api/agencies/{agency}/tenant-onboarding-pending`, et les lignes de la file
 * avec. `TenantOnboardingPendingController` a été resserré depuis (le bailleur y reçoit 403,
 * éprouvé par `test_pending_endpoint_forbids_a_plain_owner_of_the_agency`), et les deux tables
 * coïncident enfin : `agent | agency_admin | super_admin` des deux côtés.
 *
 * *Une garde de RENDU devant une API qui répond 200 ne protège rien* : le contenu part sur le
 * réseau, quel que soit l'écran. C'est l'API qui refuse ; celle-ci épargne un écran vide.
 */
export function assertCanReachAgencyStaffArea(roles: UserRole[]): void {
  if (!(isAgent(roles) || isAdmin(roles))) {
    redirect('/app');
  }
}
