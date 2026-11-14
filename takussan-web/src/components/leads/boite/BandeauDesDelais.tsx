'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert, Timer } from 'lucide-react';

import { type DelaisDeReponse } from '@/lib/queries/contact-leads';

/** « Sokhna S. » : le prénom et l'initiale du nom. */
function nomCourt(u: { readonly id: number; readonly first_name: string | null; readonly last_name: string | null }): string {
  const prenom = u.first_name?.trim();
  const initiale = u.last_name?.trim()[0];
  if (prenom && initiale) return `${prenom} ${initiale.toUpperCase()}.`;
  return prenom || u.last_name?.trim() || `#${u.id}`;
}

/** Un délai en secondes : « 3 h 10 », « 45 min », ou « — » sans réponse. */
export function useDureeLisible() {
  const t = useTranslations('contactLeads.stats');
  return (secondes: number | null): string => {
    if (secondes === null) return t('none');
    const minutes = Math.round(secondes / 60);
    if (minutes < 60) return t('minutes', { m: minutes });
    return t('hoursMinutes', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
  };
}

/** Le nombre d'agents nommés dans le bandeau ; « Par agent » les montre tous. */
const AGENTS_DU_BANDEAU = 3;

/**
 * TCK-2584 (ADR-0103 § 7) — le bandeau de l'administrateur, au bureau : le délai médian de première
 * réponse de l'agence sur la période, les demandes à traiter depuis plus de 24 h, puis le délai de
 * chaque agent — trois dans la ligne, tous au clic sur « Par agent ». Sous 1440, les délais passent
 * à la ligne, alignés à droite : aucun chiffre coupé.
 */
export function BandeauDesDelais({ delais }: { readonly delais: DelaisDeReponse }) {
  const t = useTranslations('contactLeads.stats');
  const duree = useDureeLisible();
  const [tous, setTous] = useState(false);
  const agents = delais.agents;
  return (
    <section data-slot="bandeau-des-delais" aria-label={t('median')} className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <Timer className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          {t('median')}
          <span className="font-display text-lg font-semibold tabular-nums">{duree(delais.agency.median_first_response_seconds)}</span>
          <span className="text-muted-foreground">{t('period', { days: delais.period_days })}</span>
        </span>
        {delais.agency.open_over_24h_count > 0 ? (
          <>
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <span className="flex items-center gap-2 font-medium whitespace-nowrap text-destructive">
              <CircleAlert className="size-icone flex-none" strokeWidth={1.75} aria-hidden="true" />
              {t('over24', { count: delais.agency.open_over_24h_count })}
            </span>
          </>
        ) : null}
        {agents.length > 0 ? (
          <span className="ml-auto flex flex-wrap items-center gap-4 text-ui whitespace-nowrap text-muted-foreground">
            {agents.slice(0, AGENTS_DU_BANDEAU).map((a) => (
              <span key={a.user.id}>{t('agentLine', { name: nomCourt(a.user), delay: duree(a.median_first_response_seconds) })}</span>
            ))}
            <button
              type="button"
              onClick={() => setTous((v) => !v)}
              aria-expanded={tous}
              className="relative rounded-sm font-medium text-primary outline-none after:absolute after:-inset-2 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring"
            >
              {tous ? t('lessByAgent') : t('byAgent')}
            </button>
          </span>
        ) : null}
      </div>
      {tous ? (
        <ul data-slot="delais-par-agent" className="mt-3 divide-y divide-border border-t border-border">
          {agents.map((a) => (
            <li key={a.user.id} className="flex items-center gap-4 py-2 text-ui">
              <span className="min-w-0 flex-1 truncate font-medium">{nomCourt(a.user)}</span>
              <span className="tabular-nums">{duree(a.median_first_response_seconds)}</span>
              {a.open_over_24h_count > 0 ? (
                <span className="font-medium text-destructive tabular-nums">{t('over24', { count: a.open_over_24h_count })}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
