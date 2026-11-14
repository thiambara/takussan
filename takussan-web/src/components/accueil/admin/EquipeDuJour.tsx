'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ErreurDeBloc } from '@/components/accueil/EtatsDeBloc';
import { etatDeLAgent, type AgentDuJour } from '@/lib/accueil/a-faire';
import { initiales } from '@/lib/fiche-publique';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useEquipeDuJour } from '@/lib/queries/accueil';

/**
 * TCK-2624 (ADR-0096, maquette `app-accueil` a) — « Équipe aujourd'hui » : une ligne par agent actif
 * de l'agence, DANS L'ORDRE ET LE NOMBRE de `GET /api/agencies/{agency}/team-today` (TCK-2623, AC3) —
 * initiales, nom, son état (« En congé jusqu'au 13 nov. », « Première visite à 09:30 ») et sa journée
 * (« 2 visites · 4 demandes »). Le front n'invente ni « Au bureau » ni « Sur le terrain », que l'API
 * ne sait pas.
 *
 * Colonne de droite au bureau (sous « Ce mois »), sous « À faire » au téléphone.
 */
export function EquipeDuJour({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('accueil.equipe');
  const tBlocs = useTranslations('accueil.blocs');
  const equipe = useEquipeDuJour(agencyId, true);
  const agents = equipe.data?.data.agents ?? null;

  let corps;
  if (agents) {
    corps =
      agents.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{t('aucun')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {agents.map((a) => (
            <LigneDAgent key={a.user_id} a={a} />
          ))}
        </ul>
      );
  } else if (equipe.isError) {
    corps = <ErreurDeBloc quoi={tBlocs('quoi.equipe')} onReessayer={() => void equipe.refetch()} className="m-3" />;
  } else {
    corps = (
      <ul className="divide-y divide-border" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5" aria-hidden="true">
            <span className="size-8 flex-none animate-pulse rounded-full bg-muted" />
            <span className="flex-1 space-y-1.5">
              <span className="block h-3 w-1/2 animate-pulse rounded bg-muted" />
              <span className="block h-2.5 w-2/3 animate-pulse rounded bg-muted" />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section data-slot="equipe-du-jour" aria-labelledby="equipe-du-jour-titre">
      <div className="rounded-xl border border-border bg-card max-md:mx-4">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 id="equipe-du-jour-titre" className="min-w-0 flex-1 truncate text-corps font-semibold">
            {t('titre')}
          </h2>
          <Link
            href="/app/calendar"
            className="inline-flex flex-none items-center rounded text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('calendrier')}
          </Link>
        </div>
        {corps}
      </div>
    </section>
  );
}

function LigneDAgent({ a }: { readonly a: AgentDuJour }) {
  const t = useTranslations('accueil.equipe');
  const f = useFormatteurs();
  const nom = a.name?.trim() || t('sansNom');
  const etat = etatDeLAgent(a);
  const texteEtat =
    etat.genre === 'conge' ? t('conge', { jour: f.jourMois(etat.fin) }) : etat.genre === 'premiereVisite' ? t('premiereVisite', { heure: f.heure(etat.a) }) : null;
  return (
    <li data-slot="agent-du-jour" className="flex items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden="true"
        className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-secondary text-legende font-semibold text-primary-deep"
      >
        {initiales(nom)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{nom}</p>
        {texteEtat ? <p className="truncate text-xs text-muted-foreground">{texteEtat}</p> : null}
      </div>
      <span className="flex-none text-xs tabular-nums text-encre-douce">{t('journee', { visites: a.visits_today_count, demandes: a.open_leads_count })}</span>
    </li>
  );
}
