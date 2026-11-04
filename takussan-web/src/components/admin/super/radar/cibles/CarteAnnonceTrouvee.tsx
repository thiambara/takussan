'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ImageOff, MapPin } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { RADAR_SOURCE_SITES, type RadarTargetListingRow } from '@/types/radar';
import { STAGE_TONE } from '../RadarWorkList';

const estUrlWeb = (valeur: string | null | undefined): valeur is string => !!valeur && /^https?:\/\//i.test(valeur);

const PERIODES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
const estPeriode = (valeur: unknown): valeur is (typeof PERIODES)[number] => PERIODES.includes(valeur as (typeof PERIODES)[number]);

const estSiteConnu = (valeur: string): valeur is (typeof RADAR_SOURCE_SITES)[number] =>
  (RADAR_SOURCE_SITES as readonly string[]).includes(valeur);

/**
 * TCK-2469 — une annonce trouvée par une cible, en carte compacte : photo, prix, quartier, site, étape. La carte entière
 * mène à la fiche annonce existante (`/super-admin/radar/{id}`). La photo est celle de la source, servie par son site :
 * aucune n'est copiée chez nous avant l'accord de l'annonceur (ADR-0077).
 */
export function CarteAnnonceTrouvee({ annonce }: { readonly annonce: RadarTargetListingRow }) {
  const t = useTranslations('superAdmin.pages.radar');
  const fmt = useFormatteurs();
  const photo = (annonce.photo_urls ?? []).find(estUrlWeb);
  const titre = annonce.extracted?.title?.value;
  const prix = annonce.extracted?.price?.value;
  const periode = annonce.extracted?.rent_period?.value ?? annonce.extracted?.price?.period;
  const quartier = annonce.extracted?.neighborhood?.value ?? annonce.extracted?.city?.value;

  return (
    <li>
      <Link
        href={`/super-admin/radar/${annonce.id}`}
        className="group flex h-full gap-3 rounded-xl bg-card p-2.5 ring-1 ring-border transition-shadow duration-150 hover:ring-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        data-testid={`radar-cible-annonce-${annonce.id}`}
      >
        <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- photo d'un site tiers, hors des hôtes de `next/image` ; rien à optimiser chez nous.
            <img
              src={photo}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-5" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-sm font-medium text-foreground group-hover:underline group-hover:underline-offset-4">
            {titre || t('untitled')}
          </p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {prix == null ? (
              <span className="font-normal text-muted-foreground">{t('targets.listings.noPrice')}</span>
            ) : (
              <>
                {fmt.montant(prix, 'XOF')}
                {estPeriode(periode) ? <span className="ml-1 text-xs font-normal text-muted-foreground">{t(`periods.${periode}`)}</span> : null}
              </>
            )}
          </p>
          {quartier ? (
            <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{quartier}</span>
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
            <StatusBadge tone={STAGE_TONE[annonce.stage]} label={t(`stages.${annonce.stage}`)} className="whitespace-nowrap" />
            <span className="text-xs text-muted-foreground">
              {estSiteConnu(annonce.source_site) ? t(`sites.${annonce.source_site}`) : annonce.source_site}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
