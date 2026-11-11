import { getTranslations } from 'next-intl/server';
import { ArrowRight, MapPin } from 'lucide-react';

import { PropertyCard } from '@/components/property/PropertyCard';
import { CARD_SIZES_BIEN_RETIRE } from '@/components/property/card-image-sizes';
import { LienLocalise } from '@/components/shared/LienLocalise';
import type { EtatPublicDuBien } from '@/lib/queries/public-property';
import { propertyTypeValues } from '@/lib/enums/property';
import type { SearchFilters } from '@/types/search';

import { AlerteDuBienRetire } from './alerte-du-bien-retire';

/**
 * TCK-598 (V10, contrainte 11) — la page d'un bien loué, vendu ou retiré : un message clair, puis
 * immédiatement des biens similaires et la recherche du même quartier. **Ce n'est pas une page
 * d'erreur** : le lien d'un bien loué continue de circuler sur WhatsApp, et son lecteur cherche un
 * logement, pas une explication.
 *
 * Trois interdits, chacun gardé par `__tests__/page.server.test.tsx` :
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

/**
 * TCK-2515 — les critères de « M'alerter » : ceux de la recherche du quartier ci-dessus, plus le
 * TYPE du bien (un studio loué à Mermoz appelle les studios de Mermoz). Le quartier n'est posé
 * qu'avec sa ville, comme dans `rechercheDuQuartier` : un nom de quartier seul est ambigu d'une
 * ville à l'autre.
 */
export function criteresDAlerte(etat: EtatPublicDuBien): SearchFilters {
  const filtres: SearchFilters = {};
  if (etat.contract_type === 'rent' || etat.contract_type === 'sale') {
    filtres.contract_type = etat.contract_type;
  }
  if (etat.location.city) filtres.city = etat.location.city;
  if (etat.location.city && etat.location.quarter) filtres.location = etat.location.quarter;
  if (etat.type) filtres.type = [etat.type];
  return filtres;
}

/** Le plafond du nom d'une recherche sauvegardée (`maxLength` du champ, `savedSearchPayloadSchema`). */
const NOM_MAX = 100;

/**
 * TCK-2515 (revue) — le nom proposé pour l'alerte : contrat · type · quartier, ville. Celui que le
 * dialogue suggère seul (`suggestName`) ignore le quartier — « Location · Dakar · Studio » pour une
 * alerte qui ne suit que Liberté 6. Le lieu n'y entre qu'aux conditions de `criteresDAlerte` : le
 * nom ne promet rien que les critères ne portent.
 */
export function nomDeLAlerte(
  etat: EtatPublicDuBien,
  libelles: { readonly contrat: (cle: 'rent' | 'sale') => string; readonly type: (cle: string) => string },
): string | undefined {
  const parties: string[] = [];
  if (etat.contract_type === 'rent' || etat.contract_type === 'sale') parties.push(libelles.contrat(etat.contract_type));
  if (etat.type && (propertyTypeValues as readonly string[]).includes(etat.type)) parties.push(libelles.type(etat.type));
  const { city, quarter } = etat.location;
  if (city) parties.push(quarter ? `${quarter}, ${city}` : city);
  return parties.length > 0 ? parties.join(' · ').slice(0, NOM_MAX) : undefined;
}

/**
 * TCK-2515 — **trois** biens proches, ni plus ni moins que la grille n'a de colonnes au plus large
 * (`lg:grid-cols-3`) : `/status` en rend jusqu'à six, et le lien « Voir les biens à … » mène aux
 * autres. Les trois sortent tous `priority` (TCK-1188 : visibles au rendu serveur).
 */
const BIENS_PROCHES = 3;

/** Une FONCTION qui rend du JSX, pas un composant `async` : testable sous jsdom (patron de la page). */
export async function bienRetire(etat: EtatRetire) {
  const t = await getTranslations('property.retired');
  const tContrat = await getTranslations('property.contractTypes');
  const tTypes = await getTranslations('property.types');
  const { city, quarter } = etat.location;
  const libelleRecherche =
    city && quarter
      ? t('searchQuarter', { quarter, city })
      : city
        ? t('searchCity', { city })
        : t('searchAll');

  const libelleAlerte =
    city && quarter
      ? t('alertQuarter', { quarter })
      : city
        ? t('alertCity', { city })
        : t('alertAll');
  const proches = etat.similar.slice(0, BIENS_PROCHES);
  const nomParDefaut = nomDeLAlerte(etat, { contrat: (c) => tContrat(c), type: (c) => tTypes(c) });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <section className="max-w-2xl">
        <h1 className="font-display text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] text-foreground text-balance sm:text-4xl">
          {t(`title.${etat.state}`)}
        </h1>
        <p className="mt-2 bg-background text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty sm:text-lg">
          {proches.length > 0 ? t('body') : t('bodyNoSimilar')}
        </p>
      </section>

      {/* TCK-2515 — les deux suites : tout le quartier, ou une alerte sur lui. AU-DESSUS des biens
          proches (revue) : au téléphone, sous trois cartes pleines, elles tombaient deux écrans
          plus bas ; et sans bien proche, elles sont la seule issue — toujours rendues. */}
      <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:flex-row sm:flex-wrap sm:gap-3">
        <LienLocalise
          href={rechercheDuQuartier(etat)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-balance text-[0.9375rem] font-semibold text-primary-foreground transition-[background-color,scale] hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] motion-reduce:active:scale-100"
        >
          <MapPin className="size-4" aria-hidden="true" />
          {libelleRecherche}
          <ArrowRight className="size-4" aria-hidden="true" />
        </LienLocalise>
        <AlerteDuBienRetire filtres={criteresDAlerte(etat)} libelle={libelleAlerte} nomParDefaut={nomParDefaut} />
      </div>

      {proches.length > 0 ? (
        <section className="mt-8 space-y-4 sm:mt-10">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">{t('similarTitle')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* TCK-1188 (P102.01) — servies par le serveur, les cartes sortent visibles : une carte
                non `priority` reste en `opacity-0` jusqu'à l'hydratation. */}
            {proches.map((bien, index) => (
              <PropertyCard
                key={bien.id}
                property={bien}
                index={index}
                priority
                sizes={CARD_SIZES_BIEN_RETIRE}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
