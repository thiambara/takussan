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
    <li className="my-2 flex justify-center" role="separator">
      <span className="rounded-full bg-muted/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
    </li>
  );
}
