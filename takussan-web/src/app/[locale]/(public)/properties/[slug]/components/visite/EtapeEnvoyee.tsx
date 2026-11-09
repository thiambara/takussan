'use client';
import { Bell, CalendarCheck, ChevronRight, CircleCheck, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DialogTitle } from '@/components/ui/dialog';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { cn } from '@/lib/utils';
import type { VisitWindow } from '@/types/visit';
import { RecapDuBien, type BienDeLaVisite } from './RecapDuBien';
import { useLibellesDeVisite } from './useLibellesDeVisite';

export interface DemandeEnvoyee {
  readonly jour: string;
  readonly tranche: VisitWindow;
  readonly name: string;
  readonly phone: string;
  /** Vide pour un compte : l'e-mail est celui du compte. */
  readonly email: string;
  readonly avecCompte: boolean;
}

interface EtapeEnvoyeeProps {
  readonly property: BienDeLaVisite;
  readonly demande: DemandeEnvoyee;
  /** Le nom de la personne qui reçoit la demande (`primary_contact`), s'il est connu. */
  readonly contactName?: string | null;
  /** Location au dossier (décision 3a) : le dossier est la prochaine action. */
  readonly onPrepareApplication?: () => void;
}

/** Les annonces comparables : même contrat, même ville, même quartier quand il est connu. */
function hrefDesBiensSimilaires(property: BienDeLaVisite): { href: string; lieu: string } | null {
  const { city, quarter } = property.location;
  if (!city) return null;
  const params = new URLSearchParams({ contract_type: property.contract_type === 'rent' ? 'rent' : 'sale', city });
  if (quarter) params.set('location', quarter);
  return { href: `/properties?${params.toString()}`, lieu: quarter ?? city };
}

/**
 * TCK-2503 — écran de suite : ce qui va se passer, puis la prochaine action.
 *
 * Rien n'y est promis que l'API ne tient : l'heure n'est PAS fixée (la tranche n'est jamais
 * affichée comme une heure), le rappel de la veille ne part qu'une fois l'heure fixée
 * (`SendPropertyVisitReminders` ne vise que les visites confirmées), et aucun délai de réponse
 * n'est annoncé — l'API n'en connaît pas.
 */
export function EtapeEnvoyee({ property, demande, contactName, onPrepareApplication }: EtapeEnvoyeeProps) {
  const t = useTranslations('property.visitDialog');
  const tVisit = useTranslations('propertyContact.visit');
  const libelles = useLibellesDeVisite();
  const quand = t('done.whenWindow', { day: libelles.jourLong(demande.jour), window: libelles.phrase(demande.tranche) });
  const similaires = hrefDesBiensSimilaires(property);

  const etapes = [
    {
      titre: contactName ? t('done.received', { name: contactName }) : t('done.receivedGeneric'),
      detail: t('done.now'),
    },
    {
      titre: t('done.proposes'),
      detail: demande.avecCompte ? t('done.subtitleAccount') : t('done.subtitleSms', { phone: demande.phone }),
    },
    { titre: t('done.reminder'), detail: t('done.reminderHint') },
  ];

  return (
    <div className="bg-background px-5 pb-4 pt-4">
      <div className="flex items-center gap-3 pr-10">
        <span className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-success text-success-foreground">
          <CircleCheck className="size-6" aria-hidden />
        </span>
        <DialogTitle className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {tVisit('done.title')}
        </DialogTitle>
      </div>
      {demande.email ? (
        <p className="mt-2 text-sm text-muted-foreground">{tVisit('done.bodyEmail', { email: demande.email })}</p>
      ) : null}

      <ol className="mt-3">
        {etapes.map((e, i) => (
          <li key={e.titre} className="relative flex gap-3 pb-2.5 last:pb-0">
            {i < etapes.length - 1 ? (
              <span className="absolute left-[11px] top-7 h-[calc(100%-24px)] w-px bg-border" aria-hidden />
            ) : null}
            <span
              className={cn(
                'mt-0.5 inline-flex size-6 flex-none items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                i === 0 ? 'bg-success text-success-foreground' : 'border border-border bg-card text-muted-foreground',
              )}
              aria-hidden
            >
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium leading-snug text-foreground">{e.titre}</p>
              <p className="text-[13px] leading-snug text-muted-foreground">{e.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 rounded-2xl border border-border bg-card p-3">
        <RecapDuBien property={property} compact className="bg-card" />
        <p className="mt-2.5 flex items-start gap-2 border-t border-border pt-2.5 text-sm leading-snug text-foreground">
          <CalendarCheck className="mt-0.5 size-4 flex-none text-primary" aria-hidden />
          <span>
            <span className="block font-medium">{quand}</span>
            {demande.name ? (
              <span className="block text-muted-foreground">{t('done.onBehalfOf', { name: demande.name })}</span>
            ) : null}
          </span>
        </p>
      </div>

      {onPrepareApplication || similaires ? (
        <>
          <h2 className="mt-4 text-[15px] font-semibold text-foreground">{t('done.meanwhile')}</h2>
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
            {onPrepareApplication ? (
              <li>
                <button
                  type="button"
                  onClick={onPrepareApplication}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <SuiteIcone Icone={FileText} />
                  <SuiteTexte titre={t('done.prepareFile')} detail={t('done.prepareFileHint')} />
                </button>
              </li>
            ) : null}
            {similaires ? (
              <li>
                <LienLocalise
                  href={similaires.href}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <SuiteIcone Icone={Bell} />
                  <SuiteTexte titre={t('done.alert')} detail={t('done.alertHint', { place: similaires.lieu })} />
                </LienLocalise>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function SuiteIcone({ Icone }: { readonly Icone: typeof Bell }) {
  return (
    <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-secondary text-secondary-foreground">
      <Icone className="size-5" aria-hidden />
    </span>
  );
}

function SuiteTexte({ titre, detail }: { readonly titre: string; readonly detail: string }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug text-foreground">{titre}</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden />
    </>
  );
}
