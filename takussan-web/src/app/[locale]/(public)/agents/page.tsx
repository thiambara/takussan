import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { IndexDeProfils } from '@/components/public/index/IndexDeProfils';
import { isLocale } from '@/i18n/config';
import { alternatesPubliques } from '@/lib/alternates';
import {
  cheminCanoniqueDesProfils,
  pageDemandee,
  versParametresDeProfils,
} from '@/lib/canonique-profils';
import { RESSOURCES_DE_PROFIL } from '@/lib/queries/public-profiles';

type Props = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RESSOURCE = 'agents' as const;
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
  const t = await getTranslations('meta.agents');
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';

  const ville = params.get('city')?.trim();

  return {
    title: ville ? t('titleCity', { city: ville }) : t('title'),
    description: ville ? t('descriptionCity', { city: ville }) : t('description'),
    // ⚠️ Canonique ET `hreflang` dérivent du chemin CANONIQUE, jamais de l'URL demandée : sur
    // `?city=Dakar&q=awa&page=3`, les quatre déclarations désignent `?city=Dakar`.
    // Deux signaux qui se contredisent font ignorer le groupe entier (cf. `alternatesPubliques`).
    alternates: alternatesPubliques(cheminCanoniqueDesProfils(BASE, params), locale),
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
      forme="rond"
    />
  );
}
