'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * TCK-253 — Deferred minimal-profile sheet for Customers.
 *
 * Renders a right-side drawer with three optional fields (phone, city,
 * search_intent). Both "Plus tard" and "Enregistrer" close the sheet and
 * trigger persistence (`onClose`) so the consumer can mark the
 * `customer-profile-minimal` welcome key as seen exactly once.
 *
 * The sensitive action that triggered the sheet keeps running in
 * parallel — this component never blocks anything.
 */

export type SearchIntent = 'rent' | 'buy' | 'both';

export type MinimalProfilePayload = {
  phone?: string;
  city?: string;
  search_intent?: SearchIntent;
};

export type CustomerMinimalProfileSheetProps = {
  open: boolean;
  /** Called whenever the sheet leaves the screen (skip, save, Esc, backdrop). */
  onClose: () => void;
  /**
   * Persists the supplied non-empty fields. The component awaits the promise
   * to keep the spinner visible and surface failures inline; rejection keeps
   * the sheet open so the user can retry.
   */
  onSave: (payload: MinimalProfilePayload) => Promise<void>;
};

export function CustomerMinimalProfileSheet({
  open,
  onClose,
  onSave,
}: CustomerMinimalProfileSheetProps) {
  const t = useTranslations('customer.minimalProfile');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [intent, setIntent] = useState<SearchIntent | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Drive the inputs from local state. We intentionally do NOT prefill
  // from the current user — the sheet is shown precisely because we don't
  // yet have these values, and prefilling would create silent surprise on
  // submit ("I didn't enter anything, what got saved?").

  const handleOpenChange = (next: boolean) => {
    // Treat any dismissal (Esc, backdrop click, close button) as "skip".
    // The consumer is responsible for marking the welcome key on close.
    if (!next && !pending) onClose();
  };

  const handleSave = () => {
    setError(null);
    const payload: MinimalProfilePayload = {};
    const trimmedPhone = phone.trim();
    const trimmedCity = city.trim();
    if (trimmedPhone) payload.phone = trimmedPhone;
    if (trimmedCity) payload.city = trimmedCity;
    if (intent) payload.search_intent = intent;

    startTransition(async () => {
      try {
        // Empty submit is still a valid "completion" — the user explicitly
        // confirmed they have nothing to share. Skip the network round-trip.
        if (Object.keys(payload).length > 0) {
          await onSave(payload);
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('saveError'));
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        aria-label={t('title')}
        className={cn(
          // Override the default 18rem width — we need real form room.
          'w-full max-w-md sm:w-96',
          'flex flex-col gap-0 p-0',
        )}
      >
        <SheetHeader className="border-b border-stone-200 px-5 py-4">
          <SheetTitle data-testid="customer-minimal-profile-title">
            {t('title')}
          </SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="cmp-phone">{t('phoneLabel')}</Label>
            <Input
              id="cmp-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t('phonePlaceholder')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cmp-city">{t('cityLabel')}</Label>
            <Input
              id="cmp-city"
              type="text"
              autoComplete="address-level2"
              placeholder={t('cityPlaceholder')}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cmp-intent">{t('intentLabel')}</Label>
            <Select
              value={intent}
              onValueChange={(v) => setIntent(v as SearchIntent | '')}
              disabled={pending}
            >
              <SelectTrigger
                id="cmp-intent"
                className="w-full"
                data-testid="customer-minimal-profile-intent"
              >
                <SelectValue placeholder={t('intentPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rent">{t('intentRent')}</SelectItem>
                <SelectItem value="buy">{t('intentBuy')}</SelectItem>
                <SelectItem value="both">{t('intentBoth')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="customer-minimal-profile-error"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-5 py-4">
          <DialogPrimitive.Close
            render={
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                data-testid="customer-minimal-profile-skip"
              >
                {t('skip')}
              </Button>
            }
          />
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending}
            data-testid="customer-minimal-profile-save"
          >
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
