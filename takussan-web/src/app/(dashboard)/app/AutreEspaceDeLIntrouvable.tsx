'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight } from 'lucide-react';

import { useContexteDuMenuDeLaCoque } from '@/components/layout/contexte-du-menu-de-la-coque';
import { SigleDEspace } from '@/components/profile/ChoixDEspace';
import { profileTypeLabel } from '@/components/profile/ProfileBadge';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { CLE_PROFILS } from '@/lib/cache-d-espace';
import { ficheDeLUrl, type TypeDeFiche } from '@/lib/navigation/fiche-de-l-url';
import { cn } from '@/lib/utils';
import { PROFILE_TYPES, type ProfileType } from '@/types/profile';

/** `GET /api/me/locate` (TCK-2847, ADR-0116) : le profil sous lequel la fiche se lit, son agence, son type. */
export interface LocalisationDeFiche {
  readonly profile_id: string;
  readonly agency: { readonly id: number; readonly name: string } | null;
  readonly role: string;
}

const estTypeDeProfil = (role: string): role is ProfileType => (PROFILE_TYPES as readonly string[]).includes(role);

/**
 * TCK-2848 — la variante « autre espace » de l'introuvable de `/app` (maquette `app-coque`, « Page
 * introuvable », approche a). La fiche demandée n'est pas lisible dans l'espace actif ; si elle l'est dans
 * un AUTRE espace du compte, l'API le nomme (`/api/me/locate`) et la page propose d'y basculer : le
 * changement de profil existant (`PATCH /api/me/active-profile`, `useSwitchActiveProfile`), puis l'URL
 * demandée rouverte EN ENTIER (le chemin ne change pas ; le rechargement est une prudence, non mesurée). Un 404 de l'API (absente, ou illisible partout), une erreur, la lecture en cours
 * ou un échec de bascule : rien, la page introuvable ordinaire.
 *
 * Hors de la coque (aucun menu à lire), rien : comme `ListeDeSecours`. La 404 de la page reste une
 * vraie 404 (TCK-2619) : ce composant n'arrive qu'à l'hydratation.
 */
export function AutreEspaceDeLIntrouvable({ className }: { readonly className?: string }) {
  const contexte = useContexteDuMenuDeLaCoque();
  const fiche = ficheDeLUrl(usePathname());
  return contexte && fiche ? <Variante type={fiche.type} id={fiche.id} className={className} /> : null;
}

function Variante({ type, id, className }: { readonly type: TypeDeFiche; readonly id: string; readonly className?: string }) {
  const t = useTranslations('dashboard.notFound.autreEspace');
  const tTypes = useTranslations('profile.types');
  const [echec, setEchec] = useState(false);
  // Le geste est lancé : la carte reste (bouton inactif) jusqu'au rechargement. Sans ce verrou, la bascule
  // OPTIMISTE (`onMutate` écrit l'espace visé comme actif) effaçait la carte au clic, et la page
  // introuvable ordinaire paraissait le temps de la requête.
  const [lancee, setLancee] = useState(false);
  // `type` vient de la liste fermée, `id` est un entier vérifié (`ficheDeLUrl`) : rien à échapper. Sous
  // `CLE_PROFILS` : la bascule l'épargne. Un 404 est la réponse ordinaire : jamais rejouée.
  const localisation = useApiQuery<{ data: LocalisationDeFiche }>(
    [...CLE_PROFILS, 'localiser', type, id],
    `/api/me/locate?type=${type}&id=${id}`,
    // Un 404 ne garde aucune donnée : sans ceci, chaque retour sur l'onglet relancerait l'appel (limité).
    { retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
  );
  const profils = useMyProfiles().data;
  const bascule = useSwitchActiveProfile();

  const trouvee = localisation.data?.data;
  const actif = profils?.data.find((p) => p.id === profils.meta.active_profile_id) ?? null;
  // La fiche se lit déjà sous le profil actif : l'introuvable a une autre cause, rien à proposer.
  if (!trouvee || echec || (!lancee && trouvee.profile_id === profils?.meta.active_profile_id)) return null;

  const role = estTypeDeProfil(trouvee.role) ? profileTypeLabel(trouvee.role, tTypes) : trouvee.role;
  const espace = trouvee.agency?.name ?? role;
  const actuel = actif?.agency?.name ?? null;

  const basculer = () => {
    if (bascule.isPending || lancee) return;
    setLancee(true);
    bascule.mutate(trouvee.profile_id, {
      // Un chargement ENTIER, par prudence (non mesuré) : le chemin ne change pas, et rien ne garantit que
      // `router.refresh()` (fait par la bascule) lève la frontière introuvable déjà rendue.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      onSuccess: () => window.location.assign(`${window.location.pathname}${window.location.search}`),
      onError: () => {
        setLancee(false);
        setEchec(true);
      },
    });
  };

  return (
    <section
      data-slot="autre-espace-de-l-introuvable"
      aria-labelledby="autre-espace-de-l-introuvable"
      className={cn('rounded-xl border border-border bg-card p-5 text-left', className)}
    >
      <div className="flex items-start gap-3">
        <SigleDEspace nom={espace} actif={false} className="size-10 rounded-xl text-sm" />
        <div className="min-w-0 flex-1">
          <h2 id="autre-espace-de-l-introuvable" className="text-corps font-semibold text-foreground">
            {t('titre', { type, espace })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('role', { role: trouvee.role })}
            {actuel ? <> {t('actuel', { espace: actuel })}</> : null}
          </p>
          <Button type="button" className="mt-4 max-md:h-12 max-md:w-full" disabled={bascule.isPending || lancee} onClick={basculer}>
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            {t('basculer', { espace })}
          </Button>
        </div>
      </div>
    </section>
  );
}
