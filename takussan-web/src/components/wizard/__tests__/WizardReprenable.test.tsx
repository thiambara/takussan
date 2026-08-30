import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { WizardReprenable } from '../WizardReprenable';
import { ToastProvider, Toaster } from '@/components/ui/toast';

const messages = {
  wizardDrafts: {
    component: {
      ariaLabel: 'Assistant',
      progressAriaLabel: 'Étape {current} sur {total}',
      previous: 'Précédent',
      next: 'Suivant',
      complete: 'Terminer',
      loading: 'Chargement…',
      savedToastTitle: 'Progression sauvegardée',
      savedToastBody: 'Vous pourrez reprendre exactement où vous en êtes.',
      saveFailedToastTitle: 'Progression non enregistrée',
      saveFailedToastBody: 'Rouvrez l’assistant et vérifiez vos dernières saisies.',
      completionFailedToastTitle: 'Impossible de terminer pour l’instant',
      completionFailedToastBody: 'Vérifiez votre connexion, puis cliquez de nouveau sur Terminer.',
    },
  },
  // `<Toaster />` traduit le bouton de fermeture : sans ce bloc, next-intl
  // journalise une clé manquante dès qu'un toast est RENDU (les tests d'origine
  // n'en affichaient aucun).
  ui: { toast: { close: 'Fermer la notification' } },
};

type Data = { title: string; rooms: number };

function renderWizard({
  initialData = { title: '', rooms: 0 },
  onComplete = vi.fn(),
  debounceMs = 20,
}: {
  initialData?: Data;
  onComplete?: () => void | Promise<void>;
  debounceMs?: number;
} = {}) {
  const arbre = (monte: boolean) => (
    <NextIntlClientProvider locale="fr" messages={messages}>
      <ToastProvider>
        {monte ? (
          <WizardReprenable<Data>
            storageKey="host-individual-wizard"
            initialData={initialData}
            debounceMs={debounceMs}
            steps={[
              {
                id: 'title',
                title: 'Titre',
                render: ({ data, setData }) => (
                  <input
                    aria-label="title"
                    value={data.title}
                    onChange={(e) => setData({ ...data, title: e.target.value })}
                  />
                ),
                canAdvance: (d) => d.title.length > 0,
              },
              {
                id: 'rooms',
                title: 'Pièces',
                render: ({ data, setData }) => (
                  <input
                    aria-label="rooms"
                    type="number"
                    value={data.rooms}
                    onChange={(e) => setData({ ...data, rooms: Number(e.target.value) })}
                  />
                ),
              },
            ]}
            onComplete={onComplete}
          />
        ) : null}
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );
  const utils = render(arbre(true));
  // Démonte le SEUL assistant : `utils.unmount()` emporterait aussi le Toaster,
  // et le toast posé par le nettoyage n'aurait nulle part où s'afficher.
  return { ...utils, demonterAssistant: () => utils.rerender(arbre(false)) };
}

async function tick(ms = 60): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
}

describe('WizardReprenable', () => {
  beforeEach(() => {
    // Default fetch: 404 on initial GET (no draft yet), 200 on PUTs.
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') return { ok: false, status: 404, json: async () => ({}) };
      if (method === 'PUT') {
        const body = JSON.parse(((init as RequestInit).body as string) ?? '{}');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: 1, key: 'host-individual-wizard', step: body.step, data: body.data, updated_at: 'now' },
          }),
        };
      }
      if (method === 'DELETE') return { ok: true, status: 204, json: async () => null };
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the first step and disables Suivant when canAdvance is false', async () => {
    renderWizard();
    await tick();

    // Step 1 visible.
    expect(screen.getByLabelText('title')).toBeInTheDocument();
    // Suivant disabled because title empty.
    const next = screen.getByRole('button', { name: 'Suivant' });
    expect(next).toBeDisabled();
  });

  it('autosaves data via debounced PUT after a field changes', async () => {
    renderWizard();
    await tick();

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    // Reset count after initial GET.
    fetchMock.mockClear();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio Plateau' } });
    await tick(120);

    const puts = fetchMock.mock.calls.filter((c) => (c[1]?.method ?? 'GET') === 'PUT');
    expect(puts.length).toBeGreaterThanOrEqual(1);
    const lastPut = puts[puts.length - 1];
    const body = JSON.parse(lastPut[1].body);
    expect(body.step).toBe(0);
    expect(body.data.title).toBe('Studio Plateau');
  });

  it('navigates between steps and completes via onComplete', async () => {
    const onComplete = vi.fn();
    renderWizard({ onComplete });
    await tick();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio' } });
    await tick(80);

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await tick();

    expect(screen.getByLabelText('rooms')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await tick(80);

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ title: 'Studio' }));

    // After completion, DELETE should be issued to clear the draft.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const deletes = fetchMock.mock.calls.filter((c) => (c[1]?.method ?? 'GET') === 'DELETE');
    expect(deletes.length).toBeGreaterThanOrEqual(1);
  });

  it('hydrates from an existing server draft and resumes at the saved step', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: 1,
              key: 'host-individual-wizard',
              step: 1,
              data: { title: 'Existing', rooms: 3 },
              updated_at: 'now',
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) };
    }) as unknown as typeof fetch;

    renderWizard();
    await tick();

    // Resumed at step 2 (index 1) — rooms input visible, title input not.
    expect(screen.queryByLabelText('title')).not.toBeInTheDocument();
    const rooms = screen.getByLabelText('rooms') as HTMLInputElement;
    expect(rooms.value).toBe('3');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TCK-475 — le toast lit le sort de l'écriture, sur les DEUX sites
  //
  // Les deux sites ne sont PAS le même chemin, et le ticket avait raison de ne
  // pas le supposer :
  //   • SITE 1 — le nettoyage de l'effet `[hydrated]` (démontage / `pagehide`),
  //     qui annonçait « Progression sauvegardée » sans jamais regarder le PUT ;
  //   • SITE 2 — `handleNext` sur la dernière étape, qui n'annonçait RIEN et
  //     enchaînait sur `onComplete` puis `clear()`, lequel SUPPRIME le brouillon.
  // D'où quatre tests, chacun nommant le site qu'il éprouve.
  //
  // ⚠ Le débounce est porté à 5000 ms dans ces tests : on veut une écriture
  // EN ATTENTE au moment du démontage / du clic, donc provoquée par `flush()`
  // lui-même et non par un minuteur qui aurait déjà tiré.
  // ──────────────────────────────────────────────────────────────────────────

  function moquerFetch({ putOk }: { putOk: boolean }): ReturnType<typeof vi.fn> {
    const mock = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') return { ok: false, status: 404, json: async () => ({}) };
      if (method === 'PUT') {
        return putOk
          ? {
              ok: true,
              status: 200,
              json: async () => ({
                data: { id: 1, key: 'host-individual-wizard', step: 0, data: {}, updated_at: 'now' },
              }),
            }
          : { ok: false, status: 503, json: async () => ({}) };
      }
      if (method === 'DELETE') return { ok: true, status: 204, json: async () => null };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    globalThis.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  it("SITE 1 (démontage) — AC1 : une écriture refusée n'annonce PAS « Progression sauvegardée » et dit quoi faire", async () => {
    moquerFetch({ putOk: false });
    const { demonterAssistant } = renderWizard({ debounceMs: 5000 });
    await tick();

    // Une saisie reste en attente : c'est le `flush()` du démontage qui l'écrit.
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio Plateau' } });
    demonterAssistant();
    await tick(80);

    expect(screen.queryByText('Progression sauvegardée')).not.toBeInTheDocument();
    expect(screen.getByText('Progression non enregistrée')).toBeInTheDocument();
    // Le message dit quoi faire, pas seulement que ça a raté.
    expect(
      screen.getByText('Rouvrez l’assistant et vérifiez vos dernières saisies.'),
    ).toBeInTheDocument();
  });

  it('SITE 1 (démontage) — AC2 : une écriture acceptée annonce TOUJOURS « Progression sauvegardée »', async () => {
    moquerFetch({ putOk: true });
    const { demonterAssistant } = renderWizard({ debounceMs: 5000 });
    await tick();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio Plateau' } });
    demonterAssistant();
    await tick(80);

    expect(screen.getByText('Progression sauvegardée')).toBeInTheDocument();
    expect(screen.queryByText('Progression non enregistrée')).not.toBeInTheDocument();
  });

  it("SITE 2 (finalisation) — AC1 : une écriture refusée arrête la finalisation, n'appelle pas onComplete et dit quoi faire", async () => {
    const mock = moquerFetch({ putOk: false });
    const onComplete = vi.fn();
    renderWizard({ onComplete, debounceMs: 5000 });
    await tick();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await tick(80);

    expect(screen.getByText('Impossible de terminer pour l’instant')).toBeInTheDocument();
    expect(
      screen.getByText('Vérifiez votre connexion, puis cliquez de nouveau sur Terminer.'),
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    // Et surtout : le brouillon périmé n'est pas DÉTRUIT derrière l'échec.
    expect(mock.mock.calls.filter((c) => (c[1]?.method ?? 'GET') === 'DELETE')).toHaveLength(0);
    // Le bouton reste actionnable — la personne peut réessayer.
    expect(screen.getByRole('button', { name: 'Terminer' })).not.toBeDisabled();
  });

  it("SITE 2 (finalisation) — AC2 : une écriture acceptée finalise et n'annonce aucun échec", async () => {
    const mock = moquerFetch({ putOk: true });
    const onComplete = vi.fn();
    renderWizard({ onComplete, debounceMs: 5000 });
    await tick();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await tick(80);

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ title: 'Studio' }));
    expect(screen.queryByText('Impossible de terminer pour l’instant')).not.toBeInTheDocument();
    expect(
      mock.mock.calls.filter((c) => (c[1]?.method ?? 'GET') === 'DELETE').length,
    ).toBeGreaterThanOrEqual(1);
  });
});
