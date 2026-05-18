'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * TCK-259 — Multi-select for an agent's intervention zones (cities or
 * neighbourhoods).
 *
 * Implementation choice : free-form chip input. We don't wire a `cities`
 * autocomplete catalog here — the codebase doesn't ship one yet, and
 * Senegal's neighbourhood granularity (Almadies / Plateau / Mermoz / …)
 * is best captured as agent-typed strings until a curated list lands.
 * When it does, swap the input for a Combobox without changing the
 * `value`/`onChange` contract.
 *
 *  - Add chip: type + Enter, or click the "+" button.
 *  - Remove chip: click the inline "X".
 *  - Suggestions: a small set of Dakar neighbourhoods are surfaced as
 *    one-click chips for discoverability.
 */
export type ZoneMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Optional pre-filled suggestions surfaced as one-click pills. */
  suggestions?: string[];
  /** Optional id for the visible label. */
  labelHtmlFor?: string;
};

const DEFAULT_SUGGESTIONS = [
  'Dakar',
  'Almadies',
  'Plateau',
  'Mermoz',
  'Ngor',
  'Yoff',
  'Sicap Liberté',
  'Saly',
  'Thiès',
];

export function ZoneMultiSelect({
  value,
  onChange,
  placeholder,
  suggestions = DEFAULT_SUGGESTIONS,
  labelHtmlFor,
}: ZoneMultiSelectProps) {
  const t = useTranslations('agents.onboarding.steps.specialization');
  const [draft, setDraft] = useState('');

  const append = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === '') return;
      // Case-insensitive de-dup so "Dakar" / "dakar" don't both stick.
      const lower = trimmed.toLowerCase();
      if (value.some((v) => v.toLowerCase() === lower)) return;
      onChange([...value, trimmed]);
    },
    [onChange, value],
  );

  const remove = useCallback(
    (zone: string) => {
      onChange(value.filter((v) => v !== zone));
    },
    [onChange, value],
  );

  const visibleSuggestions = useMemo(
    () => suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())),
    [suggestions, value],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1">
          {labelHtmlFor ? (
            <Label htmlFor={labelHtmlFor}>{t('zonesLabel')}</Label>
          ) : null}
          <Input
            id={labelHtmlFor}
            value={draft}
            placeholder={placeholder ?? t('zonesPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                append(draft);
                setDraft('');
              }
            }}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              append(draft);
              setDraft('');
            }}
            disabled={draft.trim() === ''}
          >
            <Plus className="size-4" aria-hidden />
            <span className="ml-1">{t('zonesAdd')}</span>
          </Button>
        </div>
      </div>

      {value.length > 0 ? (
        <ul
          aria-label={t('zonesSelectedAria')}
          data-testid="zone-multi-select-chips"
          className="flex flex-wrap gap-2"
        >
          {value.map((zone) => (
            <li
              key={zone}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
            >
              <span>{zone}</span>
              <button
                type="button"
                aria-label={t('zonesRemoveAria', { zone })}
                onClick={() => remove(zone)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {visibleSuggestions.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('zonesSuggestions')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {visibleSuggestions.slice(0, 8).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => append(s)}
                className={cn(
                  'rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground',
                  'hover:border-primary hover:text-foreground',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
