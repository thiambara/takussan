import type { Profile, ProfileType } from '@/types/profile';
import { profilDAgent, type FaitsDuSommaire } from './sommaire';

/** L'ordre dans lequel un profil dit ce que la personne est : le métier d'abord, l'administration ensuite. */
const PRIORITE: readonly ProfileType[] = ['agent', 'owner', 'service_provider', 'agency_admin'];

export interface IdentiteDuSommaire {
  /** « Agent · Dakar Immo » ; `null` sans profil lisible : l'identité dit alors le rôle du compte. */
  readonly fonction: string | null;
  /** Le chemin de SA fiche publique, que l'API n'émet que si la page existe ; `null` sinon. */
  readonly fiche: string | null;
}

/**
 * TCK-2635 — la ligne sous le nom, dans l'identité du sommaire (maquette `app-profil` : « Agent · Dakar
 * Immo », « Bailleur · Dakar Immo ») et le lien « Voir ma fiche publique ». Lue des profils
 * (`GET /api/me/profiles`) : un profil actif d'abord, dans l'ordre du métier ; l'agence quand le
 * profil en a une — pas l'espace personnel d'un bailleur seul (`kind: individual`), qui porte son nom. Des profils illisibles ne disent rien — jamais une supposition.
 */
export function identiteDuSommaire(
  { profils }: Pick<FaitsDuSommaire, 'profils'>,
  libelleDuType: (type: ProfileType) => string,
): IdentiteDuSommaire {
  if (!profils) return { fonction: null, fiche: null };
  const rang = (p: Profile) => PRIORITE.indexOf(p.type) + (p.status === 'active' ? 0 : PRIORITE.length);
  const profil = [...profils].filter((p) => PRIORITE.includes(p.type)).sort((a, b) => rang(a) - rang(b))[0];
  const fonction = profil
    ? [libelleDuType(profil.type), profil.agency?.kind === 'individual' ? null : profil.agency?.name]
        .filter((x): x is string => Boolean(x))
        .join(' · ')
    : null;
  const slug = profilDAgent(profils)?.public_slug;
  return { fonction, fiche: slug ? `/agents/${encodeURIComponent(slug)}` : null };
}
