'use client';

import Link from 'next/link';
import { ChevronRight, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { pendingInvitationsCountQueryOptions } from '@/lib/queries/agency-queues';
import { useTeamPerformance, type TeamPerformanceRow } from '@/lib/queries/agency-reporting';
import { hrefDeLOnglet } from '@/lib/navigation/rapports';

interface EquipeDuMoisProps {
  readonly agencyId: number;
  /** `AAAA-MM` : le mois de la période lue par la vue d'ensemble. */
  readonly periode: string;
  readonly agencyIsStandard: boolean | undefined;
}

const COLONNES = ['properties_managed', 'visits_completed', 'leases_signed', 'commissions_earned'] as const;

/**
 * TCK-2628 — « Équipe ce mois » de la vue d'ensemble de l'admin (maquette : rangées au téléphone, tableau
 * « Performance de l'équipe » au bureau), avec le lien vers l'onglet Équipe et « N invitations sans réponse ».
 * Rendu seulement quand l'onglet Équipe est ouvert : même lecture (`team-performance`, sous
 * `reports.view_agency`) et même garde que lui.
 *
 * Les colonnes sont celles que `TeamPerformanceRow` rend aujourd'hui ; « Demandes traitées » et le délai de
 * réponse de la maquette sont de l'onglet Équipe (TCK-2629).
 */
export function EquipeDuMois({ agencyId, periode, agencyIsStandard }: EquipeDuMoisProps) {
  const t = useTranslations('rapports.equipe');
  const tColonnes = useTranslations('team.performance');
  const f = useFormatteurs();
  const { token } = useAuth();
  const performance = useTeamPerformance(agencyId, periode);
  const invitations = useQuery(pendingInvitationsCountQueryOptions(token, agencyIsStandard));
  const agents = performance.data?.data.agents ?? [];
  const valeur = (row: TeamPerformanceRow, c: (typeof COLONNES)[number]) =>
    c === 'commissions_earned' ? f.montantCourt(row.commissions_earned, 'XOF') : f.nombre(row[c]);
  const nom = (row: TeamPerformanceRow) => row.name || tColonnes('unknown');

  return (
    <section aria-labelledby="rapports-equipe-titre" data-slot="equipe-du-mois">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id="rapports-equipe-titre" className="text-corps font-semibold">
          {t('titre')}
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
          <div className="overflow-x-auto rounded-xl border border-border bg-card max-lg:hidden">
            <table className="w-full text-sm">
              <caption className="sr-only">{tColonnes('caption')}</caption>
              <thead className="bg-muted/40 text-ui text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    {tColonnes('columns.name')}
                  </th>
                  {COLONNES.map((c) => (
                    <th key={c} scope="col" className="px-4 py-2.5 text-right font-medium">
                      {tColonnes(`columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.map((row) => (
                  <tr key={row.user_id}>
                    <th scope="row" className="truncate px-4 py-3 text-left font-medium">
                      {nom(row)}
                    </th>
                    {COLONNES.map((c) => (
                      <td key={c} className="px-4 py-3 text-right tabular-nums">
                        {valeur(row, c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
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
