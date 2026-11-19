/**
 * TCK-2977 (ADR-0131) — les pièces du copilote : le résumé (signal → relecture, « en pause » sans montant,
 * « Utile » → `accepted`), la transcription sous la note vocale (absente sans la clé, demandée une fois,
 * phrases par code et par langue) et la fenêtre des non-lus.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';
import type { Message } from '@/types/message';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

/** Les abonnements au canal personnel, pour rejouer un signal. */
const abonnes: { cible: unknown; rappel: (s: unknown) => void }[] = [];
vi.mock('@/lib/temps-reel/hooks', () => ({
  useSignal: (cible: unknown, rappel: (s: unknown) => void) => {
    if (cible) abonnes.push({ cible, rappel });
  },
  useIntervalleDeRelecture: (i: number | false) => i,
}));

const { AuthProvider } = await import('@/context/AuthContext');
const { CeQueVousAvezManque } = await import('../CeQueVousAvezManque');
const { TranscriptionDeLaNote } = await import('../TranscriptionDeLaNote');
const { fenetreDesNonLus } = await import('../fenetreDesNonLus');
const { oublierLesDemandesDuCopilote, etatDuCopiloteQueryKey } = await import('@/lib/queries/copilote');

const AGENT = { id: 7, full_name: 'Sokhna Sène', roles: ['agent'] } as unknown as User;

function arbre(enfant: ReactNode, client: QueryClient) {
  return withIntl(
    <QueryClientProvider client={client}>
      <AuthProvider initialUser={AGENT} initialToken="jeton">
        {enfant}
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const nouveauClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const chemins = () => apiRequest.mock.calls.map((c) => String(c[0]));
const FENETRE = { nonLus: 14, premierNonLuId: 3 };
const PRETE = {
  data: {
    conversation_id: 42,
    sortes: {
    resume: {
      statut: 'prete',
      suggestion_id: 55,
      proposition: {
        depuis_message_id: 3,
        jusqu_a_message_id: 16,
        points: [
          { texte: 'Astou Sy repasse jeudi à 10 h.', message_id: 4, attend_le_lecteur: false },
          { texte: 'Qui paie le déplacement ?', message_id: 9, attend_le_lecteur: true },
        ],
      },
    },
    },
  },
};

function resume(client = nouveauClient(), surAller = vi.fn()) {
  render(arbre(<ul><CeQueVousAvezManque conversationId={42} fenetre={FENETRE} heureDe={(id) => `11:0${id}`} onAllerAuMessage={surAller} /></ul>, client));
  return client;
}

beforeEach(() => {
  oublierLesDemandesDuCopilote();
  abonnes.length = 0;
  apiRequest.mockReset();
});

describe('TCK-2977 — « Ce que vous avez manqué »', () => {
  it('un signal `copilote.updated` relit l’état, et le résumé prêt de CETTE fenêtre s’affiche, la question en tête', async () => {
    let etat: unknown = { data: { conversation_id: 42, sortes: { resume: { statut: 'en_cours' } } } };
    apiRequest.mockImplementation(async (chemin: string) => (chemin.endsWith('/copilote') ? etat : {}));
    const aller = vi.fn();
    resume(undefined, aller);
    expect(await screen.findByTestId('resume-en-cours')).toBeTruthy();
    const lectures = () => chemins().filter((c) => c === '/api/conversations/42/copilote').length;
    await waitFor(() => expect(lectures()).toBeGreaterThan(0));
    const avant = lectures();
    etat = PRETE;
    const abonne = abonnes.find((a) => JSON.stringify(a.cible) === JSON.stringify({ personnel: ['copilote.updated'] }))!;
    await act(async () => abonne.rappel({ subject: 'utilisateur:7', event: 'copilote.updated', cursor: '' }));
    await waitFor(() => expect(lectures()).toBeGreaterThan(avant));
    const bloc = await screen.findByTestId('resume-de-l-assistant');
    expect(bloc.textContent).toContain('Ce que vous avez manqué · résumé de l’assistant');
    expect(bloc.textContent).toContain('Visible par vous seulement · rien n’est envoyé');
    const points = bloc.querySelectorAll('ul > li');
    expect(points[0]!.textContent).toContain('Qui paie le déplacement ?');
    fireEvent.click(screen.getByRole('button', { name: 'Aller à la question' }));
    expect(aller).toHaveBeenCalledWith(9);
    fireEvent.click(screen.getByRole('button', { name: 'Lire les 14 messages' }));
    expect(screen.queryByTestId('resume-de-l-assistant')).toBeNull();
  });

  it('un résumé prêt d’une AUTRE fenêtre (ouverture précédente) ne s’affiche pas', async () => {
    const ancien = structuredClone(PRETE);
    ancien.data.sortes.resume.proposition.depuis_message_id = 1;
    apiRequest.mockImplementation(async (chemin: string) => (chemin.endsWith('/copilote') ? ancien : {}));
    resume();
    await waitFor(() => expect(chemins()).toContain('/api/conversations/42/copilote'));
    // L'état est lu (plus d'attente) : rien ne s'affiche à la place du résumé.
    await waitFor(() => expect(screen.queryByTestId('resume-en-cours')).toBeNull());
    expect(screen.queryByTestId('resume-de-l-assistant')).toBeNull();
  });

  it('`budget_epuise` : « Assistant en pause jusqu’à demain », sans montant ni erreur', async () => {
    apiRequest.mockImplementation(async (chemin: string) =>
      chemin.endsWith('/copilote') ? { data: { sortes: { resume: { statut: 'refusee', code: 'copilote.budget_epuise' } } } } : {},
    );
    resume();
    const etat = await screen.findByTestId('etat-de-l-assistant');
    expect(etat.textContent).toContain('Assistant en pause jusqu’à demain');
    expect(etat.textContent).not.toMatch(/\$|F CFA|\d+[.,]\d{2}/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('`coupe` de portée agence : « Désactivé par l’agence » ; de portée plateforme : « Désactivé »', async () => {
    apiRequest.mockImplementation(async (chemin: string) =>
      chemin.endsWith('/copilote') ? { data: { sortes: { resume: { statut: 'refusee', code: 'copilote.coupe', portee: 'agence' } } } } : {},
    );
    resume();
    expect((await screen.findByTestId('etat-de-l-assistant')).textContent).toContain('Désactivé par l’agence');
  });

  it('« Utile » décide la suggestion `accepted`', async () => {
    apiRequest.mockImplementation(async (chemin: string) => (chemin.endsWith('/copilote') ? PRETE : {}));
    resume();
    fireEvent.click(await screen.findByRole('button', { name: 'Utile' }));
    await waitFor(() => expect(chemins()).toContain('/api/copilote/suggestions/55/decision'));
    const appel = apiRequest.mock.calls.find((c) => String(c[0]) === '/api/copilote/suggestions/55/decision')!;
    expect(appel[1]).toMatchObject({ method: 'PUT', body: { decision: 'accepted' } });
  });

  it('la clé de l’état est par fil ET par utilisateur', () => {
    expect(etatDuCopiloteQueryKey(42, 7)).not.toEqual(etatDuCopiloteQueryKey(42, 8));
  });
});

function note(transcription?: Message['transcription']) {
  return <TranscriptionDeLaNote conversationId={42} messageId={13} transcription={transcription} />;
}

describe('TCK-2977 — la transcription sous la note vocale', () => {
  it('sans la clé : rien, et aucune requête', async () => {
    apiRequest.mockResolvedValue({});
    const { container } = render(arbre(note(undefined), nouveauClient()));
    await Promise.resolve();
    expect(container.textContent).toBe('');
    expect(chemins()).toEqual([]);
  });

  it('`aucune` : demandée une seule fois, même si la bulle se remonte', async () => {
    apiRequest.mockResolvedValue({});
    const client = nouveauClient();
    const premier = render(arbre(note({ etat: 'aucune' }), client));
    await waitFor(() => expect(chemins()).toEqual(['/api/conversations/42/messages/13/transcription']));
    premier.unmount();
    render(arbre(note({ etat: 'aucune' }), client));
    await Promise.resolve();
    expect(chemins()).toHaveLength(1);
    expect(apiRequest.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
  });

  it('prête : « Transcription automatique », le texte, « la note fait foi »', () => {
    render(arbre(note({ etat: 'prete', texte: 'Bonjour, c’est Fatou.', langue: 'fr' }), nouveauClient()));
    const bloc = screen.getByTestId('transcription-de-la-note');
    expect(bloc.textContent).toContain('Transcription automatique');
    expect(bloc.textContent).toContain('Bonjour, c’est Fatou.');
    expect(bloc.textContent).toContain('Peut contenir des erreurs · la note fait foi');
    expect(chemins()).toEqual([]);
  });

  it('`ai.role_unassigned` → « La transcription n’est pas activée »', () => {
    render(arbre(note({ etat: 'indisponible', code: 'ai.role_unassigned' }), nouveauClient()));
    const bloc = screen.getByTestId('transcription-de-la-note');
    expect(bloc.textContent).toContain('Transcription indisponible');
    expect(bloc.textContent).toContain('La transcription n’est pas activée');
  });

  it('une langue rendue autre que `fr` (`wo`) → « Seules les notes en français sont transcrites »', () => {
    render(arbre(note({ etat: 'prete', texte: 'Na nga def', langue: 'wo' }), nouveauClient()));
    const bloc = screen.getByTestId('transcription-de-la-note');
    expect(bloc.textContent).toContain('Seules les notes en français sont transcrites');
    expect(bloc.textContent).not.toContain('Na nga def');
  });
});

describe('TCK-2977 — la fenêtre des non-lus', () => {
  const m = (id: number, sender: number, type = 'text', extra: Partial<Message> = {}) =>
    ({ id, sender_id: sender, type, created_at: `2026-11-18T09:${String(id).padStart(2, '0')}:00Z`, ...extra }) as Message;

  it('le premier non-lu est le N-ième message compté depuis le plus récent ; mes messages et les avis ne comptent pas', () => {
    const liste = [m(1, 9), m(2, 9), m(3, 7), m(4, 9, 'system'), m(5, 9), m(6, 9, 'event'), m(7, 9, 'event', { action_attendue: true })];
    expect(fenetreDesNonLus(liste, 7, 3, null)).toEqual({ nonLus: 3, premierNonLuId: 2 });
  });

  it('sans la liste : le compte vient de `last_read_at`', () => {
    const liste = [m(1, 9), m(2, 9), m(5, 9)];
    expect(fenetreDesNonLus(liste, 7, null, '2026-11-18T09:01:30Z')).toEqual({ nonLus: 2, premierNonLuId: 2 });
  });

  it('aucun non-lu : pas de premier non-lu', () => {
    expect(fenetreDesNonLus([m(1, 9)], 7, 0, null)).toEqual({ nonLus: 0, premierNonLuId: null });
  });
});
