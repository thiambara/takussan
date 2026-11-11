'use client';
import { useId, useState, type ReactNode } from 'react';
import { CalendarDays, Clock, Moon, Sun, Sunrise } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { jourEnDateLocale } from '@/lib/jour-de-l-api';
import { jourChoisi } from '@/lib/visites/heure-de-dakar';
import { cn } from '@/lib/utils';
import type { VisitWindow } from '@/types/visit';
import { RecapDuBien, type BienDeLaVisite } from './RecapDuBien';
import { TRANCHES, bornesDuCalendrier, joursProposes, trancheEntamee } from './tranches';
import { useLibellesDeVisite } from './useLibellesDeVisite';

const ICONE_DE_TRANCHE: Record<VisitWindow, typeof Sun> = { morning: Sunrise, afternoon: Sun, evening: Moon };

interface EtapeQuandProps {
  readonly property: BienDeLaVisite;
  readonly jour: string | null;
  readonly tranche: VisitWindow | null;
  /** L'heure de la boîte, qui avance tant qu'elle est ouverte : une tranche qui commence se grise. */
  readonly maintenant: Date;
  readonly onJour: (jour: string) => void;
  readonly onTranche: (tranche: VisitWindow) => void;
  /** Les 422 de l'API, posés sur leur groupe (`date` ; `preferred_window` ou `scheduled_at`). */
  readonly erreurJour?: string;
  readonly erreurTranche?: string;
  readonly titreRef?: React.Ref<HTMLHeadingElement>;
}

/** Carte de choix exclusive : radio natif (flèches, un seul arrêt de tabulation), peinte en carte. */
function CarteDeChoix({
  name,
  value,
  checked,
  disabled = false,
  onSelect,
  children,
  className,
}: {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer rounded-xl border px-3.5 py-2.5 transition-colors duration-150',
        'has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring',
        checked
          ? 'border-foreground bg-foreground text-background'
          : disabled
            ? 'cursor-not-allowed border-border bg-muted text-muted-foreground'
            : 'border-border bg-card text-foreground hover:border-foreground',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      {children}
    </label>
  );
}

/**
 * TCK-2503 — écran 1 : QUAND. Trois jours proposés d'un geste, une autre date au calendrier, puis
 * une tranche de la journée. Les tranches déjà entamées aujourd'hui (Dakar) sont grisées : l'API
 * les refuserait (`visits.window_started`).
 */
export function EtapeQuand({
  property,
  jour,
  tranche,
  maintenant,
  onJour,
  onTranche,
  erreurJour,
  erreurTranche,
  titreRef,
}: EtapeQuandProps) {
  const t = useTranslations('property.visitDialog');
  const libelles = useLibellesDeVisite();
  const id = useId();
  const [calendrierOuvert, setCalendrierOuvert] = useState(false);
  const proposes = joursProposes(maintenant);
  const bornes = bornesDuCalendrier(maintenant);
  const autreDate = jour !== null && !proposes.includes(jour) ? jour : null;

  return (
    <div className="space-y-6 bg-background px-4 pb-6 pt-4 md:px-5">
      <RecapDuBien property={property} />

      <fieldset aria-describedby={erreurJour ? `${id}-jour-erreur` : undefined}>
        <legend className="font-display text-lg font-semibold tracking-[-0.02em] text-foreground">
          <h2 ref={titreRef} tabIndex={-1} className="outline-none">
            {t('when.dayHeading')}
          </h2>
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {proposes.map((j) => (
            <CarteDeChoix key={j} name={`${id}-jour`} value={j} checked={jour === j} onSelect={() => onJour(j)}>
              <span className="leading-tight">
                <span className="block text-[0.9375rem] font-semibold">{libelles.titreDuJour(j, maintenant)}</span>
                <span className="block text-[0.8125rem]">{libelles.dateCourte(j)}</span>
              </span>
            </CarteDeChoix>
          ))}
          <Popover open={calendrierOuvert} onOpenChange={setCalendrierOuvert}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-pressed={autreDate !== null}
                  aria-label={autreDate ? t('when.otherDateChosen', { date: libelles.jourLong(autreDate) }) : undefined}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-150',
                    'outline-none focus-visible:ring-3 focus-visible:ring-ring',
                    autreDate
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-foreground hover:border-foreground',
                  )}
                />
              }
            >
              <CalendarDays className="size-5 flex-none" aria-hidden />
              <span className="leading-tight">
                <span className="block text-[0.9375rem] font-semibold">
                  {autreDate ? libelles.titreDuJour(autreDate, maintenant) : t('when.otherDate')}
                </span>
                <span className="block text-[0.8125rem]">
                  {autreDate ? libelles.dateCourte(autreDate) : t('when.otherDateHint')}
                </span>
              </span>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={jour ? jourEnDateLocale(jour) : undefined}
                onSelect={(d) => {
                  if (!d) return;
                  onJour(jourChoisi(d));
                  setCalendrierOuvert(false);
                }}
                disabled={[{ before: jourEnDateLocale(bornes.premier) }, { after: jourEnDateLocale(bornes.dernier) }]}
                defaultMonth={jourEnDateLocale(jour ?? bornes.premier)}
              />
            </PopoverContent>
          </Popover>
        </div>
        {erreurJour ? (
          <p id={`${id}-jour-erreur`} role="alert" className="mt-2 text-sm text-destructive">
            {erreurJour}
          </p>
        ) : null}
      </fieldset>

      <fieldset aria-describedby={erreurTranche ? `${id}-tranche-erreur` : `${id}-tranche-aide`}>
        <legend className="font-display text-lg font-semibold tracking-[-0.02em] text-foreground">
          <h2>{t('when.windowHeading')}</h2>
        </legend>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {TRANCHES.map((tr) => {
            const Icone = ICONE_DE_TRANCHE[tr];
            const entamee = jour !== null && trancheEntamee(jour, tr, maintenant);
            return (
              <CarteDeChoix
                key={tr}
                name={`${id}-tranche`}
                value={tr}
                checked={tranche === tr && !entamee}
                disabled={entamee}
                onSelect={() => onTranche(tr)}
                className="flex-col items-center justify-center gap-1 px-2 text-center"
              >
                <Icone className="size-5" aria-hidden />
                <span className="text-[0.9375rem] font-semibold leading-tight">{t(`windows.${tr}.label`)}</span>
                <span className="text-[0.8125rem] leading-tight">
                  {entamee ? t('when.windowStarted') : t(`windows.${tr}.range`)}
                </span>
              </CarteDeChoix>
            );
          })}
        </div>
        {erreurTranche ? (
          <p id={`${id}-tranche-erreur`} role="alert" className="mt-2 text-sm text-destructive">
            {erreurTranche}
          </p>
        ) : null}
        <p id={`${id}-tranche-aide`} className="mt-2.5 flex gap-2 text-[0.8125rem] text-muted-foreground">
          <Clock className="mt-px size-4 flex-none" aria-hidden />
          {t('when.windowHint')}
        </p>
      </fieldset>
    </div>
  );
}
