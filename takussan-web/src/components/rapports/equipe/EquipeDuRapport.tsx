'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { EmptyState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useTeamPerformance } from '@/lib/queries/agency-reporting';
import { useDelaisDeReponse } from '@/lib/queries/contact-leads';
import {
  DELAI_LENT_SECONDES,
  joindreLesDelais,
  morceauxDuDelai,
  trierLEquipe,
  type ColonneDEquipe,
  type LigneDEquipe,
} from '@/lib/rapports/equipe';
import { cn } from '@/lib/utils';

/** Le mois courant, `AAAA-MM` : `Africa/Dakar` est UTC+0 toute l'année, le mois UTC est celui de Dakar. */
function moisCourant(): string {
  return new Date().toISOString().slice(0, 7);
}

const NUMERIQUES = ['properties_managed', 'leads_handled', 'visits_completed', 'leases_signed', 'commissions_earned'] as const;

/** Le délai en mots (« 1 h 10 »), ou « — » sans mesure. */
export function useDelai() {
  const t = useTranslations('rapports.equipe.delai');
  return (secondes: number | null) => {
    if (secondes === null) return '—';
    const d = morceauxDuDelai(secondes);
    return t(d.forme, { h: d.h, m: d.forme === 'heuresMinutes' ? String(d.m).padStart(2, '0') : d.m });
  };
}

/**
 * TCK-2629 — l'onglet « Équipe » de Rapports, un onglet du persona ADMIN D'AGENCE (sa garde : celle de
 * `/app/agency/team` et `reports.view_agency`, `garderLOnglet`). L'agent ne l'a pas et ne monte jamais ce
 * composant : ni `team-performance` ni le délai de réponse d'un collègue ne partent de sa page (décision
 * 7 a de la famille 5).
 *
 * Bureau : un tableau trié par colonne — Agent, Biens gérés, Demandes traitées, Visites, Baux signés,
 * Commissions générées, Délai de réponse. Téléphone : une carte par agent, trois chiffres et « Voir »,
 * qui ouvre sa fiche dans l'équipe (`/app/agency/team?membre=`).
 *
 * Le délai (`contact-leads/response-stats`) est une médiane GLISSANTE sur `period_days` jours, à côté de
 * colonnes MENSUELLES : la fenêtre est dite sous le tableau. Une lecture refusée ou en échec retire la
 * colonne, sans casser le tableau.
 */
export function EquipeDuRapport({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('rapports.equipe');
  const tC = useTranslations('team.performance');
  const f = useFormatteurs();
  const delai = useDelai();
  const [tri, setTri] = useState('-commissions_earned');
  const periode = moisCourant();
  const performance = useTeamPerformance(agencyId, periode);
  const delais = useDelaisDeReponse();
  const avecDelai = delais.isSuccess;
  const lignes = trierLEquipe(joindreLesDelais(performance.data?.data.agents ?? [], avecDelai ? delais.data.data.agents : null), tri);

  const nom = (row: LigneDEquipe) => row.name || tC('unknown');
  const valeur = (row: LigneDEquipe, c: (typeof NUMERIQUES)[number]) =>
    c === 'commissions_earned' ? f.montantCourt(row.commissions_earned, 'XOF') : f.nombre(row[c] ?? 0);
  const entete = (c: ColonneDEquipe) => t(`colonnes.${c}`);

  const columns: DataTableColumn<LigneDEquipe>[] = [
    {
      id: 'name',
      header: entete('name'),
      sortKey: 'name',
      sortLabel: tC('sortBy', { column: entete('name') }),
      cell: (row) => <span className="font-medium">{nom(row)}</span>,
    },
    ...NUMERIQUES.map(
      (c): DataTableColumn<LigneDEquipe> => ({
        id: c,
        header: entete(c),
        sortKey: c,
        sortLabel: tC('sortBy', { column: entete(c) }),
        align: 'end',
        className: 'whitespace-nowrap tabular-nums',
        cell: (row) => valeur(row, c),
      }),
    ),
    ...(avecDelai
      ? [
          {
            id: 'delai',
            header: entete('delai'),
            sortKey: 'delai',
            sortLabel: tC('sortBy', { column: entete('delai') }),
            align: 'end' as const,
            className: 'whitespace-nowrap tabular-nums',
            cell: (row: LigneDEquipe) => (
              <span className={cn(row.delai !== null && row.delai > DELAI_LENT_SECONDES && 'font-medium text-destructive')}>{delai(row.delai)}</span>
            ),
          },
        ]
      : []),
  ];

  if (performance.isPending) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }
  if (performance.isError) {
    return <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t('erreur')}</p>;
  }
  if (lignes.length === 0) {
    return <EmptyState icon={<Users className="size-8" aria-hidden="true" />} title={tC('emptyTitle')} description={tC('emptyDescription')} />;
  }

  const mediane = avecDelai ? delais.data.data.agency.median_first_response_seconds : null;
  const pied = t('pied', {
    n: lignes.length,
    mois: f.date(`${periode}-15T12:00:00Z`, { month: 'long', year: 'numeric' }),
  });

  return (
    <section aria-labelledby="equipe-titre" data-slot="equipe-du-rapport">
      <h2 id="equipe-titre" className="mb-2.5 text-corps font-semibold">
        {t('performance')}
      </h2>

      <ul className="space-y-2 lg:hidden" data-slot="cartes-equipe">
        {lignes.map((row) => (
          <li key={row.user_id} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card py-2.5 pr-2 pl-4">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-corps font-medium">{nom(row)}</p>
              <p className="mt-0.5 truncate text-ui tabular-nums text-muted-foreground">
                {t('resumeTelephone', {
                  baux: row.leases_signed,
                  visites: row.visits_completed,
                  commissions: f.montantCourt(row.commissions_earned, 'XOF'),
                })}
              </p>
            </div>
            <Link
              href={`/app/agency/team?membre=${row.user_id}`}
              aria-label={t('voirAria', { nom: nom(row) })}
              className="inline-flex h-11 flex-none items-center gap-0.5 rounded-md px-2 text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              {t('voir')}
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-xl border border-border bg-card max-lg:hidden">
        <DataTable
          caption={tC('caption')}
          columns={columns}
          rows={lignes}
          rowKey={(row) => row.user_id}
          sort={{ value: tri, onChange: setTri }}
          density="compact"
          className="rounded-none ring-0"
        />
      </div>

      <p className="mt-3 text-ui text-muted-foreground" data-slot="pied-equipe">
        {pied}
        {avecDelai ? ` ${t('mediane', { delai: delai(mediane), jours: delais.data.data.period_days })}` : ''}
      </p>
    </section>
  );
}
