import { formaterTelephone } from '@/lib/phone';
import { isAgent, isServiceProvider } from '@/lib/roles';
import { localeDisplayLabel, type Locale } from '@/i18n/config';
import { FUSEAU_DE_DAKAR, profilDAgent, type FaitsDuSommaire, type IdDeRangee } from '@/lib/profil/sommaire';
import type { NoteDeLaFiche } from '@/lib/profil/note-de-la-fiche';
import type { ProfileType } from '@/types/profile';

/** Le traducteur de `profile.sommaire.details` (et de `profile.types` pour le rôle d'un espace). */
type Traduire = (cle: string, valeurs?: Record<string, string | number>) => string;

/**
 * TCK-2635 — la ligne de détail de chaque rangée du sommaire au téléphone (maquette `ListeSommaire`),
 * tirée des faits rendus par l'API ; à défaut d'un fait, une ligne qui dit ce que la page contient.
 * Ni pourcentage de fiche, ni compte d'avis calculé ici : la note et le nombre d'avis de l'agent
 * sont ceux de sa fiche publique (`noteDeLaFiche`), et rien pour les autres personas.
 */
export function detailsDuSommaire(
  { user, profils }: FaitsDuSommaire,
  {
    t,
    tTypes,
    locale,
    note = null,
  }: { readonly t: Traduire; readonly tTypes: Traduire; readonly locale: Locale; readonly note?: NoteDeLaFiche | null },
): Readonly<Record<IdDeRangee, string>> {
  const agent = isAgent(user.roles) ? profilDAgent(profils) : null;
  const actifs = (profils ?? []).filter((p) => p.status === 'active');

  const coordonnees = user.phone
    ? t(user.phone_verified_at ? 'coordonnees.verifie' : 'coordonnees.aVerifier', { telephone: formaterTelephone(user.phone) })
    : t('coordonnees.sansNumero');

  const pro = agent?.license_number
    ? t('pro.carte', { numero: agent.license_number })
    : isServiceProvider(user.roles) && !isAgent(user.roles)
      ? t('pro.prestataire')
      : t('pro.carteARenseigner');

  const espace = actifs.length === 1 ? actifs[0] : null;
  const espaces = espace
    ? espace.agency?.name
      ? t('espaces.un', { agence: espace.agency.name, role: tTypes(espace.type as ProfileType) })
      : tTypes(espace.type as ProfileType)
    : actifs.length > 1
      ? t('espaces.plusieurs', { count: actifs.length })
      : t('espaces.aucun');

  return {
    coordonnees,
    fiche: t('fiche.faits', {
      langues: agent?.languages?.length ?? 0,
      quartiers: agent?.neighborhood_ids?.length ?? 0,
    }),
    pro,
    recherche: t('recherche'),
    versement: t('versement'),
    annuaire: t(user.listed_in_public_directory ? 'annuaire.inscrit' : 'annuaire.nonInscrit'),
    notifications: t('notifications'),
    securite: t(user.two_factor_enabled ? 'securite.active' : 'securite.inactive'),
    espaces,
    menu: t('menu'),
    langue: localeDisplayLabel(locale, locale),
    fuseau: !user.timezone || user.timezone === FUSEAU_DE_DAKAR ? t('fuseau.dakar') : user.timezone,
    avis: note ? t('avisNote', { nombre: note.nombre, moyenne: moyenneLisible(note.moyenne, locale) }) : t('avis'),
    donnees: t('donnees'),
  };
}

/** « 4,1 » : une décimale, au format de la langue — la valeur de la fiche, arrondie comme elle l'affiche. */
export function moyenneLisible(moyenne: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(moyenne);
}
