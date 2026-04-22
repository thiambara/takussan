'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';
import { setLocaleAction } from '@/app/actions/locale';
import {
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT,
  type Locale,
} from '@/i18n/config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type LanguageSwitcherProps = {
  className?: string;
  variant?: 'compact' | 'labelled';
};

/**
 * Compact dropdown for switching between {@link LOCALES}. The current locale
 * is persisted in the `NEXT_LOCALE` cookie via the `setLocaleAction` server
 * action, which then revalidates the layout so messages reload on the next
 * render.
 */
export function LanguageSwitcher({ className, variant = 'compact' }: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('common.languageSwitcher');
  const [isPending, startTransition] = useTransition();

  const handleSelect = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('label')}
        disabled={isPending}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium outline-none ring-1 ring-black/5 transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-app-topbar disabled:opacity-60',
          className,
        )}
      >
        <Globe className="size-4" aria-hidden="true" />
        {variant === 'labelled' ? (
          <span>{LOCALE_LABELS[locale]}</span>
        ) : (
          <span>{LOCALE_SHORT[locale]}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleSelect(code)}
            className={cn(
              'flex items-center justify-between gap-4',
              code === locale && 'font-semibold text-app-topbar',
            )}
            aria-current={code === locale ? 'true' : undefined}
          >
            <span>{LOCALE_LABELS[code]}</span>
            <span className="text-xs text-app-ink-muted">{LOCALE_SHORT[code]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
