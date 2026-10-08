import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PropertyCard } from '@/components/property/PropertyCard';
import { LienLocalise } from '@/components/shared/LienLocalise';
import type { EtatPublicDuBien } from '@/lib/queries/public-property';

/**
 * TCK-598 (V10, contrainte 11) — la page d'un bien loué, vendu ou retiré : un message clair, puis
 * immédiatement des biens similaires et la recherche du même quartier. **Ce n'est pas une page
 * d'erreur** : le lien d'un bien loué continue de circuler sur WhatsApp, et son lecteur cherche un
 * logement, pas une explication.
 *
 * Trois interdits, chacun gardé par `__tests__/bien-retire.test.tsx` :
 *
 *   · jamais indexable (`noindex`) — c'est la fiche d'une annonce qui n'existe plus ;
 *   · aucun JSON-LD `RealEstateListing` — ce serait annoncer à un moteur un bien à louer ;
 *   · jamais « introuvable » — le bien existe, il n'est plus proposé.
 *
 * Code HTTP : **200 + `noindex`**. `notFound()` est le seul moyen de Next 16 de rendre un 404
 * depuis une page, et il remplace le corps par `not-found.tsx`, qui ne reçoit ni le slug ni l'état ;
 * un 410 n'est pas exprimable depuis une page de l'App Router : les seuls statuts d'interruption sont
 * 404, 403 et 401 (`HTTPAccessErrorStatus`, relu dans
 * `node_modules/next/dist/client/components/http-access-fallback/http-access-fallback.js`, Next 16.3.1).
 */
export type EtatRetire = EtatPublicDuBien & { readonly state: 'rented' | 'sold' | 'withdrawn' };

export function estRetire(etat: EtatPublicDuBien | null): etat is EtatRetire {
  return etat !== null && etat.state !== 'available';
}

/** La recherche qui prolonge la visite : même contrat, même quartier (ou même ville). */
export function rechercheDuQuartier(etat: EtatPublicDuBien): string {
  const params = new URLSearchParams();
  if (etat.contract_type) params.set('contract_type', etat.contract_type);
  if (etat.location.city) params.set('city', etat.location.city);
  if (etat.location.city && etat.location.quarter) params.set('location', etat.location.quarter);
  const requete = params.toString();
  return requete === '' ? '/properties' : `/properties?${requete}`;
}

export async function metadonneesDeBienRetire(etat: EtatRetire): Promise<Metadata> {
  const t = await getTranslations('property.retired');
  return {
    title: t(`title.${etat.state}`),
    description: t('metaDescription'),
    robots: { index: false, follow: true },
  };
}

/** Une FONCTION qui rend du JSX, pas un composant `async` : testable sous jsdom (patron de la page). */
export async function bienRetire(etat: EtatRetire) {
  const t = await getTranslations('property.retired');
  const { city, quarter } = etat.location;
  const libelleRecherche =
    city && quarter
      ? t('searchQuarter', { quarter, city })
      : city
        ? t('searchCity', { city })
        : t('searchAll');

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <section className="max-w-2xl">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground text-balance sm:text-3xl">
          {t(`title.${etat.state}`)}
        </h1>
        <p className="mt-3 text-muted-foreground text-pretty">{t('body')}</p>
        <LienLocalise
          href={rechercheDuQuartier(etat)}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {libelleRecherche}
        </LienLocalise>
      </section>

      {etat.similar.length > 0 ? (
        <section className="mt-12 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">{t('similarTitle')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {etat.similar.map((bien, index) => (
              <PropertyCard key={bien.id} property={bien} index={index} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
