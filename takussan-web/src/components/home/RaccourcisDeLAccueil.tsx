'use client';

import { useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { EnTeteDeRangee } from '@/components/property/cards/EnTeteDeRangee';
import { iconeDuType } from '@/components/home/icones-de-categorie';
import { PROPERTY_ENUM_NAMESPACES, enumLabel } from '@/components/property-form/options';
import { propertyTypeValues } from '@/lib/schemas/property';
import type { Comptage, RaccourcisDeLAccueil } from '@/lib/queries/raccourcis-de-l-accueil';

/**
 * Les raccourcis de l'accueil — TCK-628 : par ville, par type de bien, par quartier.
 *
 * Ce sont des LIENS vers les pages de facette canoniques de `/properties` (`?city=`, `?type=`,
 * `?city=&location=`, TCK-433 et TCK-598), rendus dans le HTML du serveur : ils servent le
 * visiteur qui n'a pas encore d'intention précise, et ils donnent aux robots un chemin vers ces
 * pages depuis la page la plus liée du site.
 *
 * Chaque tuile dit combien de biens elle ouvre : c'est le compte que l'API sert avec le domaine,
 * pas un nombre recalculé ici.
 */

const TUILE =
  'flex h-full min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 transition-[border-color,box-shadow] hover:border-foreground/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Six tuiles au téléphone (trois rangées de deux), toutes à partir de `sm`. */
const GRILLE_DE_TUILES =
  'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 max-sm:[&>li:nth-child(n+7)]:hidden';

function Compte({ compte }: { readonly compte: number }) {
  const t = useTranslations('homepage.explore');
  return (
    <span className="block truncate text-[13px] leading-[18px] text-muted-foreground tabular-nums">
      {t('count', { count: compte })}
    </span>
  );
}

export function TuilesDeVilles({ villes }: { readonly villes: readonly Comptage[] }) {
  const t = useTranslations('homepage.explore.cities');
  return (
    <section aria-labelledby="accueil-villes">
      <EnTeteDeRangee eyebrow={t('eyebrow')} title={t('title')} idTitre="accueil-villes" />
      <ul className={GRILLE_DE_TUILES}>
        {villes.map(({ valeur, compte }) => (
          <li key={valeur}>
            <LienLocalise href={`/properties?city=${encodeURIComponent(valeur)}`} className={TUILE}>
              <span className="min-w-0">
                <span className="block truncate font-display text-[15px] leading-5 font-semibold text-foreground">
                  {valeur}
                </span>
                <Compte compte={compte} />
              </span>
            </LienLocalise>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TuilesDeTypes({ types }: { readonly types: readonly Comptage[] }) {
  const t = useTranslations('homepage.explore.types');
  const tTypes = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  return (
    <section aria-labelledby="accueil-types">
      <EnTeteDeRangee eyebrow={t('eyebrow')} title={t('title')} idTitre="accueil-types" />
      <ul className={GRILLE_DE_TUILES}>
        {types.map(({ valeur, compte }) => {
          const Icone = iconeDuType(valeur);
          return (
            <li key={valeur}>
              <LienLocalise href={`/properties?type=${encodeURIComponent(valeur)}`} className={TUILE}>
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                  <Icone className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] leading-5 font-semibold text-foreground">
                    {enumLabel(tTypes, propertyTypeValues, valeur)}
                  </span>
                  <Compte compte={compte} />
                </span>
              </LienLocalise>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PastillesDeQuartiers({
  quartiers,
}: {
  readonly quartiers: NonNullable<RaccourcisDeLAccueil['quartiers']>;
}) {
  const t = useTranslations('homepage.explore.neighborhoods');
  const tCompte = useTranslations('homepage.explore');
  const { ville, items } = quartiers;
  return (
    <section aria-labelledby="accueil-quartiers">
      <EnTeteDeRangee eyebrow={t('eyebrow')} title={t('title', { city: ville })} idTitre="accueil-quartiers" />
      <ul className="flex flex-wrap gap-2">
        {items.map(({ valeur, compte }) => (
          <li key={valeur}>
            <LienLocalise
              href={`/properties?city=${encodeURIComponent(ville)}&location=${encodeURIComponent(valeur)}`}
              // Le compte seul, « 42 », ne dit rien à un lecteur d'écran : le nom accessible le
              // complète.
              aria-label={`${valeur}, ${tCompte('count', { count: compte })}`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[14px] font-medium text-foreground transition-[border-color,box-shadow] hover:border-foreground/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {valeur}
              <span aria-hidden className="text-[13px] font-normal text-muted-foreground tabular-nums">{compte}</span>
            </LienLocalise>
          </li>
        ))}
      </ul>
    </section>
  );
}
