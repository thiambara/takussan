'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlarmClock, Building2, CalendarPlus, ChevronRight, Coffee, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PARAMETRE_DE_SECTION } from '@/lib/crm/fiche-du-client';
import type { SuggestionsDeLaJournee } from '@/lib/queries/journee';
import { cn } from '@/lib/utils';

const LIGNE = 'flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring';

function Contenu({ icone, titre, detail }: { readonly icone: ReactNode; readonly titre: string; readonly detail: string }) {
  return (
    <>
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-encre-douce" aria-hidden="true">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-corps font-semibold">{titre}</span>
        <span className="block truncate text-ui text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
    </>
  );
}

/**
 * « Journée libre » (maquette `JourneeLibre`, `app-aujourdhui` e4) : rien de prévu, rien à régler — de quoi
 * prendre de l'avance : les prospects à relancer, les biens à proposer à un client, planifier une visite,
 * ajouter un client.
 *
 * TCK-2856 — les deux premières suggestions sont NOMINATIVES (`suggestions` de `dashboard/me`, TCK-2855) :
 * « 6 prospects à relancer » / « Ibrahima Sarr attend depuis 9 jours », et « 3 biens à proposer à
 * Mariama » / « Biens à Mermoz et à Ouakam », qui ouvre la fiche du client sur ses biens correspondants.
 * Une suggestion que l'API ne sert pas ne se rend pas ; les deux suggestions fixes restent.
 */
export function JourneeLibre({
  aRelancer,
  suggestions,
  onPlanifier,
  className,
}: {
  readonly aRelancer: number | null;
  readonly suggestions: SuggestionsDeLaJournee | null;
  readonly onPlanifier: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('journee.libre');
  const icone = 'size-4.5';
  const relance = suggestions?.follow_up ?? null;
  const rapprochement = suggestions?.matches && suggestions.matches.count > 0 ? suggestions.matches : null;
  return (
    <div data-slot="journee-libre" className={className}>
      <div className="flex flex-col items-center px-6 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-primary-deep" aria-hidden="true">
          <Coffee className="size-6" strokeWidth={1.5} />
        </span>
        <p className="mt-4 font-display text-2xl font-semibold tracking-titre">{t('titre')}</p>
        <p className="mt-1.5 max-w-xs text-corps text-muted-foreground">{t('texte')}</p>
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {relance ? (
          <li>
            <Link href="/app/customers?vue=a-relancer" className={LIGNE}>
              <Contenu
                icone={<AlarmClock className={icone} strokeWidth={1.75} />}
                titre={aRelancer !== null && aRelancer > 0 ? t('relancer', { n: aRelancer }) : t('relancerUn', { nom: relance.customer.full_name })}
                detail={relance.waiting_days > 0 ? t('relancerAttend', { nom: relance.customer.full_name, n: relance.waiting_days }) : t('relancerNom', { nom: relance.customer.full_name })}
              />
            </Link>
          </li>
        ) : null}
        {rapprochement ? (
          <li>
            <Link href={`/app/customers/${rapprochement.customer.id}?${PARAMETRE_DE_SECTION}=biens`} className={LIGNE}>
              <Contenu
                icone={<Building2 className={icone} strokeWidth={1.75} />}
                titre={rapprochement.customer.first_name?.trim() ? t('proposer', { n: rapprochement.count, prenom: rapprochement.customer.first_name.trim() }) : t('proposerSansPrenom', { n: rapprochement.count })}
                detail={detailDuRapprochement(rapprochement.sample, t)}
              />
            </Link>
          </li>
        ) : null}
        <li>
          <button type="button" onClick={onPlanifier} className={cn(LIGNE)}>
            <Contenu icone={<CalendarPlus className={icone} strokeWidth={1.75} />} titre={t('planifier')} detail={t('planifierDetail')} />
          </button>
        </li>
        <li>
          <Link href="/app/customers/new" className={LIGNE}>
            <Contenu icone={<UserPlus className={icone} strokeWidth={1.75} />} titre={t('client')} detail={t('clientDetail')} />
          </Link>
        </li>
      </ul>
    </div>
  );
}

/**
 * Le détail des biens à proposer : leurs quartiers distincts (« Biens à Mermoz et à Ouakam »), sinon leurs
 * titres. L'API ne sert pas le type des biens (TCK-2855, `sample` : id, titre, quartier) : « Studios » de la
 * maquette n'est pas rendable, « Biens » le remplace.
 */
function detailDuRapprochement(
  sample: NonNullable<SuggestionsDeLaJournee['matches']>['sample'],
  t: ReturnType<typeof useTranslations<'journee.libre'>>,
): string {
  const quartiers = [...new Set(sample.map((b) => b.neighborhood?.trim()).filter((q): q is string => Boolean(q)))];
  // La conjonction vient du dictionnaire : le wolof porte le texte français, qu'`Intl.ListFormat('wo')` joindrait sans « et ».
  const liste = (elements: string[]) => (elements.length <= 1 ? (elements[0] ?? '') : t('liste', { debut: elements.slice(0, -1).join(', '), fin: elements[elements.length - 1] as string }));
  if (quartiers.length > 0) return t('proposerQuartiers', { lieux: liste(quartiers.map((q) => t('aLieu', { lieu: q }))) });
  const titres = sample.map((b) => b.title?.trim()).filter((x): x is string => Boolean(x));
  return titres.length > 0 ? titres.join(' · ') : t('proposerDetail');
}
