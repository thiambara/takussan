import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';
import { SystemMessageBubble } from '../SystemMessageBubble';
import type { Message } from '@/types/message';

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <ul>{ui}</ul>
    </NextIntlClientProvider>
  );
}

function mkSys(event: string, meta: Record<string, unknown>): Message {
  return {
    id: 1,
    conversation_id: 1,
    sender_id: null,
    content: '—',
    type: 'system',
    attachments: [],
    metadata: { event, ...meta } as Message['metadata'],
    created_at: '2026-04-24T10:00:00Z',
    updated_at: '2026-04-24T10:00:00Z',
    sender: null,
  };
}

describe('<SystemMessageBubble>', () => {
  it('renders participant_added', () => {
    render(
      wrap(
        <SystemMessageBubble
          message={mkSys('participant_added', {
            actor_name: 'Alice',
            target_name: 'Bob',
          })}
        />,
      ),
    );
    expect(screen.getByText(/Alice a ajouté Bob au groupe/)).toBeInTheDocument();
  });

  it('renders renamed event', () => {
    render(
      wrap(
        <SystemMessageBubble
          message={mkSys('renamed', {
            actor_name: 'Alice',
            new_subject: 'Visites avril',
          })}
        />,
      ),
    );
    expect(screen.getByText(/Alice a renommé le groupe/)).toBeInTheDocument();
    expect(screen.getByText(/Visites avril/)).toBeInTheDocument();
  });

  it('falls back to message content when no event metadata', () => {
    render(
      wrap(
        <SystemMessageBubble
          message={{
            ...mkSys('participant_added', {}),
            metadata: null,
            content: 'unknown event',
          }}
        />,
      ),
    );
    expect(screen.getByText('unknown event')).toBeInTheDocument();
  });
});
