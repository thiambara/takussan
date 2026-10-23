'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import type { Profile, ProfileType } from '@/types/profile';

interface LienDansLAgenceProps {
  readonly path: string;
  readonly agencyId: number;
  readonly onOpen: () => void;
  readonly className: string;
  readonly classeSansLien: string;
  readonly children: ReactNode;
}

/**
 * Le profil à prendre dans l'agence de l'avis : l'admin d'abord, puisque ces avis mènent à la
 * section d'agence, puis l'agent, le propriétaire et le prestataire.
 */
const RANG: Record<ProfileType, number> = { agency_admin: 0, agent: 1, owner: 2, service_provider: 3 };

function profilDansLAgence(profiles: readonly Profile[], agencyId: number): Profile | undefined {
  return profiles
    .filter((p) => p.agency_id === agencyId)
    .sort((a, b) => RANG[a.type] - RANG[b.type])[0];
}

/**
 * TCK-1761 (P161.04) — le lien d'un avis émis pour une agence (`target.agency_id`). Les pages de la
 * section d'agence lisent l'agence du profil ACTIF : ouvert sous le profil d'une autre agence,
 * l'avis montrait ses données à elle, sans signe d'erreur. Le lien bascule donc d'abord sur le
 * profil de l'agence de l'avis (le changement d'espace habituel, son annonce comprise), puis ouvre
 * la page. Sans profil dans cette agence, la ligne n'est plus un lien. Tant que les profils ne
 * sont pas lus, le lien se suit tel quel.
 */
export function LienDansLAgence({ path, agencyId, onOpen, className, classeSansLien, children }: LienDansLAgenceProps) {
  const profilesQuery = useMyProfiles();
  const switchMutation = useSwitchActiveProfile();
  const router = useRouter();

  const reponse = profilesQuery.data;
  const actif = reponse?.data.find((p) => p.id === reponse.meta.active_profile_id);
  const cible = reponse ? profilDansLAgence(reponse.data, agencyId) : undefined;

  if (reponse && !cible) {
    return <div className={classeSansLien}>{children}</div>;
  }

  const basculer = cible !== undefined && actif?.agency_id !== agencyId;

  const ouvrir = (event: MouseEvent<HTMLAnchorElement>) => {
    onOpen();
    if (!basculer || !cible) return;
    event.preventDefault();
    if (switchMutation.isPending) return;
    switchMutation
      .mutateAsync(cible.id)
      .then(() => router.push(path))
      // L'échec est annoncé par la mutation elle-même ; la page de l'autre agence ne s'ouvre pas.
      .catch(() => undefined);
  };

  return (
    <Link href={path} onClick={ouvrir} className={className}>
      {children}
    </Link>
  );
}
