import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { fetchOwners } from '@/lib/queries/owners';
import { OwnersList } from '@/components/owners/OwnersList';
import { isAdmin } from '@/lib/roles';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { lireLeCarnet, parametresDuCarnet } from '@/lib/owners/carnet';
import { ouvreLaFicheDuBailleur } from '@/lib/owners/fiche-accessible';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.owners');
  return { title: t('metaTitle') };
}
export const dynamic = 'force-dynamic';

/**
 * TCK-256 — owners listing page for the agency.
 *
 * Réservé aux agences `standard` (`docs/features.md` §1.12). Pour une agence
 * `individual`, le user est le seul propriétaire par construction — pas de
 * gestion d'autres propriétaires. La page redirige donc vers `/app`.
 *
 * TCK-284 — la défense en profondeur porte bien sur l'appel que fait CETTE
 * page. Le docblock annonçait `OwnerProfilePolicy@invite` : c'était vrai de
 * l'invitation et faux de la lecture, qui est le seul appel d'ici. La lecture
 * (`GET /api/owners`) rendait 200 à un `agency_admin` d'agence `individual`
 * armé de son propre jeton. Elle rend désormais 403
 * (`OwnerProfileController::index` → `AgencyKindGuard`).
 * *Une garde citée n'est pas une garde posée.*
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { readonly searchParams?: SearchParams } = {}) {
  const user = await getMeAction();

  // TCK-426 — LES CINQ REFUS DE CETTE PAGE ONT REMONTÉ dans `owners/layout.tsx` : jeton absent,
  // rôle hors agence, absence de contexte d'agence, agence illisible, agence `individual`. Sous
  // le `loading.tsx` de ce segment, aucun des cinq ne rendait son statut — un utilisateur sans
  // le droit recevait 200 + le squelette de la route interdite, puis rebondissait côté client.
  //
  // Il ne reste ici que du NARROWING de type : le layout a déjà tranché, mais `getToken()` rend
  // `string | null` et `user.agency_id` `number | undefined`.
  const token = await getToken();
  const agencyId = user.agency_id;
  if (!token || !agencyId) return null;

  const etat = lireLeCarnet((await searchParams) ?? {});
  const admin = isAdmin(user.roles);
  const capacites = admin ? null : await capacitesDuProfilActif();

  // P152.01 — la règle de `OwnerProfilePolicy::invite` : l'admin de l'agence, ou qui tient
  // `team.invite` dans l'agence du profil actif. Une lecture en panne (`null`) ne montre rien.
  const canInvite = admin || (capacites ?? []).includes('team.invite');
  // TCK-2640 — les chiffres d'argent de la ligne suivent la règle du relevé (`payouts.create`).
  const lectureArgent = admin || (capacites ?? []).includes('payouts.create');
  // TCK-2641 (3a) — la fiche est celle de l'admin de l'agence (`OwnerProfilePolicy::viewDetail`) :
  // le super-admin sans profil d'admin dans l'agence ne l'ouvre pas non plus.
  const lienVersLaFiche = ouvreLaFicheDuBailleur(user.roles);

  // TCK-2641 (4a) — le résumé du carnet et les comptes des vues arrivent avec la page
  // (`meta.summary`) : plus de lecture `per_page=1` par vue.
  const owners = await fetchOwners(token, parametresDuCarnet(agencyId, etat, lectureArgent));

  return (
    <OwnersList
      agencyId={agencyId}
      canInvite={canInvite}
      initialData={owners}
      etat={etat}
      lienVersLaFiche={lienVersLaFiche}
      lectureArgent={lectureArgent}
    />
  );
}
