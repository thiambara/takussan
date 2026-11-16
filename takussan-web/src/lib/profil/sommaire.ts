import type { Profile } from '@/types/profile';
import type { User } from '@/types/user';
import { isAdmin, isAgent, isCustomerOnly, isOwner, isServiceProvider } from '@/lib/roles';
import { completudeDeLaFiche, faitsDeLaFiche, type CompletudeDeLaFiche } from './completude-de-la-fiche';
import { aDonner, compteDesPieces, type PieceDuProfil } from '@/lib/pieces/pieces';
import type { PayoutMethod } from '@/types/invoice';

/**
 * TCK-2635 — le sommaire du profil (maquette `app-profil`, approche A, retenue le 2026-11-11) : une
 * rangée par section, chacune ouvre sa page ; un point sur ce qui demande une action ; « À régler » en
 * tête. Fonction PURE des faits rendus par l'API (`/api/auth/me`, `/api/me/profiles`) : ni supposition,
 * ni score inventé (la complétude de la fiche, TCK-2862, se calcule sur ces mêmes faits).
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
/** TCK-2864 — « Vos pièces » (TCK-2614), où l'encart du bailleur mène. */
export const HREF_DES_PIECES = '/app/pieces';
/**
 * TCK-2864 — au bureau, versement et annuaire du bailleur sont UNE page (maquette `ABailleurBureau`) :
 * l'entrée « Annuaire public » du sommaire du bureau mène à son bloc, sous les moyens de versement.
 * Au téléphone, l'annuaire garde sa page (`HREF_DE_LA_RANGEE.annuaire`).
 */
export const HREF_ANNUAIRE_AU_BUREAU = '/app/profile/payouts#annuaire';
export const HREF_SUPPRESSION = '/app/profile/delete-account';

/** Les pages qu'on lit en large (840 px au lieu de 640) : la matrice, les avis, la fiche et son aperçu. */
export const RANGEES_LARGES: ReadonlySet<IdDeRangee> = new Set(['notifications', 'avis', 'fiche']);

/** Le fuseau par défaut de la plateforme, dit « Dakar (GMT) » (vocabulaire du ticket). */
export const FUSEAU_DE_DAKAR = 'Africa/Dakar';

export interface FaitsDuSommaire {
  readonly user: Pick<
    User,
    'roles' | 'phone' | 'phone_verified_at' | 'two_factor_enabled' | 'listed_in_public_directory' | 'timezone'
  > &
    // TCK-2862 — la photo et la présentation, deux des cinq critères de la complétude de la fiche.
    Partial<Pick<User, 'avatar_url' | 'bio'>>;
  /** `GET /api/me/profiles`, `null` s'il n'a pas pu être lu : rien n'en est alors déduit. */
  readonly profils: readonly Profile[] | null;
  /**
   * TCK-2864 — les pièces du profil actif quand il est le bailleur (`GET /api/me/pieces`) ; absentes
   * ou `null` : rien n'en est déduit.
   */
  readonly pieces?: readonly PieceDuProfil[] | null;
  /** TCK-2864 — les moyens de versement du compte (`GET /api/me/payout-methods`) ; absents ou `null` : rien. */
  readonly versements?: readonly Pick<PayoutMethod, 'kind' | 'is_default' | 'verification_status'>[] | null;
}

/** TCK-2864 — les pièces requises encore à donner (manquantes ou à refaire). */
export function piecesAEnvoyer(pieces: readonly PieceDuProfil[] | null | undefined): boolean {
  return (pieces ?? []).some((p) => p.required && aDonner(p));
}

/**
 * TCK-2864 — un compte bancaire « à confirmer » : rien n'a été envoyé, et le titulaire peut le régler
 * (« Envoyer le RIB »). Un numéro Wave non vérifié n'en est pas un : c'est l'agence qui le vérifie.
 */
export function compteBancaireAConfirmer(versements: FaitsDuSommaire['versements']): boolean {
  return (versements ?? []).some((m) => m.kind === 'bank_transfer' && m.verification_status === 'to_confirm');
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

export type IdARegler = 'telephone' | 'double-authentification' | 'pieces' | 'rib' | 'fiche';

export interface ARegler {
  readonly id: IdARegler;
  /** La rangée qui porte le point. */
  readonly rangee: IdDeRangee;
  readonly href: string;
  /** TCK-2862 — pour `fiche` : le pourcentage et ce qui manque (l'encart les dit). */
  readonly completude?: CompletudeDeLaFiche;
  /** TCK-2864 — pour `pieces` : les requises envoyées, sur les requises. */
  readonly compte?: { readonly envoyees: number; readonly requises: number };
}

/**
 * TCK-2862 — la complétude de la fiche publique du compte, `null` s'il n'est pas agent ou si son profil
 * d'agent n'a pas pu être lu. La même fonction que la jauge de la page (`completudeDeLaFiche`).
 */
export function completudeDuSommaire({ user, profils }: FaitsDuSommaire): CompletudeDeLaFiche | null {
  const agent = isAgent(user.roles) ? profilDAgent(profils) : null;
  return agent ? completudeDeLaFiche(faitsDeLaFiche(user, agent)) : null;
}

/**
 * Ce qui demande une action, sur des faits rendus par l'API seulement :
 * - le téléphone renseigné et non vérifié ;
 * - la double authentification inactive pour qui tient des clients et des baux (agent, admin
 *   d'agence : maquette a-0 et AC1) ;
 * - la fiche publique de l'agent incomplète (TCK-2862, cinq critères : `completudeDeLaFiche`) — le
 *   pourcentage et ce qui manque, ceux de la jauge de la page ;
 * - TCK-2864 — les pièces du bailleur à envoyer (point sur « Sécurité », l'encart mène à « Vos
 *   pièces ») et un compte bancaire à confirmer (point sur « Moyens de versement », « Envoyer le RIB »).
 *
 * C'est la SEULE source du nombre « N réglages demandent votre attention », des points et des encarts.
 */
export function aRegler({ user, profils, pieces, versements }: FaitsDuSommaire): readonly ARegler[] {
  const liste: ARegler[] = [];
  if (user.phone && !user.phone_verified_at) {
    liste.push({ id: 'telephone', rangee: 'coordonnees', href: HREF_DE_LA_RANGEE.securite.href });
  }
  if (!user.two_factor_enabled && (isAgent(user.roles) || isAdmin(user.roles))) {
    liste.push({ id: 'double-authentification', rangee: 'securite', href: HREF_DE_LA_RANGEE.securite.href });
  }
  if (pieces && piecesAEnvoyer(pieces)) {
    liste.push({ id: 'pieces', rangee: 'securite', href: HREF_DES_PIECES, compte: compteDesPieces(pieces) });
  }
  if (rangeesDuSommaire({ user }).includes('versement') && compteBancaireAConfirmer(versements)) {
    liste.push({ id: 'rib', rangee: 'versement', href: HREF_DE_LA_RANGEE.versement.href });
  }
  const completude = completudeDuSommaire({ user, profils });
  if (completude && completude.pourcentage < 100) {
    liste.push({ id: 'fiche', rangee: 'fiche', href: HREF_DE_LA_RANGEE.fiche.href, completude });
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
