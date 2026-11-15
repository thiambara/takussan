'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Heart, ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PastilleDEcart } from '@/components/favorites/suivi/PastilleDEcart';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useFavorisQuiBougent } from '@/lib/queries/accueil-client';
import type { FavoriteItem } from '@/lib/queries/favorites';

import { ErreurDeBloc } from '../EtatsDeBloc';
import { TitreBloc } from '../pieces';

type FavoriDisponible = Extract<FavoriteItem, { availability: 'available' }>;

/**
 * TCK-2625 (maquette `app-accueil` a, écran « Client ») — « Vos favoris ont bougé » : deux vignettes des
 * favoris dont le prix a changé depuis l'ajout, filtrés par l'API (`filter[price_changed]=1`, biens
 * publics seulement). L'écart est la pastille de la page des favoris (`PastilleDEcart`, TCK-2508) : une
 * baisse en vert, une hausse en neutre, jamais « 0 F ».
 *
 * Le titre de la maquette (« prix en baisse ») n'est écrit que s'il est VRAI de chaque vignette ; une
 * hausse parmi elles, et le titre redevient celui du ticket (« Vos favoris ont bougé »).
 *
 * Rien à rendre sans favori qui bouge, ni en chargement ; une panne le dit, le reste de la page est à
 * jour. Écart de donnée à la maquette : « Les 6 favoris » devient « Tous vos favoris » (le compte des
 * favoris demanderait une lecture de plus pour un libellé de lien).
 */
export function FavorisQuiBougent({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.client.favoris');
  const tBlocs = useTranslations('accueil.blocs');
  const lus = useFavorisQuiBougent();
  if (lus.isError) return <ErreurDeBloc quoi={tBlocs('quoi.favoris')} onReessayer={() => void lus.refetch()} className={className} />;
  const favoris = (lus.data?.data ?? []).filter(
    (f): f is FavoriDisponible => f.availability === 'available' && typeof f.price_change === 'number' && f.price_change !== 0,
  );
  if (favoris.length === 0) return null;
  const toutesEnBaisse = favoris.every((f) => (f.price_change ?? 0) < 0);

  return (
    <section aria-labelledby="favoris-qui-bougent" className={className} data-slot="favoris-qui-bougent">
      <div className="flex items-baseline justify-between max-md:pr-4">
        <TitreBloc id="favoris-qui-bougent" className="md:px-0">
          {t(toutesEnBaisse ? 'titreBaisse' : 'titreBouge')}
        </TitreBloc>
        <Link href="/app/favorites" className="rounded text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
          {t('tous')}
        </Link>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-3 max-md:px-4">
        {favoris.map((f) => (
          <li key={f.id} className="min-w-0">
            <VignetteDuFavori favori={f} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const PERIODES = new Set(['daily', 'weekly', 'monthly', 'yearly']);

function VignetteDuFavori({ favori }: { readonly favori: FavoriDisponible }) {
  const t = useTranslations('accueil.client.favoris');
  const f = useFormatteurs();
  const bien = favori.property;
  const periode = bien.contract_type === 'rent' && bien.rent_period && PERIODES.has(bien.rent_period) ? bien.rent_period : null;
  const lieu = bien.location?.quarter ?? bien.location?.city ?? null;

  return (
    <LienLocalise
      href={`/properties/${bien.slug}`}
      className="block overflow-hidden rounded-2xl border border-border bg-card outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring"
      data-slot="vignette-favori"
    >
      <span className="relative block aspect-[4/3] bg-muted">
        {bien.main_photo_url ? (
          <Image src={bien.main_photo_url} alt="" fill sizes="(min-width: 1024px) 12rem, 45vw" className="object-cover" />
        ) : (
          <ImageIcon className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-card">
          <Heart className="size-4 fill-primary text-primary" aria-hidden="true" />
        </span>
      </span>
      <span className="block p-3">
        <span className="block font-display text-base font-semibold tabular-nums">
          {f.montantCourt(bien.price, bien.currency)}
          {periode ? <span className="font-sans text-xs font-normal text-muted-foreground"> {t(`periode.${periode}`)}</span> : null}
        </span>
        <span className="block truncate text-ui text-muted-foreground">{lieu ? `${bien.title} · ${lieu}` : bien.title}</span>
        <PastilleDEcart ecart={favori.price_change} currency={bien.currency} depuis="compte" className="mt-1.5" />
      </span>
    </LienLocalise>
  );
}
