import { BadgeCheck, ChevronRight, Clock, Languages, MapPin, Star } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { isLocale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import type { ProfilPublic } from '@/lib/queries/public-profiles';
import { cn } from '@/lib/utils';

import { delaiDeReponse, estLangueConnue } from './faits-de-profil';
import { LogoOuInitiales } from './LogoOuInitiales';

type Props = {
  readonly profil: ProfilPublic;
  /** `/agencies` ou `/agents` — la ligne ne connaît que le préfixe, pas la ressource. */
  readonly base: string;
  /** Monogramme carré pour une enseigne, rond pour une personne. */
  readonly forme: 'rond' | 'carre';
};

/**
 * Une ligne de l'annuaire « Professionnels » — TCK-2521 (refonte de la carte de TCK-436).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * UNE LIGNE AU TÉLÉPHONE, UNE CARTE EN BUREAU — LE MÊME ÉLÉMENT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Au téléphone, une ligne d'environ 80 px (monogramme 48 px, trois lignes de texte) : cinq agences
 * sans défiler, contre une et demie avant. Dès `lg`, la même `<li>` prend bordure et fond de carte
 * et, pour une agence, ses trois aperçus de biens (`cover`). Un seul arbre, et non deux rendus
 * masqués tour à tour : un profil n'apparaît qu'une fois dans le HTML qu'un moteur indexe.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI NE S'AFFICHE PAS, ET POURQUOI
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * · **Aucun numéro, aucune adresse électronique** : l'API ne les sert pas sur l'index, et une ligne
 *   d'annuaire qui porte un numéro est une ligne de fichier de démarchage. Le contact vit sur la
 *   fiche.
 * · **Un fait absent ne laisse ni trou ni « — »** : pas de délai (sous le seuil, ou médiane infinie
 *   — décision 12) → rien ; pas de langue ni de quartier → la ligne entière disparaît ; pas de note
 *   → « Pas encore d'avis », qui est une information et non un trou.
 * · **Le total n'est pas la somme** : `portfolio_count` compte un bien sans type de contrat, qui
 *   n'entre ni dans « à louer » ni dans « à vendre » (`PublicProfileFacts::portefeuilles()`). Les
 *   trois nombres restent donc affichés.
 */
export function ProfileCard({ profil, base, forme }: Props) {
  const t = useTranslations('publicProfileIndex');
  const tRoles = useTranslations('publicProfile.roles');
  const brut = useLocale();
  const locale = isLocale(brut) ? brut : 'fr';

  const note = profil.reviews.average;
  // TCK-573 — l'index `/agents` peut lister des PROPRIÉTAIRES inscrits à l'annuaire (TCK-2506) : la
  // ligne dit ce qu'est la personne avant l'enseigne. Une agence n'a pas de qualité à afficher.
  const qualite = profil.public_role ? tRoles(profil.public_role) : null;
  const complement = profil.agency?.name ?? profil.specialty ?? null;
  const sousTitre = [qualite, complement].filter(Boolean).join(' · ');

  const delai = delaiDeReponse(profil.median_response_minutes);
  const langues = profil.languages.filter(estLangueConnue).map((code) => t(`languages.${code}`));
  const quartiers = profil.neighborhoods.map((q) => q.name);
  const repartition = [
    profil.rent_count > 0 ? t('card.rent', { count: profil.rent_count }) : null,
    profil.sale_count > 0 ? t('card.sale', { count: profil.sale_count }) : null,
  ].filter((x): x is string => x !== null);
  const apercus = forme === 'carre' ? profil.cover.slice(0, 3) : [];
  const rond = forme === 'rond';

  return (
    <li className="lg:flex lg:flex-col lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-5 lg:transition-colors lg:has-[a:hover]:border-primary/40">
      <LienLocalise
        href={`${base}/${encodeURIComponent(profil.slug)}`}
        className="flex items-center gap-3.5 py-3 outline-none focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:items-start lg:gap-4 lg:py-0"
      >
        <Monogramme profil={profil} rond={rond} />

        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-base font-semibold leading-snug text-foreground lg:font-display lg:text-lg lg:tracking-[-0.01em]">
            <span className="truncate">{profil.nom}</span>
            {profil.is_verified && (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={t('card.verified')} />
            )}
          </h3>

          {sousTitre !== '' && (
            <p className="truncate text-[0.8125rem] text-muted-foreground lg:text-sm">{sousTitre}</p>
          )}

          <p className="truncate text-[0.8125rem] text-muted-foreground lg:text-sm">
            <span className="font-medium tabular-nums text-foreground">
              {t('card.properties', { count: profil.portfolio_count })}
            </span>
            {profil.cities.length > 0 && <> · {profil.cities.join(', ')}</>}
          </p>

          {(langues.length > 0 || quartiers.length > 0) && (
            <p className="truncate text-[0.8125rem] text-muted-foreground lg:mt-2 lg:flex lg:flex-col lg:gap-1 lg:whitespace-normal lg:text-sm lg:text-foreground">
              {langues.length > 0 && (
                <span className="lg:flex lg:items-center lg:gap-2">
                  <Languages className="hidden size-4 shrink-0 text-muted-foreground lg:inline" aria-hidden />
                  <span className="sr-only">{t('card.languages')} : </span>
                  {langues.join(' · ')}
                </span>
              )}
              {langues.length > 0 && quartiers.length > 0 && <span className="lg:hidden"> · </span>}
              {quartiers.length > 0 && (
                <span className="lg:flex lg:items-center lg:gap-2">
                  <MapPin className="hidden size-4 shrink-0 text-muted-foreground lg:inline" aria-hidden />
                  <span className="sr-only">{t('card.neighborhoods')} : </span>
                  <span className="lg:truncate">{quartiers.join(', ')}</span>
                </span>
              )}
            </p>
          )}

          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.8125rem] text-muted-foreground lg:mt-1 lg:text-sm">
            {note !== null ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-current text-primary" aria-hidden />
                <span
                  className="font-semibold tabular-nums text-foreground"
                  aria-label={t('card.ratingAria', { rating: note })}
                >
                  {formatNumber(note, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span>{t('card.reviewsCount', { count: profil.reviews.count })}</span>
              </span>
            ) : (
              <span>{t('card.noReviews')}</span>
            )}
            {delai !== null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {t(`card.response.${delai.unite}`, { count: delai.valeur })}
              </span>
            )}
            {repartition.length > 0 && <span className="tabular-nums">{repartition.join(' · ')}</span>}
          </p>
        </div>

        <ChevronRight className="size-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
      </LienLocalise>

      {/* En bureau seulement : la place ne manque pas, et trois biens donnent une raison d'ouvrir
          la fiche. Décoratifs (`alt=""`) : le lien de la ligne porte déjà le nom de l'agence. */}
      {apercus.length > 0 && (
        <div className="mt-4 hidden grid-cols-3 gap-1.5 lg:grid" aria-hidden>
          {apercus.map((photo) => (
            <span key={photo.property_id} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
              <Image src={photo.photo_url} alt="" fill sizes="160px" className="object-cover" />
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

/** Le logo, ou un monogramme — jamais une image cassée (audit § 4, cf. {@link LogoOuInitiales}). */
export function Monogramme({
  profil,
  rond,
  className,
}: {
  readonly profil: Pick<ProfilPublic, 'nom' | 'logo_url'>;
  readonly rond: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden font-display text-[0.9375rem] font-semibold lg:size-14 lg:text-base',
        rond ? 'rounded-full bg-secondary text-primary-deep' : 'rounded-xl bg-foreground text-background',
        className,
      )}
    >
      <LogoOuInitiales nom={profil.nom} logoUrl={profil.logo_url} />
    </span>
  );
}
