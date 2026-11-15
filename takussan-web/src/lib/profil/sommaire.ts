import type { Profile } from '@/types/profile';
import type { User } from '@/types/user';
import { isAdmin, isAgent, isCustomerOnly, isOwner, isServiceProvider } from '@/lib/roles';

/**
 * TCK-2635 — le sommaire du profil (maquette `app-profil`, approche A, retenue le 2026-11-11) : une
 * rangée par section, chacune ouvre sa page ; un point sur ce qui demande une action ; « À régler » en
 * tête. Fonction PURE des faits rendus par l'API (`/api/auth/me`, `/api/me/profiles`) : ni supposition,
 * ni score inventé (le score de complétude de la fiche est hors périmètre du ticket).
 *
 * L'ordre est celui des deux sommaires de la maquette (`LIGNES_AGENT`, `LIGNES_BAILLEUR`) : ce qui est
 * propre au persona (fiche, profil professionnel, recherche, versement, annuaire) suit les coordonnées.
 * « Supprimer mon compte » n'est pas une rangée : il ferme le sommaire, en rouge (`HREF_SUPPRESSION`).
 */
export const IDS_DE_RANGEE = [
  'coordonnees',
  'fiche',
  'pro',
  'recherche',
  'versement',
  'annuaire',
  'notifications',
  'securite',
  'espaces',
  'menu',
  'langue',
  'fuseau',
  'avis',
  'donnees',
] as const;

export type IdDeRangee = (typeof IDS_DE_RANGEE)[number];

/**
 * La page de chaque section. Les adresses d'avant le ticket restent (notifications, avis, données).
 * Une entrée par ligne, `href` compris : `routes-atteignables.test.ts` (TCK-379) compte un lien là où la
 * route et un producteur de lien tiennent sur la même ligne.
 */
export const HREF_DE_LA_RANGEE: Readonly<Record<IdDeRangee, { readonly href: string }>> = {
  coordonnees: { href: '/app/profile/contact' },
  fiche: { href: '/app/profile/public-profile' },
  pro: { href: '/app/profile/professional' },
  recherche: { href: '/app/profile/search-preferences' },
  versement: { href: '/app/profile/payouts' },
  annuaire: { href: '/app/profile/directory' },
  notifications: { href: '/app/profile/notifications' },
  securite: { href: '/app/profile/security' },
  espaces: { href: '/app/profile/spaces' },
  menu: { href: '/app/profile/menu' },
  langue: { href: '/app/profile/language' },
  fuseau: { href: '/app/profile/timezone' },
  avis: { href: '/app/profile/reviews' },
  donnees: { href: '/app/account/privacy' },
};

export const CHEMIN_DU_SOMMAIRE = '/app/profile';
export const HREF_SUPPRESSION = '/app/profile/delete-account';

/** Les pages qu'on lit en large (840 px au lieu de 640) : la matrice, les avis, la fiche et son aperçu. */
export const RANGEES_LARGES: ReadonlySet<IdDeRangee> = new Set(['notifications', 'avis', 'fiche']);

/** Le fuseau par défaut de la plateforme, dit « Dakar (GMT) » (vocabulaire du ticket). */
export const FUSEAU_DE_DAKAR = 'Africa/Dakar';

export interface FaitsDuSommaire {
  readonly user: Pick<
    User,
    'roles' | 'phone' | 'phone_verified_at' | 'two_factor_enabled' | 'listed_in_public_directory' | 'timezone'
  >;
  /** `GET /api/me/profiles`, `null` s'il n'a pas pu être lu : rien n'en est alors déduit. */
  readonly profils: readonly Profile[] | null;
}

/** Le profil d'agent du compte : il porte la carte, la spécialité, les langues et les quartiers. */
export function profilDAgent(profils: readonly Profile[] | null): Profile | null {
  return profils?.find((p) => p.type === 'agent' && p.status === 'active') ?? profils?.find((p) => p.type === 'agent') ?? null;
}

/** Les rangées ouvertes à ce compte, dans l'ordre de la maquette. */
export function rangeesDuSommaire({ user }: Pick<FaitsDuSommaire, 'user'>): readonly IdDeRangee[] {
  const { roles } = user;
  const agent = isAgent(roles);
  const bailleur = isOwner(roles);
  const prestataire = isServiceProvider(roles);
  const ouverte: Record<IdDeRangee, boolean> = {
    coordonnees: true,
    fiche: agent,
    // L'agent (carte, spécialité) et le prestataire (métiers, zones, tarifs) : leur métier, hors de l'assistant.
    pro: agent || prestataire,
    // TCK-492 — la section du client n'est rendue qu'au compte qui n'est QUE client.
    recherche: isCustomerOnly(roles),
    // TCK-594 (ADR-0039 § 6) — qui est payé déclare où.
    versement: bailleur || prestataire,
    // TCK-2506 — un agent est toujours dans l'annuaire : l'interrupteur ne lui dirait rien de vrai.
    annuaire: bailleur && !agent,
    notifications: true,
    securite: true,
    espaces: true,
    menu: true,
    langue: true,
    fuseau: true,
    avis: true,
    donnees: true,
  };
  return IDS_DE_RANGEE.filter((id) => ouverte[id]);
}

export type IdARegler = 'telephone' | 'double-authentification' | 'fiche';

export interface ARegler {
  readonly id: IdARegler;
  /** La rangée qui porte le point. */
  readonly rangee: IdDeRangee;
  readonly href: string;
}

/**
 * Ce qui demande une action, sur des faits rendus par l'API seulement :
 * - le téléphone renseigné et non vérifié ;
 * - la double authentification inactive pour qui tient des clients et des baux (agent, admin
 *   d'agence : maquette a-0 et AC1) ;
 * - la fiche publique de l'agent sans langue ou sans quartier (TCK-2518) — jamais un pourcentage.
 */
export function aRegler({ user, profils }: FaitsDuSommaire): readonly ARegler[] {
  const liste: ARegler[] = [];
  if (user.phone && !user.phone_verified_at) {
    liste.push({ id: 'telephone', rangee: 'coordonnees', href: HREF_DE_LA_RANGEE.securite.href });
  }
  if (!user.two_factor_enabled && (isAgent(user.roles) || isAdmin(user.roles))) {
    liste.push({ id: 'double-authentification', rangee: 'securite', href: HREF_DE_LA_RANGEE.securite.href });
  }
  const agent = isAgent(user.roles) ? profilDAgent(profils) : null;
  if (agent && ((agent.languages?.length ?? 0) === 0 || (agent.neighborhood_ids?.length ?? 0) === 0)) {
    liste.push({ id: 'fiche', rangee: 'fiche', href: HREF_DE_LA_RANGEE.fiche.href });
  }
  return liste;
}

/** Les rangées marquées d'un point : celles qui portent une chose à régler. */
export function rangeesAPoint(liste: readonly ARegler[]): ReadonlySet<IdDeRangee> {
  return new Set(liste.map((a) => a.rangee));
}

/**
 * La rangée qu'une adresse ouvre — pour marquer l'entrée active du sommaire du bureau. `null` sur le
 * sommaire lui-même (« Vue d'ensemble ») et sur une adresse hors du profil.
 */
export function rangeeDuChemin(pathname: string | null | undefined): IdDeRangee | null {
  const chemin = (pathname ?? '').split(/[?#]/)[0]?.replace(/\/$/, '') ?? '';
  for (const id of IDS_DE_RANGEE) {
    const { href } = HREF_DE_LA_RANGEE[id];
    if (chemin === href || chemin.startsWith(`${href}/`)) return id;
  }
  return null;
}
