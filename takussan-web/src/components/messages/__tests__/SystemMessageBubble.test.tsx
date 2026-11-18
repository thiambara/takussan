import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';
import { CarteNeutreBubble, SystemMessageBubble } from '../SystemMessageBubble';
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

  // TCK-2958 — `content` n'est plus qu'un code : il n'est jamais montré.
  it('renders the generic label, never the content, when there is no metadata', () => {
    render(
      wrap(
        <SystemMessageBubble
          message={{
            ...mkSys('participant_added', {}),
            metadata: null,
            content: 'participant_added',
          }}
        />,
      ),
    );
    expect(screen.getByText('Le fil a été mis à jour.')).toBeInTheDocument();
    expect(screen.queryByText('participant_added')).not.toBeInTheDocument();
  });

  // TCK-671 (P06.02) — l'API émet `metadata.role` ; le front lisait `new_role`, absent, et rendait
  // « member » en jeton anglais brut pour tout changement de rôle.
  it('renders role_changed from metadata.role, translated', () => {
    render(wrap(<SystemMessageBubble message={mkSys('role_changed', { actor_name: 'Alice', target_name: 'Bob', role: 'admin' })} />));
    expect(screen.getByText('Alice a changé le rôle de Bob en Admin.')).toBeInTheDocument();
  });

  it('translates the member role', () => {
    render(wrap(<SystemMessageBubble message={mkSys('role_changed', { actor_name: 'Alice', target_name: 'Bob', role: 'member' })} />));
    expect(screen.getByText('Alice a changé le rôle de Bob en Membre.')).toBeInTheDocument();
  });

  // TCK-592, TCK-2958 — l'avis d'étape d'une intervention est un `event` : son code et ses données,
  // rendus dans la langue du lecteur.
  function mkEvent(code: string, data: Record<string, unknown>, content = code): Message {
    return {
      ...mkSys('participant_added', {}),
      type: 'event',
      content,
      metadata: { object: { type: 'maintenance_request', id: 9 }, code, data } as Message['metadata'],
    };
  }

  it('renders a maintenance assignment from its code', () => {
    render(wrap(<SystemMessageBubble message={mkEvent('maintenance.assigned', { status: 'open', provider_name: 'Awa' })} />));
    expect(screen.getByText('Intervention confiée à Awa.')).toBeInTheDocument();
  });

  it('renders a maintenance step from its status', () => {
    render(wrap(<SystemMessageBubble message={mkEvent('maintenance.quote_awaiting_owner', { status: 'awaiting_owner' })} />));
    expect(screen.getByText('Statut : En attente du bailleur.')).toBeInTheDocument();
  });

  it('renders the step in the reader’s language', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ul>
          <SystemMessageBubble message={mkEvent('maintenance.transition', { status: 'in_progress' })} />
        </ul>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Status: In progress.')).toBeInTheDocument();
  });

  it('never shows the raw code of an unknown event', () => {
    render(wrap(<SystemMessageBubble message={mkEvent('lease.signed', { status: 'y' })} />));
    expect(screen.getByText('Le fil a été mis à jour.')).toBeInTheDocument();
    expect(screen.queryByText('lease.signed')).not.toBeInTheDocument();
  });

  it('renders an unknown maintenance status with the generic label', () => {
    render(wrap(<SystemMessageBubble message={mkEvent('maintenance.transition', { status: 'y' })} />));
    expect(screen.getByText('Le fil a été mis à jour.')).toBeInTheDocument();
  });
});

describe('<CarteNeutreBubble>', () => {
  it('renders a neutral line', () => {
    render(wrap(<CarteNeutreBubble />));
    expect(screen.getByText('Un objet a été partagé.')).toBeInTheDocument();
  });
});
