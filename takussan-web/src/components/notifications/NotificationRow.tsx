'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { AppNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

import { useTexteNotification } from './texteNotification';

type NotificationRowProps = {
  readonly notification: AppNotification;
  /** Appelé au clic sur une ligne NON LUE qui mène quelque part : elle est marquée lue. */
  readonly onOpen: (notification: AppNotification) => void;
  readonly onToggleRead: (notification: AppNotification) => void;
  readonly pending?: boolean;
  /** `bell` : corps tronqué à deux lignes ; `page` : corps entier. */
  readonly variant?: 'bell' | 'page';
};

/**
 * TCK-588 — une ligne de notification, partagée par la cloche et l'historique.
 *
 * La ligne ENTIÈRE est le lien vers `target.path` (le bouton lu/non lu reste à côté, jamais dans
 * le lien : deux éléments interactifs imbriqués ne sont pas atteignables au clavier). Sans cible,
 * la ligne n'est pas un lien — une notification qui ne mène nulle part ne se fait pas passer pour
 * un lien. Les deux cibles font au moins 44 px.
 */
export function NotificationRow({
  notification,
  onOpen,
  onToggleRead,
  pending = false,
  variant = 'bell',
}: NotificationRowProps) {
  const t = useTranslations('nav.notifications');
  const texte = useTexteNotification()(notification);
  const fmt = useFormatteurs();
  const unread = !notification.read_at;
  const path = notification.target?.path;

  const contenu = (
    <>
      <span className="block text-sm font-semibold text-pretty text-foreground">{texte.titre}</span>
      {texte.corps ? (
        <span
          className={cn(
            'mt-1 block text-xs text-muted-foreground',
            variant === 'bell' ? 'line-clamp-2' : 'text-pretty',
          )}
        >
          {texte.corps}
        </span>
      ) : null}
      <span className="mt-2 block text-xs tabular-nums text-muted-foreground">
        {fmt.dateTime(notification.created_at, { dateStyle: 'short', timeStyle: 'short' })}
      </span>
    </>
  );

  return (
    <li className={cn('flex items-stretch gap-1', unread ? 'bg-muted/60' : 'bg-card')}>
      {path ? (
        <Link
          href={path}
          onClick={() => onOpen(notification)}
          className="min-h-11 min-w-0 flex-1 px-4 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {contenu}
        </Link>
      ) : (
        <div className="min-w-0 flex-1 px-4 py-3">{contenu}</div>
      )}
      <button
        type="button"
        className="my-1 mr-2 inline-flex min-h-11 shrink-0 items-center self-start rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        disabled={pending}
        onClick={() => onToggleRead(notification)}
      >
        {unread ? t('markRead') : t('markUnread')}
      </button>
    </li>
  );
}
