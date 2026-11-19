/**
 * TCK-2972 (ADR-0130) — la carte d'un engagement, lue pour SON lecteur depuis la projection :
 *
 * · chaque geste n'apparaît qu'avec son `ability`, et appelle la route DE L'ENGAGEMENT (jamais une route
 *   de la messagerie) ;
 * · la réouverture (« Ce n'est pas fait ») exige un motif, et ne se montre que sur `abilities.reopen`
 *   (AC3), même repliée ;
 * · « Tenu ? » : « Oui, c'est fait » (`kept`) et « Pas encore » (`not-yet`) ;
 * · sous impersonation, aucun geste ;
 * · le texte des onze codes, et l'icône de leur ligne.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import type { Message } from '@/types/message';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
let impersonation = false;
vi.mock('@/lib/impersonation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/impersonation')>()),
  relaisImpersonationActif: () => impersonation,
}));
let moi = 30;
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: moi }, token: 't' }) }));
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ id, value, onValueChange }: { id?: string; value?: string; onValueChange: (v: string) => void }) => (
    <input id={id} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

const { CarteDuFil } = await import('../../cartes/CarteDuFil');
const { SystemMessageBubble } = await import('../../SystemMessageBubble');

const ASTOU = { id: 30, name: 'Astou Sy' };
const FATOU = { id: 40, name: 'Fatou Wade' };

function engagement(extra: Record<string, unknown> = {}) {
  return {
    id: 9,
    title: 'Repasser changer le siphon',
    status: 'open',
    etat: 'open',
    due_at: '2099-11-19T10:00:00+00:00',
    holder: ASTOU,
    beneficiary: FATOU,
    object: { type: 'maintenance_request', id: 4 },
    abilities: {},
    ...extra,
  };
}

function carte(object: Record<string, unknown>, code = 'commitment.noted', type: Message['type'] = 'card'): Message {
  return {
    id: 50,
    conversation_id: 7,
    sender_id: 11,
    sender: { id: 11, full_name: 'Sokhna Sène' } as Message['sender'],
    content: code,
    type,
    attachments: [],
    metadata: { object: { type: 'commitment', id: Number(object.id ?? 9) }, code, data: {} },
    object: object as Message['object'],
    action_attendue: type === 'event' ? true : undefined,
    created_at: '2026-11-18T11:40:00Z',
    updated_at: '2026-11-18T11:40:00Z',
  };
}

function monter(message: Message) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ul>
          <CarteDuFil message={message} conversationId={7} moi={false} auteur />
        </ul>
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({});
  impersonation = false;
  moi = 30;
});

/** Le geste, son libellé pour le lecteur, la route et la méthode attendues. */
const GESTES_DIRECTS = [
  { ability: 'confirm', etat: 'proposed', lecteur: 30, libelle: 'Je confirme', chemin: '/api/commitments/9/confirm', methode: 'POST' },
  { ability: 'keep', etat: 'open', lecteur: 30, libelle: 'C’est fait', chemin: '/api/commitments/9/kept', methode: 'POST' },
  { ability: 'keep', etat: 'open', lecteur: 11, libelle: 'Marquer comme tenu', chemin: '/api/commitments/9/kept', methode: 'POST' },
  { ability: 'remind', etat: 'late', lecteur: 11, libelle: 'Relancer maintenant', chemin: '/api/commitments/9/remind', methode: 'POST' },
  { ability: 'cancel', etat: 'open', lecteur: 11, libelle: 'Annuler l’engagement', chemin: '/api/commitments/9/cancel', methode: 'POST' },
] as const;

describe('TCK-2972 — les gestes de la carte, sur leurs seules abilities', () => {
  it.each(GESTES_DIRECTS)('« $libelle » ($ability) appelle sa route, et seulement avec son ability', async ({ ability, etat, lecteur, libelle, chemin, methode }) => {
    moi = lecteur;
    const { unmount } = monter(carte(engagement({ etat, abilities: { [ability]: false } })));
    expect(screen.queryByRole('button', { name: libelle })).toBeNull();
    unmount();

    monter(carte(engagement({ etat, abilities: { [ability]: true } })));
    fireEvent.click(screen.getByRole('button', { name: libelle }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(chemin, expect.objectContaining({ method: methode })));
    expect(apiRequest.mock.calls.some(([p]) => String(p).startsWith('/api/conversations'))).toBe(false);
  });

  it('« Accorder une nouvelle date » (update) envoie un PUT, et la date seule vaut la fin du jour à Dakar', async () => {
    moi = 11;
    const { unmount } = monter(carte(engagement({ abilities: { update: false } })));
    expect(screen.queryByRole('button', { name: 'Accorder une nouvelle date' })).toBeNull();
    unmount();
    monter(carte(engagement({ abilities: { update: true } })));
    fireEvent.click(screen.getByRole('button', { name: 'Accorder une nouvelle date' }));
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2099-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('/api/commitments/9', expect.objectContaining({ method: 'PUT', body: { due_at: '2099-12-01T23:59:59+00:00' } })),
    );
  });

  it('« Proposer une autre date » sur un engagement à confirmer confirme avec la nouvelle échéance, heure comprise', async () => {
    monter(carte(engagement({ etat: 'proposed', status: 'proposed', abilities: { confirm: true } })));
    expect(screen.getByText('Votre engagement')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Proposer une autre date' }));
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2099-12-02' } });
    fireEvent.change(screen.getByLabelText('Heure'), { target: { value: '10:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('/api/commitments/9/confirm', expect.objectContaining({ method: 'POST', body: { due_at: '2099-12-02T10:30:00+00:00' } })),
    );
  });

  it('un autre lecteur lit « Engagement de … », et le retard en jours dans l’encre d’alerte', () => {
    moi = 40;
    const hier = new Date(Date.now() - 5 * 86_400_000 - 3_600_000).toISOString();
    monter(carte(engagement({ etat: 'late', due_at: hier })));
    expect(screen.getByText('Engagement de Astou Sy')).toBeTruthy();
    const retard = screen.getByText('En retard de 5 jours');
    expect(retard.className).toContain('text-destructive');
    expect(screen.getByText('Envers vous')).toBeTruthy();
  });
});

describe('TCK-2972 — « Ce n’est pas fait » (AC3)', () => {
  it('replié (tenu), le geste n’apparaît qu’avec abilities.reopen', () => {
    moi = 40;
    monter(carte(engagement({ etat: 'kept', status: 'kept', abilities: { reopen: false } })));
    expect(screen.getByText('Tenu')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ce n’est pas fait' })).toBeNull();
  });

  it('la réouverture exige un motif d’au moins 3 caractères, puis appelle /reopen', async () => {
    moi = 40;
    monter(carte(engagement({ etat: 'kept', status: 'kept', abilities: { reopen: true } })));
    fireEvent.click(screen.getByRole('button', { name: 'Ce n’est pas fait' }));
    const envoyer = await screen.findByRole('button', { name: 'Rouvrir l’engagement' });
    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'ab' } });
    expect((envoyer as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(envoyer);
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'Le siphon fuit encore' } });
    expect((envoyer as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(envoyer);
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('/api/commitments/9/reopen', expect.objectContaining({ method: 'POST', body: { reason: 'Le siphon fuit encore' } })),
    );
  });
});

describe('TCK-2972 — un refus de l’API se lit', () => {
  it('422 commitment.due_in_past : la prose localisée de l’API, jamais une clé ni un blanc', async () => {
    const { ApiError } = await import('@/lib/api');
    apiRequest.mockRejectedValue(new ApiError(422, { message: 'L’échéance d’un engagement doit être à venir.', code: 'commitment.due_in_past' }));
    monter(carte(engagement({ etat: 'proposed', status: 'proposed', abilities: { confirm: true } })));
    fireEvent.click(screen.getByRole('button', { name: 'Proposer une autre date' }));
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2000-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((await screen.findByRole('alert')).textContent).toBe('L’échéance d’un engagement doit être à venir.');
  });
});

describe('TCK-2972 — « Tenu ? »', () => {
  it('le bénéficiaire lit la question, « Oui, c’est fait » → /kept, « Pas encore » → /not-yet', async () => {
    moi = 40;
    monter(carte(engagement({ etat: 'late', abilities: { keep: true, not_yet: true } }), 'commitment.check_requested', 'event'));
    expect(screen.getByText('Une question pour vous : l’engagement de Astou Sy est-il tenu ?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pas encore' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/commitments/9/not-yet', expect.objectContaining({ method: 'POST' })));
    fireEvent.click(screen.getByRole('button', { name: 'Oui, c’est fait' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/commitments/9/kept', expect.objectContaining({ method: 'POST' })));
  });
});

describe('TCK-2972 — sous impersonation, aucun geste', () => {
  it('toutes les abilities vraies : aucun bouton', () => {
    impersonation = true;
    monter(
      carte(engagement({ etat: 'proposed', abilities: { confirm: true, cancel: true, update: true, keep: true, reopen: true, not_yet: true, remind: true } })),
    );
    expect(within(screen.getByRole('article')).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('TCK-2972 — le texte des onze codes', () => {
  const TEXTES: Record<string, string> = {
    'commitment.noted': 'Engagement noté',
    'commitment.confirmed': 'Engagement confirmé',
    'commitment.due_soon': 'Rappel : l’échéance de l’engagement approche',
    'commitment.overdue': 'L’engagement est en retard',
    'commitment.reminded': 'Relance : l’engagement est en retard',
    'commitment.rescheduled': 'Engagement reporté au',
    'commitment.kept': 'Engagement tenu',
    'commitment.reopened': 'Engagement rouvert : ce n’est pas fait',
    'commitment.cancelled': 'Engagement annulé : l’objet est clos',
    'commitment.check_requested': '« Tenu ? » demandé',
    'commitment.not_kept_yet': 'Pas encore tenu',
  };
  it.each(Object.entries(TEXTES))('%s', (code, texte) => {
    const data: Record<string, string> = code === 'commitment.rescheduled' ? { due_at: '2099-12-01T10:00:00+00:00' } : code === 'commitment.cancelled' ? { reason: 'object_closed' } : {};
    render(
      withIntl(
        <ul>
          <SystemMessageBubble message={{ ...carte(engagement(), code, 'event'), metadata: { object: { type: 'commitment', id: 9 }, code, data } }} />
        </ul>,
      ),
    );
    expect(screen.getByText((t) => t.startsWith(texte))).toBeTruthy();
    expect(screen.getByTestId('icone-d-engagement')).toBeTruthy();
  });

  it('une annulation sans motif connu se dit sans motif', () => {
    render(
      withIntl(
        <ul>
          <SystemMessageBubble message={{ ...carte(engagement(), 'commitment.cancelled', 'event'), metadata: { object: { type: 'commitment', id: 9 }, code: 'commitment.cancelled', data: { reason: 'by_staff' } } }} />
        </ul>,
      ),
    );
    expect(screen.getByText('Engagement annulé')).toBeTruthy();
  });
});

describe('TCK-2972 — une suite d’événements d’engagement repliée porte l’icône', () => {
  it('repliée : la cloche du rappel en tête de la ligne ; dépliée : une icône par événement d’engagement', async () => {
    const { EvenementsReplies } = await import('../../cartes/CarteDuFil');
    const ev = (id: number, code: string): Message => ({ ...carte(engagement(), code, 'event'), id, action_attendue: false });
    render(
      withIntl(
        <ul>
          <EvenementsReplies messages={[ev(1, 'commitment.due_soon'), ev(2, 'commitment.confirmed')]} />
        </ul>,
      ),
    );
    expect(screen.getAllByTestId('icone-d-engagement')).toHaveLength(1);
    expect(screen.getByTestId('icone-d-engagement').getAttribute('class')).toContain('lucide-bell');
    fireEvent.click(screen.getByRole('button'));
    expect(document.querySelectorAll('ol svg')).toHaveLength(2);
  });

  it('une suite sans engagement : aucune icône', async () => {
    const { EvenementsReplies } = await import('../../cartes/CarteDuFil');
    const ev = (id: number): Message => ({ ...carte(engagement(), 'lease_payment.paid', 'event'), id, action_attendue: false, metadata: { code: 'lease_payment.paid', data: {} } });
    render(withIntl(<ul><EvenementsReplies messages={[ev(1), ev(2)]} /></ul>));
    expect(screen.queryByTestId('icone-d-engagement')).toBeNull();
  });
});
