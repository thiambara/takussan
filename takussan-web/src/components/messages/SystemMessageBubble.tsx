'use client';

import { useTranslations } from 'next-intl';
import type { Message } from '@/types/message';

interface SystemMessageBubbleProps {
  readonly message: Message;
}

/**
 * TCK-085 — Inline neutral system event in a group thread.
 * Renders e.g. "Alice a ajouté Bob au groupe."
 */
export function SystemMessageBubble({ message }: SystemMessageBubbleProps) {
  const t = useTranslations('messaging.system');
  const tMaintenance = useTranslations('messaging.maintenanceEvents');
  const tStatus = useTranslations('messaging.maintenanceEvents.statuses');
  const meta = message.metadata ?? {};
  const event = meta.event;

  let text = message.content;
  if (event === 'participant_added') {
    text = t('participantAdded', {
      actor: meta.actor_name ?? '—',
      target: meta.target_name ?? '—',
    });
  } else if (event === 'participant_removed') {
    text = t('participantRemoved', {
      actor: meta.actor_name ?? '—',
      target: meta.target_name ?? '—',
    });
  } else if (event === 'role_changed') {
    text = t('roleChanged', {
      actor: meta.actor_name ?? '—',
      target: meta.target_name ?? '—',
      role: meta.new_role ?? 'member',
    });
  } else if (event === 'renamed') {
    text = t('renamed', {
      actor: meta.actor_name ?? '—',
      subject: meta.new_subject ?? '—',
    });
  } else if (event === 'maintenance') {
    text = maintenanceText(meta, tMaintenance, tStatus) ?? message.content;
  }

  return (
    <li className="flex justify-center">
      <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
        {text}
      </span>
    </li>
  );
}

/**
 * TCK-592 — l'avis d'étape du fil d'une intervention. L'API envoie des CODES (`cause`, `status`) ;
 * le texte se rend ici, dans la langue du lecteur. `content` (langue par défaut du serveur) reste
 * le repli d'une cause que ce front ne connaîtrait pas encore.
 */
const PROVIDER_CAUSES = new Set(['assigned', 'unassigned', 'accepted', 'declined']);
const STATUS_KEYS = new Set([
  'open', 'acknowledged', 'quote_requested', 'quote_submitted', 'awaiting_owner', 'approved',
  'rejected', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled',
]);

function maintenanceText(
  meta: NonNullable<Message['metadata']>,
  t: (key: string, values?: Record<string, string>) => string,
  tStatus: (key: string) => string,
): string | null {
  if (meta.cause && PROVIDER_CAUSES.has(meta.cause)) {
    return t(meta.cause, { provider: meta.provider_name ?? '—' });
  }
  if (meta.status && STATUS_KEYS.has(meta.status)) {
    return t('status', { status: tStatus(meta.status) });
  }
  return null;
}
