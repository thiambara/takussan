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
  }

  return (
    <li className="flex justify-center">
      <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
        {text}
      </span>
    </li>
  );
}
