'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarOff } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { AGENT_CRM_QUERY_KEY, fetchAbsences } from '@/lib/queries/agent-crm';
import type { AgentAbsence } from '@/types/agent-crm';

import { useTerminerLAbsence } from './CouvrirUneAbsence';

/**
 * TCK-2667 — le bandeau léger du bureau, au-dessus du tableau (maquette `app-equipe`, a, « Liste » :
 * `BandeauAbsence`) : qui est absent, jusqu'à quand, et à qui vont ses nouvelles affectations
 * (ADR-0035 § 3 : tâches, visites et demandes routées vers le remplaçant).
 *
 * TCK-2668 — « qui peut agir à sa place » quand une délégation liée EN COURS couvre l'absence
 * (`substitute_can_act`, ADR-0035, amendement), et les gestes « Modifier l'absence » et « Terminer
 * l'absence » pour qui peut déléguer (`onModifier`) ; sans ce droit, « Voir l'absence » ouvre la fiche.
 * Le nom de l'absent ouvre toujours sa fiche.
 */
export function BandeauDesAbsences({
  agencyId,
  onOuvrir,
  onModifier,
}: {
  readonly agencyId: number;
  readonly onOuvrir: (userId: number) => void;
  /** Donné à qui peut modifier et terminer l'absence d'un autre. */
  readonly onModifier?: (absence: AgentAbsence) => void;
}) {
  const t = useTranslations('admin.team.equipe.bandeau');
  const { token } = useAuth();
  const { jourMois } = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const terminer = useTerminerLAbsence(agencyId);
  const absences = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.absences(agencyId),
    queryFn: () => fetchAbsences(token ?? '', agencyId),
    enabled: Boolean(token),
    retry: false,
  });
  const enCours = (absences.data ?? []).filter((a) => a.status === 'active' && a.absent && a.ends_at);
  if (enCours.length === 0) return null;

  return (
    <ul className="space-y-2" data-slot="bandeau-des-absences">
      {enCours.map((a) => {
        const absent = a.absent;
        // « 14 nov. » finit la phrase : le point de l'abréviation et celui de la phrase se confondent.
        const valeurs = { absent: absent?.name ?? '', date: jourMois(a.ends_at).replace(/\.$/, ''), remplacant: a.substitute?.name ?? '' };
        const fort = (morceau: ReactNode) =>
          absent ? (
            <button
              type="button"
              onClick={() => onOuvrir(absent.id)}
              className="rounded-sm text-left font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {morceau}
            </button>
          ) : (
            <span className="font-semibold">{morceau}</span>
          );
        const cle = !a.substitute ? 'sansRemplacant' : a.substitute_can_act ? 'texteQuiAgit' : 'texte';
        return (
          <li key={a.id} className="rounded-lg bg-warning/10 px-3.5 py-2.5 text-sm">
            <div className="flex items-center gap-2.5">
              <CalendarOff className="size-icone flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
              <p className="min-w-0 flex-1">{t.rich(cle, { ...valeurs, fort })}</p>
              {onModifier ? (
                <>
                  <button type="button" onClick={() => onModifier(a)} className={LIEN}>
                    {t('modifier')}
                  </button>
                  <button type="button" onClick={() => terminer.mutate(a.id)} disabled={terminer.isPending} className={LIEN}>
                    {t('terminer')}
                  </button>
                </>
              ) : absent ? (
                <button type="button" onClick={() => onOuvrir(absent.id)} className={LIEN}>
                  {t('ouvrir')}
                </button>
              ) : null}
            </div>
            {terminer.isError && terminer.variables === a.id ? (
              <p role="alert" className="mt-1.5 pl-7 text-destructive">
                {messageErreur(terminer.error, t('terminerEchec'))}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const LIEN =
  'flex-none rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50';
