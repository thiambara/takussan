import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { IndexDeProfils } from '@/components/public/index/IndexDeProfils';
import { isLocale } from '@/i18n/config';
import { alternatesPubliques } from '@/lib/alternates';
import {
  cheminCanoniqueDesProfils,
  pageDemandee,
  versParametresDeProfils,
  villeDemandee,
} from '@/lib/canonique-profils';
import { RESSOURCES_DE_PROFIL, verdictDeFacette } from '@/lib/queries/public-profiles';

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RESSOURCE = 'agencies' as const;
const BASE = RESSOURCES_DE_PROFIL[RESSOURCE].chemin;

/**
 * `` — l'index public, livré par TCK-436.
 *
 * La fiche `/[slug]` existait depuis TCK-177 et n'avait AUCUN chemin entrant hors d'une
 * fiche de bien : `` répondait 404. Le corps est partagé avec l'autre index
 * ({@link IndexDeProfils}) ; ce fichier ne porte que ce qui diffère — la ressource, la forme de
 * l'avatar, et les métadonnées.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = versParametresDeProfils(await searchParams);
  const t = await getTranslations('meta.agencies');
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';

  // ⚠ La ville de l'URL ne devient une FACETTE qu'après vérification auprès de l'API : sans ce
  // verdict, `?city=<n'importe quoi>` produisait une page 200, index/follow, canonique d'elle-même,
  // au titre choisi par l'appelant. Cf. `verdictDeFacette()`.
  const facette = await verdictDeFacette(RESSOURCE, villeDemandee(params), locale);
  const ville = facette.ville;

  return {
    title: ville ? t('titleCity', { city: ville }) : t('title'),
    description: ville ? t('descriptionCity', { city: ville }) : t('description'),
    // ⚠️ Canonique ET `hreflang` dérivent du chemin CANONIQUE, jamais de l'URL demandée : sur
    // `?city=Dakar&q=awa&page=3`, les quatre déclarations désignent `?city=Dakar` — et `Dakar`
    // n'y entre que si l'API a CERTIFIÉ que cette facette porte du contenu.
    // Deux signaux qui se contredisent font ignorer le groupe entier (cf. `alternatesPubliques`).
    alternates: alternatesPubliques(cheminCanoniqueDesProfils(BASE, params, ville), locale),
    // Une facette qui ne désigne rien n'est pas une page à indexer. `follow` reste vrai : les
    // liens qu'elle porte — le filtre, la pagination — mènent, eux, à des pages réelles.
    // Omettre la clé laisse hériter du layout, qui déclare `index, follow`.
    ...(facette.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function Page({ searchParams }: Props) {
  const params = versParametresDeProfils(await searchParams);
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';

  return (
    <IndexDeProfils
      ressource={RESSOURCE}
      locale={locale}
      params={params}
      page={pageDemandee(params)}
      forme="carre"
    />
  );
}
