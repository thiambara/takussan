'use client';

import Link from 'next/link';
import { ChevronRight, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { useDelai } from '@/components/rapports/equipe/EquipeDuRapport';
import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { pendingInvitationsCountQueryOptions } from '@/lib/queries/agency-queues';
import { useTeamPerformance, type TeamPerformanceRow, type TeamPerformanceTotals } from '@/lib/queries/agency-reporting';
import { hrefDeLOnglet } from '@/lib/navigation/rapports';
import { DELAI_LENT_SECONDES } from '@/lib/rapports/equipe';
import { cn } from '@/lib/utils';

interface EquipeDuMoisProps {
  readonly agencyId: number;
  /** `AAAA-MM` : le mois de la période lue par la vue d'ensemble. */
  readonly periode: string;
  /** TCK-2791 — `periode` est le mois dernier : le titre ne dit plus « ce mois ». */
  readonly moisDernier?: boolean;
  readonly agencyIsStandard: boolean | undefined;
}

/** TCK-2867 — les colonnes de la maquette (« Performance de l'équipe ») : Demandes traitées et le délai compris. */
const COLONNES = ['properties_managed', 'leads_handled', 'visits_completed', 'leases_signed', 'commissions_earned'] as const;

/**
 * TCK-2628 — « Équipe ce mois » de la vue d'ensemble de l'admin (maquette : rangées au téléphone, tableau
 * « Performance de l'équipe » au bureau), avec le lien vers l'onglet Équipe et « N invitations sans réponse ».
 * Rendu seulement quand l'onglet Équipe est ouvert : même lecture (`team-performance`, sous
 * `reports.view_agency`) et même garde que lui.
 *
 * TCK-2867 — le tableau du bureau a les sept colonnes de la maquette (Agent · Biens gérés · Demandes traitées ·
 * Visites · Baux signés · Commissions générées · Délai de réponse) et sa ligne de total « Équipe · N agents », lue
 * des `totals` de l'API (TCK-2865) — jamais recalculée ici : la médiane de l'équipe n'est pas celle des médianes.
 * Un délai `null` (moins de 5 réponses mesurées) se dit « — », avec la raison en infobulle.
 */
export function EquipeDuMois({ agencyId, periode, moisDernier = false, agencyIsStandard }: EquipeDuMoisProps) {
  const t = useTranslations('rapports.equipe');
  const tColonnes = useTranslations('team.performance');
  const f = useFormatteurs();
  const delai = useDelai();
  const { token } = useAuth();
  const performance = useTeamPerformance(agencyId, periode);
  const invitations = useQuery(pendingInvitationsCountQueryOptions(token, agencyIsStandard));
  const agents = performance.data?.data.agents ?? [];
  const totaux = performance.data?.data.totals;
  const valeur = (row: TeamPerformanceRow | TeamPerformanceTotals, c: (typeof COLONNES)[number]) =>
    c === 'commissions_earned' ? f.montantCourt(row.commissions_earned, 'XOF') : f.nombre(row[c] ?? 0);
  // TCK-2867 — le délai en minutes de `team-performance`, dit comme l'onglet Équipe (`useDelai`, en secondes).
  const delaiDe = (minutes: number | null | undefined) => {
    if (minutes === null || minutes === undefined) {
      return (
        <span title={t('delaiInsuffisant')} data-slot="delai-absent">
          —<span className="sr-only"> {t('delaiInsuffisant')}</span>
        </span>
      );
    }
    return <span className={cn(minutes * 60 > DELAI_LENT_SECONDES && 'font-medium text-destructive')}>{delai(minutes * 60)}</span>;
  };
  const nom = (row: TeamPerformanceRow) => row.name || tColonnes('unknown');

  return (
    <section aria-labelledby="rapports-equipe-titre" data-slot="equipe-du-mois">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id="rapports-equipe-titre" className="text-corps font-semibold">
          {moisDernier ? t('titreMoisDernier') : t('titre')}
        </h2>
        <Link
          href={hrefDeLOnglet('equipe')}
          className="inline-flex min-h-11 items-center gap-0.5 rounded-sm text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('onglet')}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {performance.isPending ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
      ) : performance.isError ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t('erreur')}</p>
      ) : agents.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{tColonnes('emptyDescription')}</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card lg:hidden">
            {agents.map((row) => (
              <li key={row.user_id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-corps font-medium">{nom(row)}</p>
                  <p className="mt-0.5 truncate text-ui tabular-nums text-muted-foreground">
                    {t('resume', { baux: row.leases_signed, visites: row.visits_completed })}
                  </p>
                </div>
                <p className="flex-none text-corps font-semibold tabular-nums">{valeur(row, 'commissions_earned')}</p>
              </li>
            ))}
          </ul>
          {/* TCK-2867 (AC-F3) — le tableau garde sa largeur (948 px, maquette) et défile dans sa carte. */}
          <div className="overflow-x-auto rounded-xl border border-border bg-card max-lg:hidden" data-slot="tableau-equipe">
            <table className="w-full min-w-[59.25rem] text-sm">
              <caption className="sr-only">{tColonnes('caption')}</caption>
              <thead className="bg-muted/40 text-ui text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    {t('colonnes.name')}
                  </th>
                  {COLONNES.map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                      {t(`colonnes.${c}`)}
                    </th>
                  ))}
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                    {t('colonnes.delai')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.map((row) => (
                  <tr key={row.user_id}>
                    <th scope="row" className="truncate px-4 py-3 text-left font-medium">
                      {nom(row)}
                    </th>
                    {COLONNES.map((c) => (
                      <td key={c} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {valeur(row, c)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{delaiDe(row.median_response_minutes)}</td>
                  </tr>
                ))}
              </tbody>
              {totaux ? (
                <tfoot data-slot="total-equipe" className="border-t border-border bg-muted/40 font-semibold">
                  <tr>
                    <th scope="row" className="px-4 py-2.5 text-left">
                      {t('totalEquipe', { n: totaux.agents })}
                    </th>
                    {COLONNES.map((c) => (
                      <td key={c} className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        {valeur(totaux, c)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-normal text-muted-foreground tabular-nums">
                      {totaux.median_response_minutes === null ? delaiDe(null) : t('totalMediane', { delai: delai(totaux.median_response_minutes * 60) })}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </>
      )}

      {(invitations.data ?? 0) > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-ui text-muted-foreground">
          <UserPlus className="size-4 flex-none" aria-hidden="true" />
          {t('invitations', { n: invitations.data ?? 0 })}
          <Link
            href="/app/agency/team?vue=invitations"
            className="inline-flex min-h-11 items-center rounded-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('voirLEquipe')}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
