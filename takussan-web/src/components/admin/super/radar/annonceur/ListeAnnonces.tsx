'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import { RADAR_OUTREACH_MAX_LISTINGS, type RadarAdvertiserListing, type RadarOutreach } from '@/types/radar';
import { MOTIF_LAISSEE_REPLI, MOTIFS_RADAR } from '../codes-radar';
import { raisonNonCochable } from './annonces';

interface ListeAnnoncesProps {
  readonly annonces: readonly RadarAdvertiserListing[];
  readonly messages: readonly RadarOutreach[];
  readonly selection: ReadonlySet<number>;
  readonly onBascule: (id: number) => void;
  /** Pas de prise en charge, STOP, ou geste en vol : on regarde, on ne coche pas. */
  readonly desactive: boolean;
}

/**
 * TCK-2388 — les annonces de l'annonceur, à cocher pour le prochain message. Une annonce qui ne se coche pas dit
 * pourquoi (déjà couverte, pas relue, close, en attente d'une réponse) ; le plafond d'un message est celui de l'API.
 */
export function ListeAnnonces({ annonces, messages, selection, onBascule, desactive }: ListeAnnoncesProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.listings');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const fmt = useFormatteurs();
  const pleine = selection.size >= RADAR_OUTREACH_MAX_LISTINGS;

  return (
    <section aria-label={t('heading')} className="space-y-3" data-testid="radar-annonceur-annonces">
      <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
      {annonces.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="space-y-2" aria-label={t('tableCaption')}>
          {annonces.map((annonce) => {
            const raison = raisonNonCochable(annonce, messages);
            const coche = selection.has(annonce.id);
            const bloque = desactive || raison !== null || (pleine && !coche);
            return (
              <li
                key={annonce.id}
                className={cn('flex flex-wrap items-start gap-3 rounded-lg border bg-card px-3 py-2.5', raison !== null && 'bg-muted/40')}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary disabled:cursor-not-allowed"
                  checked={coche}
                  disabled={bloque}
                  aria-label={t('select', { id: annonce.id })}
                  onChange={() => onBascule(annonce.id)}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{annonce.title || t('untitled')}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      annonce.price === null ? null : fmt.montant(annonce.price, 'XOF'),
                      annonce.neighborhood,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {raison !== null ? <p className="text-xs text-muted-foreground">{t(`why.${raison}`)}</p> : null}
                  {/* TCK-2413 — réclamée, laissée par la publication automatique : la raison, pour la reprendre, et quand elle
                      s'efface si personne ne la publie (ADR-0077 §9). Un code inconnu prend le repli, le code reste au survol. */}
                  {annonce.stage === 'consented' && annonce.stage_reason ? (
                    <>
                      <p className="text-xs font-medium text-foreground" title={annonce.stage_reason} data-testid={`radar-annonce-laissee-${annonce.id}`}>
                        {tRadar(`reasons.${MOTIFS_RADAR[annonce.stage_reason] ?? MOTIF_LAISSEE_REPLI}`)}
                      </p>
                      {annonce.purge_at ? (
                        <p className="text-xs text-muted-foreground" data-testid={`radar-annonce-purge-${annonce.id}`}>
                          {t('purgeOn', { date: fmt.date(annonce.purge_at) })}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <StatusBadge tone="neutral" label={tRadar(`stages.${annonce.stage}`)} />
                <Link
                  href={`/super-admin/radar/${annonce.id}`}
                  aria-label={t('open', { id: annonce.id })}
                  className="rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t('number', { id: annonce.id })}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pleine ? <p className="text-xs text-muted-foreground">{t('limit', { max: RADAR_OUTREACH_MAX_LISTINGS })}</p> : null}
    </section>
  );
}
