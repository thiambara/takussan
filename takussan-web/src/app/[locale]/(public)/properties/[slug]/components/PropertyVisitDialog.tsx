'use client';
import { useMemo, useState } from 'react';
import { CalendarIcon, ClockIcon, MapPinIcon, VideoIcon, KeyIcon, SparklesIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useVisitRequest } from '@/hooks/useVisitRequest';
import { MentionDeConfidentialite } from '@/components/public/MentionDeConfidentialite';
import { arrivee } from '@/lib/attribution';
import { lireCoordonnees, retenirCoordonnees } from '@/lib/coordonnees-retenues';
import { instantADakar, jourChoisi } from '@/lib/visites/heure-de-dakar';
import { useCreneaux } from '@/lib/visites/useCreneaux';
import type { VisitType } from '@/types/visit';
import { cn } from '@/lib/utils';

interface PropertyVisitDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const VISIT_TYPES: Array<{ value: VisitType; Icon: typeof MapPinIcon }> = [
  { value: 'in_person', Icon: MapPinIcon },
  { value: 'virtual', Icon: VideoIcon },
  { value: 'self_guided', Icon: KeyIcon },
  { value: 'hybrid', Icon: SparklesIcon },
];

const TELEPHONE_RE = /^\+\d{8,15}$/;

function formatDateLabel(date: Date | undefined, locale: string, repli: string): string {
  if (!date) return repli;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * TCK-590 — demander une visite ne demande plus de compte.
 *
 * La boîte n'offrait que « Se connecter » au visiteur anonyme, alors que l'API acceptait déjà
 * nom + téléphone : la demande de visite était fermée à tout le public sans compte. Elle est
 * ouverte — nom et téléphone suffisent, e-mail facultatif ; la barrière est le limiteur de l'API.
 *
 * L'heure se construit à DAKAR (`lib/visites/heure-de-dakar.ts`) : 10:00 choisi depuis Paris est
 * 10:00 à Dakar, pas 10:00 à Paris. Après l'envoi, un écran dit ce qui va se passer.
 */
export function PropertyVisitDialog({ slug, open, onOpenChange, onSuccess }: PropertyVisitDialogProps) {
  const t = useTranslations('property.visitDialog');
  const tVisit = useTranslations('propertyContact.visit');
  const locale = useLocale();
  const { user } = useAuth();
  const { submit, submitting, error } = useVisitRequest(slug);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [type, setType] = useState<VisitType>('in_person');
  const [notes, setNotes] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [name, setName] = useState(() => lireCoordonnees().name);
  const [phone, setPhone] = useState(() => lireCoordonnees().phone);
  const [email, setEmail] = useState('');
  const [erreurs, setErreurs] = useState<Partial<Record<'name' | 'phone', string>>>({});
  const [envoyee, setEnvoyee] = useState<{ when: string; phone: string; email: string } | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const jour = date ? jourChoisi(date) : null;
  const creneaux = useCreneaux(slug, jour);
  const libres = creneaux.etat === 'charge' ? creneaux.creneaux.filter((c) => c.available) : [];
  // Le créneau retenu n'est valable que s'il est encore libre ce jour-là.
  const heure = libres.some((c) => c.label === choisi) ? choisi : null;
  const aucunLibre = creneaux.etat === 'charge' && libres.length === 0;

  function handleDateSelect(d: Date | undefined): void {
    setDate(d ?? undefined);
    if (d) setCalendarOpen(false);
  }

  function fermer(next: boolean): void {
    if (!next) setEnvoyee(null);
    onOpenChange(next);
  }

  function valider(): boolean {
    if (user) return true;
    const next: typeof erreurs = {};
    if (!name.trim()) next.name = tVisit('nameRequired');
    if (!TELEPHONE_RE.test(phone)) next.phone = tVisit('phoneRequired');
    setErreurs(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!jour || !heure || !valider()) return;
    const courriel = email.trim();
    try {
      await submit({
        scheduled_at: instantADakar(jour, heure),
        type,
        notes: notes.trim() || undefined,
        ...(user
          ? {}
          : {
              visitor_name: name.trim(),
              visitor_phone: phone,
              visitor_email: courriel || undefined,
            }),
        ...arrivee(),
      });
      if (!user) retenirCoordonnees({ name: name.trim(), phone });
      setEnvoyee({
        when: `${formatDateLabel(date, locale, '')} · ${heure} (${tVisit('dakarTime')})`,
        phone,
        email: user ? '' : courriel,
      });
      onSuccess?.();
    } catch {
      // error already tracked by hook
    }
  }

  if (envoyee) {
    return (
      <Dialog open={open} onOpenChange={fermer}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tVisit('done.title')}</DialogTitle>
            <DialogDescription>
              {user
                ? tVisit('done.bodyAccount', { when: envoyee.when })
                : tVisit('done.bodySms', { when: envoyee.when, phone: envoyee.phone })}
            </DialogDescription>
          </DialogHeader>
          {envoyee.email ? (
            <p className="text-sm text-muted-foreground">{tVisit('done.bodyEmail', { email: envoyee.email })}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" onClick={() => fermer(false)}>
              {tVisit('done.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const activeType = VISIT_TYPES.find((v) => v.value === type) ?? VISIT_TYPES[0];

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="visit-date" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('dateLabel')}
            </label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    id="visit-date"
                    variant="outline"
                    className={cn(
                      'h-10 w-full justify-start gap-2 px-3 text-left font-normal',
                      !date && 'text-muted-foreground',
                    )}
                  />
                }
              >
                <CalendarIcon className="size-4 text-muted-foreground" />
                <span className="inline-block first-letter:uppercase">
                  {formatDateLabel(date, locale, t('pickDate'))}
                </span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={handleDateSelect}
                  disabled={{ before: today }}
                  defaultMonth={date ?? today}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {jour && (
            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ClockIcon className="size-3.5" aria-hidden />
                {t('timeLabel')}
                <span className="font-normal normal-case">({tVisit('dakarTime')})</span>
              </legend>
              {creneaux.etat === 'attente' && (
                <p className="text-xs text-muted-foreground">{tVisit('slotsLoading')}</p>
              )}
              {creneaux.etat === 'erreur' && (
                <p role="alert" className="text-xs text-destructive">{tVisit('slotsError')}</p>
              )}
              {aucunLibre && <p className="text-xs text-muted-foreground">{tVisit('noSlots')}</p>}
              {creneaux.etat === 'charge' && (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {creneaux.creneaux.map((c) => {
                    const actif = c.label === heure;
                    return (
                      <button
                        type="button"
                        key={c.start}
                        disabled={!c.available}
                        aria-pressed={actif}
                        aria-label={c.available ? c.label : tVisit('slotTaken', { time: c.label })}
                        onClick={() => setChoisi(c.label)}
                        className={cn(
                          'h-9 rounded-md text-sm tabular-nums ring-1 transition-colors',
                          actif
                            ? 'bg-primary text-primary-foreground ring-primary'
                            : 'bg-background ring-foreground/10 hover:bg-muted/60',
                          'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:line-through',
                        )}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>
          )}

          {!user && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="visit-name" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tVisit('nameLabel')}
                </label>
                <Input
                  id="visit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  aria-invalid={erreurs.name ? true : undefined}
                />
                {erreurs.name && <p className="text-xs text-destructive">{erreurs.name}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="visit-phone" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tVisit('phoneLabel')}
                </label>
                <PhoneInput
                  id="visit-phone"
                  value={phone}
                  onValueChange={setPhone}
                  autoComplete="tel"
                  aria-invalid={erreurs.phone ? true : undefined}
                />
                {erreurs.phone && <p className="text-xs text-destructive">{erreurs.phone}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="visit-email" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tVisit('emailLabel')}{' '}
                  <span className="font-normal normal-case text-muted-foreground/70">{tVisit('optional')}</span>
                </label>
                <Input
                  id="visit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('typeLegend')}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {VISIT_TYPES.map(({ value, Icon }) => {
                const selected = value === type;
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setType(value)}
                    aria-pressed={selected}
                    className={cn(
                      'group flex items-start gap-2.5 rounded-lg p-3 text-left text-sm transition-[background-color,border-color,color,box-shadow]',
                      'ring-1 ring-foreground/10 hover:bg-muted/60',
                      selected
                        ? 'bg-primary/10 ring-primary/40 shadow-sm'
                        : 'bg-background',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground group-hover:bg-foreground/10',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium leading-tight text-foreground">
                        {t(`types.${value}.label`)}
                      </span>
                      <span className="text-xs leading-snug text-muted-foreground">
                        {t(`types.${value}.description`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="sr-only" aria-live="polite">
              {t('typeSelected', { label: t(`types.${activeType.value}.label`) })}
            </p>
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="visit-notes" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('notesLabel')}{' '}
              <span className="font-normal normal-case text-muted-foreground/70">
                {t('notesOptional')}
              </span>
            </label>
            <Textarea
              id="visit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={3}
              maxLength={1000}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20"
            >
              {error}
            </div>
          )}

          {!user && <MentionDeConfidentialite />}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => fermer(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !jour || !heure}>
              {submitting ? t('sending') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
