import { useLocale, useTranslations } from 'next-intl';
import { formatDayLabel } from '@/lib/messages/formatDayLabel';
import type { Locale } from '@/i18n/config';

export function MessageDateSeparator({ date }: { readonly date: Date }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('messaging.chat.dateSeparator');
  const label = formatDayLabel(date, locale, {
    today: t('today'),
    yesterday: t('yesterday'),
  });

  return (
    // TCK-2632 — un filet de part et d'autre du jour (maquette `app-messagerie`, `Fil`).
    <li className="my-2 flex items-center gap-3 text-xs text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      {label}
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </li>
  );
}
