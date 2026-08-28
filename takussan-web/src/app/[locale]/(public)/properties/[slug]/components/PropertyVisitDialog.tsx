'use client';
import { useMemo, useState } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { CalendarIcon, ClockIcon, MapPinIcon, VideoIcon, KeyIcon, SparklesIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useVisitRequest } from '@/hooks/useVisitRequest';
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

const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let hour = 9; hour <= 19; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 19 && minute === 30) break;
      slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }
  return slots;
})();

/** Minimum lead-time before a slot is offered (avoids "now-ish" requests). */
const MIN_LEAD_MINUTES = 30;

function formatDateLabel(date: Date | undefined, repli: string): string {
  if (!date) return repli;
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * For a given date, return only slots that are still bookable. When the
 * date is today we filter out anything earlier than `now + MIN_LEAD_MINUTES`
 * so the user can't pick a time that's already in the past (or imminent).
 */
function availableSlotsForDate(date: Date | undefined): string[] {
  if (!date) return TIME_SLOTS;
  const now = new Date();
  if (!isSameDay(date, now)) return TIME_SLOTS;

  const cutoff = now.getHours() * 60 + now.getMinutes() + MIN_LEAD_MINUTES;
  return TIME_SLOTS.filter((slot) => {
    const [h, m] = slot.split(':').map((v) => Number.parseInt(v, 10));
    return h * 60 + m >= cutoff;
  });
}

export function PropertyVisitDialog({ slug, open, onOpenChange, onSuccess }: PropertyVisitDialogProps) {
  const t = useTranslations('property.visitDialog');
  const { user } = useAuth();
  const { submit, submitting, error } = useVisitRequest(slug);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState('10:00');
  const [type, setType] = useState<VisitType>('in_person');
  const [notes, setNotes] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // Recompute available slots whenever the picked date changes; if today
  // is selected, slots earlier than `now + MIN_LEAD_MINUTES` are dropped.
  const slots = useMemo(() => availableSlotsForDate(date), [date]);

  // Effective time, derived. If the previously-picked hour is no longer
  // available (eg. user just switched to today and 10:00 has passed), we
  // fall back to the first remaining slot — without an effect, so the
  // value stays consistent every render.
  const effectiveTime = slots.includes(time) ? time : (slots[0] ?? '');

  const todayHasNoSlots =
    date !== undefined && isSameDay(date, new Date()) && slots.length === 0;

  /**
   * `onSelect` from the calendar. When the user picks a new date we also
   * snap the chosen time to the first available slot for that date — so
   * switching to today never leaves a stale past hour selected.
   */
  function handleDateSelect(d: Date | undefined): void {
    setDate(d ?? undefined);
    if (d) {
      const next = availableSlotsForDate(d);
      if (next.length > 0 && !next.includes(time)) {
        setTime(next[0]);
      }
      setCalendarOpen(false);
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!date || !effectiveTime) return;
    const [hh, mm] = effectiveTime.split(':').map((v) => Number.parseInt(v, 10));
    const scheduled = new Date(date);
    scheduled.setHours(hh, mm, 0, 0);
    const scheduledAt = scheduled.toISOString();
    try {
      await submit({
        scheduled_at: scheduledAt,
        type,
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // error already tracked by hook
    }
  }

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('loginTitle')}</DialogTitle>
            <DialogDescription>{t('loginBody')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <LienLocalise
              href={`/auth/login?redirect=/properties/${slug}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 h-8 text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              {t('signIn')}
            </LienLocalise>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const activeType = VISIT_TYPES.find((t) => t.value === type) ?? VISIT_TYPES[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
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
                  <span className="capitalize">{formatDateLabel(date, t('pickDate'))}</span>
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

            <div className="space-y-1.5">
              <label htmlFor="visit-time" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('timeLabel')}
              </label>
              <Select
                value={effectiveTime}
                onValueChange={(v) => setTime((v as string) ?? slots[0] ?? '')}
                items={slots.map((slot) => ({ value: slot, label: slot }))}
                disabled={slots.length === 0}
              >
                <SelectTrigger
                  id="visit-time"
                  className="w-full data-[size=default]:h-10 sm:w-30"
                >
                  <ClockIcon className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {todayHasNoSlots && (
            <p className="-mt-2 text-xs text-muted-foreground">{t('noSlotsToday')}</p>
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
                      'group flex items-start gap-2.5 rounded-lg p-3 text-left text-sm transition-all',
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
                      <span className={cn('font-medium leading-tight', selected ? 'text-foreground' : 'text-foreground')}>
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

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !date || !effectiveTime}>
              {submitting ? t('sending') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
