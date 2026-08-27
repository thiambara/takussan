'use client';

import { useTranslations } from 'next-intl';
import { ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConversationParticipant } from '@/types/message';

interface ParticipantRowProps {
  readonly participant: ConversationParticipant;
  readonly isSelf: boolean;
  readonly canManage: boolean;
  readonly onRemove?: (userId: number) => void;
  readonly onPromote?: (userId: number) => void;
  readonly onDemote?: (userId: number) => void;
  readonly busy?: boolean;
}

/**
 * TCK-085 — Single member of a group conversation, with role badge and
 * admin actions exposed when {@link canManage} is true.
 */
export function ParticipantRow({
  participant,
  isSelf,
  canManage,
  onRemove,
  onPromote,
  onDemote,
  busy,
}: ParticipantRowProps) {
  const t = useTranslations('messaging.group.info');
  const initials = (participant.user?.full_name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
        <span className="absolute inset-0 flex items-center justify-center">
          {initials}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          {participant.user?.full_name ?? `#${participant.user_id}`}
          {isSelf && <span className="ml-1 text-xs text-muted-foreground">({t('you')})</span>}
        </p>
        {participant.user?.email && (
          <p className="truncate text-xs text-muted-foreground">{participant.user.email}</p>
        )}
      </div>
      <Badge
        variant={participant.role === 'admin' ? 'default' : 'secondary'}
        className={cn('shrink-0 text-[10px] uppercase')}
      >
        {participant.role === 'admin' ? t('roleAdmin') : t('roleMember')}
      </Badge>
      {canManage && !isSelf && (
        <div className="flex shrink-0 items-center gap-1">
          {participant.role === 'member' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={() => onPromote?.(participant.user_id)}
              aria-label={t('promote')}
              title={t('promote')}
            >
              <ShieldCheck className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={() => onDemote?.(participant.user_id)}
              aria-label={t('demote')}
              title={t('demote')}
            >
              <UserPlus className="size-4 rotate-180" aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => onRemove?.(participant.user_id)}
            aria-label={t('remove')}
            title={t('remove')}
          >
            <UserMinus className="size-4 text-destructive" aria-hidden />
          </Button>
        </div>
      )}
    </li>
  );
}
