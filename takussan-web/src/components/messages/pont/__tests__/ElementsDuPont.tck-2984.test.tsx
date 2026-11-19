/** TCK-2984 (ADR-0132) — le pont à l'écran de l'agent : rien pour le locataire, la fenêtre, l'invitation, les avis. */
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import fr from '@/messages/fr.json';
import type { Message, PontDuParticipant } from '@/types/message';
import { participantsDuPont } from '../pont';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
const { BandeauDeLaFenetre, ParticipantsEtCanaux, PontDuMessage, PucesDuPont, TraceDuLien } = await import('../ElementsDuPont');
const { useTexteMessageSysteme } = await import('../../useTexteMessageSysteme');

const MAINTENANT = Date.parse('2026-11-19T10:00:00Z');
const NOMS = { 7: 'Awa Diop', 9: 'Moussa Fall' };
const TELEPHONE = '+221 77 123 45 67';

const monter = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
};

/** La réponse de test, telle que le personnel la reçoit (relais, canal, trace du lien). */
const messageDuPersonnel = (): Message => ({
  id: 1,
  conversation_id: 3,
  sender_id: 2,
  content: 'Le plombier passe jeudi.',
  type: 'text',
  attachments: [],
  created_at: '2026-11-19T09:00:00Z',
  updated_at: '2026-11-19T09:00:00Z',
  channel: 'app',
  relays: [{ user_id: 7, channel: 'whatsapp', form: 'text', status: 'remis', at: '2026-11-19T09:01:00Z' }],
  action_link: { sent_at: '2026-11-19T09:01:00Z', opened_at: '2026-11-19T09:05:00Z', used_at: null, expires_at: '2026-11-20T09:01:00Z' },
} as Message);

/** La même réponse, telle que l'API la rend au locataire : ni `channel`, ni `relays`, ni `action_link`. */
const pourLeLocataire = (m: Message): Message => {
  const { channel: _c, relays: _r, action_link: _a, ...reste } = m;
  return reste as Message;
};

const participant = (user_id: number, pont: PontDuParticipant) => ({ user_id, pont });
/** Le contexte tel que l'API le rend au locataire : sans clé `pont`. */
const SANS_PONT = participantsDuPont({});

describe('AC2 — rien du pont pour qui ne le reçoit pas', () => {
  it('le personnel voit l’état du relais et la trace du lien', () => {
    monter(<><PontDuMessage message={messageDuPersonnel()} noms={NOMS} /><TraceDuLien message={messageDuPersonnel()} /></>);
    expect(screen.getByTestId('relais').textContent).toContain('Awa Diop par WhatsApp');
    expect(screen.getByTestId('etat-du-relais').textContent).toBe('remis');
    expect(screen.getByTestId('etat-du-relais').dataset.tone).toBe('info');
    expect(screen.getByTestId('trace-du-lien').textContent).toMatch(/Lien envoyé à .*ouvert à/);
  });

  it('le locataire, depuis la même réponse sans les clés du pont, ne voit rien', () => {
    const { container } = monter(
      <>
        <PontDuMessage message={pourLeLocataire(messageDuPersonnel())} noms={NOMS} />
        <TraceDuLien message={pourLeLocataire(messageDuPersonnel())} />
        <ParticipantsEtCanaux conversationId={3} participants={SANS_PONT} noms={NOMS} maintenant={MAINTENANT} />
        <BandeauDeLaFenetre participants={SANS_PONT} noms={NOMS} maintenant={MAINTENANT} />
      </>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('un message reçu par un canal inconnu se rend par le libellé générique', () => {
    monter(<PontDuMessage message={{ ...messageDuPersonnel(), relays: [], channel: 'telegram' }} noms={NOMS} />);
    expect(screen.getByTestId('puce-de-canal').textContent).toBe('par une autre messagerie');
  });

  it('une note d’équipe ne montre rien du pont', () => {
    const { container } = monter(<PontDuMessage message={{ ...messageDuPersonnel(), visibility: 'team' }} noms={NOMS} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('AC3 — l’annonce du message type, jugée sur `fenetre_jusqu_a`', () => {
  it('fenêtre fermée pour un destinataire joint : le message partira en message type', () => {
    monter(<BandeauDeLaFenetre participants={[participant(7, { joint: true, invitable: false, fenetre_jusqu_a: '2026-11-18T08:00:00Z' })]} noms={NOMS} maintenant={MAINTENANT} />);
    expect(screen.getByTestId('bandeau-fenetre').dataset.etat).toBe('fermee');
    expect(screen.getByTestId('annonce-message-type').textContent).toContain('message type');
  });

  it('fenêtre ouverte : aucune annonce', () => {
    monter(<BandeauDeLaFenetre participants={[participant(7, { joint: true, invitable: false, fenetre_jusqu_a: '2026-11-19T20:00:00Z' })]} noms={NOMS} maintenant={MAINTENANT} />);
    expect(screen.getByTestId('bandeau-fenetre').dataset.etat).toBe('ouverte');
    expect(screen.queryByTestId('annonce-message-type')).toBeNull();
  });

  it('personne d’opposée (STOP) ni de non jointe : aucune annonce', () => {
    const { container } = monter(
      <BandeauDeLaFenetre
        participants={[participant(7, { joint: true, invitable: false, opposition_at: '2026-11-18T08:00:00Z' }), participant(9, { joint: false, invitable: true })]}
        noms={NOMS}
        maintenant={MAINTENANT}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('« Joindre par WhatsApp »', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('un seul appel, puis « invitation envoyée »', async () => {
    let resoudre: (v: unknown) => void = () => {};
    apiRequest.mockReturnValue(new Promise((r) => { resoudre = r; }));
    monter(<ParticipantsEtCanaux conversationId={3} participants={[participant(9, { joint: false, invitable: true })]} noms={NOMS} maintenant={MAINTENANT} />);
    const bouton = screen.getByRole('button', { name: 'Joindre par WhatsApp' });
    fireEvent.click(bouton);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    fireEvent.click(bouton);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(apiRequest.mock.calls[0][0]).toBe('/api/conversations/3/pont/invitations');
    resoudre({ data: {} });
    await waitFor(() => expect(screen.getByTestId('etat-pont').dataset.etat).toBe('invite'));
  });

  it.each([
    ['pont.opted_out', 'Cette personne a coupé WhatsApp'],
    ['pont.no_phone', 'Aucun numéro'],
    ['pont.numero_deja_a_un_compte', 'appartient déjà à un autre compte'],
    ['pont.nouveau_code', 'n’a pas pu partir'.replace('’', "'")],
  ])('le refus %s se dit par son code', async (code, texte) => {
    apiRequest.mockRejectedValue(new ApiError(422, { code }));
    monter(<ParticipantsEtCanaux conversationId={3} participants={[participant(9, { joint: false, invitable: true })]} noms={NOMS} maintenant={MAINTENANT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Joindre par WhatsApp' }));
    expect((await screen.findByTestId('refus-invitation')).textContent).toContain(texte);
  });

  it('`invitation_en_attente` (relu du contexte) : « invitation envoyée », sans bouton', () => {
    monter(<ParticipantsEtCanaux conversationId={3} participants={[participant(9, { joint: false, invitable: true, invitation_en_attente: true })]} noms={NOMS} maintenant={MAINTENANT} />);
    expect(screen.getByTestId('etat-pont').dataset.etat).toBe('invite');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('STOP : la puce barrée, la date, aucun bouton pour passer outre', () => {
    monter(<ParticipantsEtCanaux conversationId={3} participants={[participant(7, { joint: true, invitable: true, opposition_at: '2026-11-18T08:00:00Z' })]} noms={NOMS} maintenant={MAINTENANT} />);
    expect(screen.getByTestId('etat-pont').textContent).toContain('WhatsApp coupé par la personne le');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

it('AC4 — aucun numéro de téléphone dans le DOM du pont', () => {
  const avecNumero = { ...messageDuPersonnel(), content: 'x' };
  const { container } = monter(
    <>
      <PontDuMessage message={avecNumero} noms={NOMS} />
      <TraceDuLien message={avecNumero} />
      <ParticipantsEtCanaux conversationId={3} participants={[participant(7, { joint: true, invitable: false, fenetre_jusqu_a: '2026-11-19T20:00:00Z' }), participant(9, { joint: false, invitable: true })]} noms={NOMS} maintenant={MAINTENANT} />
      <BandeauDeLaFenetre participants={[participant(7, { joint: true, invitable: false, fenetre_jusqu_a: '2026-11-18T08:00:00Z' })]} noms={NOMS} maintenant={MAINTENANT} />
    </>,
  );
  expect(container.textContent).not.toMatch(/\+?\d[\d\s]{7,}\d/);
  expect(container.textContent).not.toContain(TELEPHONE);
});

describe('les avis `pont.*` (useTexteMessageSysteme)', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="Africa/Dakar">{children}</NextIntlClientProvider>
  );
  it.each([
    ['pont.stop', 'whatsapp', 'a coupé le relais par WhatsApp'],
    ['pont.start', 'sms', 'a réactivé le relais par SMS'],
    ['pont.accord', 'whatsapp', 'accepté d’être jointe par WhatsApp'.replace('’', "'")],
    ['pont.media_non_relaye', 'telegram', 'par une autre messagerie'],
    ['pont.numero_deja_a_un_compte', 'whatsapp', 'appartient déjà à un compte'],
  ] as const)('%s', (event, channel, attendu) => {
    const { result } = renderHook(() => useTexteMessageSysteme(), { wrapper });
    expect(result.current({ event, channel, user_id: 7 })).toContain(attendu);
  });
});

describe('puces du pont au téléphone', () => {
  it('fenêtre fermée, STOP barré, jamais soi-même', () => {
    monter(
      <PucesDuPont
        participants={[
          participant(7, { joint: true, invitable: false, fenetre_jusqu_a: '2026-11-18T08:00:00Z' }),
          participant(9, { joint: true, invitable: false, opposition_at: '2026-11-18T08:00:00Z' }),
          participant(2, { joint: true, invitable: false, fenetre_jusqu_a: '2026-11-19T20:00:00Z' }),
        ]}
        noms={NOMS}
        moi={2}
        maintenant={MAINTENANT}
      />,
    );
    const puces = screen.getAllByTestId('puce-du-pont');
    expect(puces.map((p) => p.dataset.etat)).toEqual(['fermee', 'opposition']);
    expect(puces[0]!.textContent).toContain('Awa Diop');
    expect(screen.getByRole('img', { name: 'fenêtre de 24 h fermée' })).toBeTruthy();
    expect(puces[1]!.querySelector('s')?.textContent).toBe('par WhatsApp');
    expect(puces[1]!.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('danger');
  });

  it('le locataire (aucun bloc `pont`) : rien', () => {
    const { container } = monter(<PucesDuPont participants={SANS_PONT} noms={NOMS} maintenant={MAINTENANT} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('participantsDuPont — `context.pont` (TCK-2981) en liste', () => {
  it('clé absente : undefined ; présente : une ligne par user_id', () => {
    expect(participantsDuPont({})).toBeUndefined();
    expect(participantsDuPont(null)).toBeUndefined();
    expect(participantsDuPont({ pont: { '9': { joint: true, invitable: false, canal: 'sms' } } })).toEqual([
      { user_id: 9, pont: { joint: true, invitable: false, canal: 'sms' } },
    ]);
  });
});
