'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { RouteSkeleton } from '@/components/console/RouteSkeleton';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useLotsPasses, useRapportDesMisesEnAvant, type JourDuRapport, type LotPasse } from '@/lib/queries/credits';

import { PiedDeTableau } from './sections';
import { useLectureDesCredits } from './useLectureDesCredits';

/**
 * TCK-2925 — les deux panneaux de la page Crédits nés de TCK-2924 : « Rapport des 30 derniers jours »
 * (`GET /api/credits/boosts/report?days=30`) et « Lots épuisés ou expirés » (`GET /api/credits/lots`).
 *
 * · Libellés des mesures du rapport — jamais deux nombres différents sous le même mot : « Affichages »
 *   = `impressions` (la carte montrée), « Vues » = `clicks` (le sens de la colonne « Vues » de la page,
 *   décision 1 a de TCK-2664), « Consultations » = `views` (toutes les ouvertures de la fiche pendant
 *   une mise en avant, TCK-2923).
 * · Les totaux par mise en avant sont ceux de l'API, jamais recalculés ici.
 * · Un lot épuisé n'a pas de date d'épuisement dans l'API : on dit sa réception, jamais une date
 *   inventée ; un lot expiré dit sa date d'expiration.
 */

const JOURS_DU_RAPPORT = 30;
const LOTS_PAR_PAGE = 20;

type Mesure = 'impressions' | 'clicks' | 'views';
const MESURES: readonly { readonly cle: Mesure; readonly libelle: 'affichages' | 'vues' | 'consultations' }[] = [
  { cle: 'impressions', libelle: 'affichages' },
  { cle: 'clicks', libelle: 'vues' },
  { cle: 'views', libelle: 'consultations' },
];

const somme = (jours: readonly JourDuRapport[], cle: Mesure) => jours.reduce((s, j) => s + j[cle], 0);

/** Le contenu du panneau « Rapport des 30 derniers jours ». */
export function RapportDesTrenteJours({ ouvert }: { readonly ouvert: boolean }) {
  const t = useTranslations('credits');
  const f = useFormatteurs();
  const l = useLectureDesCredits();
  const rapport = useRapportDesMisesEnAvant(JOURS_DU_RAPPORT, ouvert);

  if (rapport.isPending) return <RouteSkeleton variant="list" />;
  if (rapport.isError || !rapport.data) {
    return <ErrorState className="m-5" message={t('loadError')} onRetry={() => void rapport.refetch()} retryLabel={t('retry')} />;
  }
  const { days: jours, boosts } = rapport.data.data;
  const { from, to } = rapport.data.meta;
  const n = (x: number) => f.nombre(x);

  return (
    <div data-slot="rapport-des-mises-en-avant" className="space-y-6 px-5 py-5">
      <p className="text-sm text-muted-foreground">{t('rapport.periode', { debut: f.jourMois(from), fin: f.jourMois(to) })}</p>

      <dl className="grid grid-cols-3 gap-3">
        {MESURES.map(({ cle, libelle }) => (
          <div key={cle} className="rounded-lg border border-border bg-card px-3 py-2.5">
            <dt className="text-ui text-muted-foreground">{t(`rapport.col.${libelle}`)}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{n(somme(jours, cle))}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="rapport-par-mise-en-avant">
        <h3 id="rapport-par-mise-en-avant" className="text-corps font-semibold">
          {t('rapport.parMiseEnAvant')}
        </h3>
        {boosts.length === 0 ? (
          <EmptyState className="py-6" title={t('rapport.aucune')} />
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {boosts.map((b) => (
              <li key={b.id} data-slot="rapport-mise-en-avant" className="px-3 py-3">
                <p className="truncate text-corps leading-tight font-medium">{b.property?.title}</p>
                <p className="mt-0.5 truncate text-ui text-muted-foreground">
                  {[
                    l.offre(b.kind, b.variant),
                    b.starts_at
                      ? b.ended_at
                        ? t('rapport.periodeBoostFinie', { debut: f.jourMois(b.starts_at), fin: f.jourMois(b.ended_at) })
                        : t('rapport.periodeBoost', { date: f.jourMois(b.starts_at) })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-3 text-ui">
                  {MESURES.map(({ cle, libelle }) => (
                    <div key={cle}>
                      <dt className="text-muted-foreground">{t(`rapport.col.${libelle}`)}</dt>
                      <dd className="font-semibold text-foreground tabular-nums">{n(b[cle])}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rapport-par-jour">
        <h3 id="rapport-par-jour" className="text-corps font-semibold">
          {t('rapport.parJour')}
        </h3>
        <div role="table" aria-labelledby="rapport-par-jour" className="mt-2 rounded-lg border border-border text-sm">
          <div role="rowgroup">
            <div role="row" className="grid h-9 grid-cols-[minmax(0,1fr)_repeat(3,5.5rem)] items-center gap-x-3 px-3 text-xs font-medium text-muted-foreground">
              <span role="columnheader">{t('rapport.col.jour')}</span>
              {MESURES.map(({ cle, libelle }) => (
                <span key={cle} role="columnheader" className="text-right">
                  {t(`rapport.col.${libelle}`)}
                </span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {/* Le plus récent d'abord : c'est ce qu'on relit. */}
            {[...jours].reverse().map((j) => (
              <div
                key={j.date}
                role="row"
                data-slot="rapport-jour"
                className="grid min-h-9 grid-cols-[minmax(0,1fr)_repeat(3,5.5rem)] items-center gap-x-3 border-t border-border px-3 py-1.5"
              >
                <span role="cell">{f.jourMois(j.date)}</span>
                {MESURES.map(({ cle }) => (
                  <span key={cle} role="cell" className="text-right tabular-nums">
                    {n(j[cle])}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-ui text-muted-foreground">{t('rapport.legende')}</p>
      </section>
    </div>
  );
}

/** Un lot épuisé ou expiré : son origine, son état, sa réception et — expiré — sa date d'expiration. */
function LotPasseLigne({ lot }: { readonly lot: LotPasse }) {
  const t = useTranslations('credits');
  const f = useFormatteurs();
  return (
    <li data-slot="lot-passe" className="px-4 py-3.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-corps font-medium">{t(`lots.origines.${lot.origin}`)}</p>
        <StatusBadge tone={lot.state === 'expired' ? 'attention' : 'neutral'} label={t(`lotsPasses.etat.${lot.state}`)} />
      </div>
      <p className="mt-0.5 text-ui text-muted-foreground">
        {[
          lot.reason,
          t('lotsPasses.recus', { count: lot.initial_amount, date: f.jourMois(lot.created_at) }),
          lot.state === 'expired' && lot.expires_at ? t('lotsPasses.expireLe', { date: f.jourMois(lot.expires_at) }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </li>
  );
}

/** La liste des lots épuisés ou expirés, paginée côté serveur ; lue seulement quand elle est montrée. */
export function ListeDesLotsPasses({ ouvert }: { readonly ouvert: boolean }) {
  const t = useTranslations('credits');
  const [page, setPage] = useState(1);
  const lots = useLotsPasses(page, LOTS_PAR_PAGE, ouvert);
  if (lots.isPending) return <RouteSkeleton variant="list" />;
  if (lots.isError || !lots.data) {
    return <ErrorState className="m-5" message={t('loadError')} onRetry={() => void lots.refetch()} retryLabel={t('retry')} />;
  }
  if (lots.data.data.length === 0) return <EmptyState className="py-8" title={t('lotsPasses.vide')} />;
  return (
    <div data-slot="lots-passes">
      <ul className="divide-y divide-border">
        {lots.data.data.map((lot) => (
          <LotPasseLigne key={lot.id} lot={lot} />
        ))}
      </ul>
      {lots.data.meta.last_page > 1 ? <PiedDeTableau meta={lots.data.meta} onPage={setPage} /> : null}
    </div>
  );
}
