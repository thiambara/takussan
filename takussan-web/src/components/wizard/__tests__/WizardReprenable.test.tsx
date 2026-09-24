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
  relireBrouillon,
}: {
  initialData?: Data;
  onComplete?: () => void | Promise<void>;
  debounceMs?: number;
  relireBrouillon?: (data: Data) => Data;
} = {}) {
  const arbre = (monte: boolean) => (
    <NextIntlClientProvider locale="fr" messages={messages}>
      <ToastProvider>
        {monte ? (
          <WizardReprenable<Data>
            storageKey="host-individual-wizard"
            initialData={initialData}
            debounceMs={debounceMs}
            relireBrouillon={relireBrouillon}
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

// ────────────────────────────────────────────────────────────────────────────
// TCK-483 — le garde du toast de succès lit une valeur VIVANTE
//
// Le garde `if (!completing)` du site 1 était du code mort : la fermeture de
// nettoyage de l'effet `[hydrated]` capturait `completing` tel qu'il valait à
// l'hydratation — `false`, définitivement. Le toast « Progression sauvegardée »
// partait donc AUSSI derrière une finalisation, là où `clear()` vient de
// SUPPRIMER le brouillon : on annonçait la sauvegarde de ce qu'on venait
// d'effacer.
//
// ⚠ Et l'état `completing` n'est PAS non plus la valeur à lire, même rendue
// lisible : il retombe à `false` dans le `finally` de `handleNext`, donc AVANT
// le démontage qui suit une finalisation réussie. Ce que le garde doit lire,
// c'est ce que son commentaire dit déjà — « le brouillon a été effacé
// volontairement » — et non « une finalisation est en cours ».
// ────────────────────────────────────────────────────────────────────────────
describe('TCK-483 — le garde du toast lit une valeur vivante', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') return { ok: false, status: 404, json: async () => ({}) };
      if (method === 'PUT') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: 1, key: 'host-individual-wizard', step: 0, data: {}, updated_at: 'now' },
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

  it("AC1 — chemin de finalisation : le démontage qui suit n'annonce PAS « Progression sauvegardée »", async () => {
    const onComplete = vi.fn();
    const { demonterAssistant } = renderWizard({ onComplete, debounceMs: 5000 });
    await tick();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await tick(80);

    // On a bien emprunté le chemin de finalisation : le brouillon est supprimé.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(onComplete).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.filter((c) => (c[1]?.method ?? 'GET') === 'DELETE').length,
    ).toBeGreaterThanOrEqual(1);

    // C'est le démontage qui suit la finalisation — celui qu'une navigation
    // provoque — qui déclenchait le toast fautif.
    demonterAssistant();
    await tick(80);

    expect(screen.queryByText('Progression sauvegardée')).not.toBeInTheDocument();
    expect(screen.queryByText('Progression non enregistrée')).not.toBeInTheDocument();
  });

  it('AC1 (contre-épreuve) — démontage ordinaire sans rien en attente : le toast part TOUJOURS', async () => {
    // TCK-566 — ce test ouvrait l'assistant VIERGE et comptait sur l'écriture
    // que l'hydratation mettait en attente : c'était elle, et non une saisie,
    // que le `flush()` du démontage écrivait. Cette écriture-là était le défaut
    // (une démarche « à reprendre » sans une ligne saisie). La contre-épreuve
    // porte désormais sur un brouillon qui EXISTE : rien en attente, `flush()`
    // rend `{ ok: true, ecrit: false }`, et le toast part — le garde ne doit
    // pas devenir un interrupteur qui l'éteint en général.
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: 1, key: 'host-individual-wizard', step: 0, data: { title: 'Studio', rooms: 0 }, updated_at: 'now' },
          }),
        };
      }
      if (method === 'DELETE') return { ok: true, status: 204, json: async () => null };
      return { ok: true, status: 200, json: async () => ({ data: {} }) };
    }) as unknown as typeof fetch;

    const { demonterAssistant } = renderWizard({ debounceMs: 5000 });
    await tick();

    demonterAssistant();
    await tick(80);

    expect(screen.getByText('Progression sauvegardée')).toBeInTheDocument();
  });

  it('AC1 (discriminant) — finalisation ÉCHOUÉE puis démontage réussi : le toast part, le brouillon vit encore', async () => {
    // Le PUT de la finalisation échoue ; celui du démontage réussit.
    let puts = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') return { ok: false, status: 404, json: async () => ({}) };
      if (method === 'PUT') {
        puts += 1;
        if (puts === 1) return { ok: false, status: 503, json: async () => ({}) };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: 1, key: 'host-individual-wizard', step: 1, data: {}, updated_at: 'now' },
          }),
        };
      }
      if (method === 'DELETE') return { ok: true, status: 204, json: async () => null };
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const onComplete = vi.fn();
    const { demonterAssistant } = renderWizard({ onComplete, debounceMs: 5000 });
    await tick();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await tick(80);
    expect(onComplete).not.toHaveBeenCalled();

    // La finalisation n'a PAS eu lieu : le brouillon existe toujours, et une
    // écriture acceptée au démontage doit s'annoncer comme n'importe quelle
    // autre. Un garde armé à l'entrée de `handleNext` et jamais désarmé
    // éteindrait ce toast-là.
    fireEvent.change(screen.getByLabelText('rooms'), { target: { value: '3' } });
    demonterAssistant();
    await tick(80);

    expect(screen.getByText('Progression sauvegardée')).toBeInTheDocument();
  });

  it("AC2 — le correctif ne multiplie PAS les exécutions de l'effet : 1 pose, 1 dépose sur un parcours complet", async () => {
    // L'effet pose un écouteur `pagehide` dans son corps et le retire dans sa
    // fermeture : les compter, c'est compter l'effet lui-même. Une correction
    // par la liste de dépendances (`[hydrated, completing]`) relancerait l'effet
    // à chaque bascule de `completing` — donc autant de `flush()` de nettoyage,
    // donc autant de PUT et de toasts en trop.
    const poses: string[] = [];
    const deposes: string[] = [];
    // ⚠ Capturer les originaux AVANT d'espionner, et LIÉS à `window` : appeler
    // `EventTarget.prototype.addEventListener` avec un `this` reconstruit fait
    // lever jsdom (« not a valid instance of EventTarget »).
    const poseReelle = window.addEventListener.bind(window);
    const deposeReelle = window.removeEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(((
      ...args: Parameters<typeof window.addEventListener>
    ) => {
      if (args[0] === 'pagehide') poses.push('pagehide');
      return poseReelle(...args);
    }) as typeof window.addEventListener);
    vi.spyOn(window, 'removeEventListener').mockImplementation(((
      ...args: Parameters<typeof window.removeEventListener>
    ) => {
      if (args[0] === 'pagehide') deposes.push('pagehide');
      return deposeReelle(...args);
    }) as typeof window.removeEventListener);

    const onComplete = vi.fn();
    const { demonterAssistant } = renderWizard({ onComplete, debounceMs: 5000 });
    await tick();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await tick(80);

    // `completing` a basculé deux fois (false→true→false) et l'étape une fois :
    // l'effet ne doit rien en savoir.
    expect(poses).toHaveLength(1);
    expect(deposes).toHaveLength(0);

    demonterAssistant();
    await tick(80);

    expect(poses).toHaveLength(1);
    expect(deposes).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TCK-566 — ouvrir un parcours sans rien saisir ne crée AUCUNE démarche
//
// Retour testeur du 2026-09-23 : « J'ai seulement cliqué sur la notification
// (passer en pro) ; je n'ai pas renseigné une seule ligne et on me dit
// "reprendre là où j'en étais". » L'autosave écrivait l'état VIERGE dès
// l'hydratation : 800 ms après l'ouverture, un PUT créait côté serveur un
// brouillon que le bandeau du tableau de bord présentait comme une démarche
// en cours. Un brouillon n'existe désormais que si l'état diffère de celui
// que l'assistant affichait à l'ouverture.
// ────────────────────────────────────────────────────────────────────────────
describe('TCK-566 — pas de brouillon sans saisie', () => {
  function moquer(get: { step: number; data: Data } | null): ReturnType<typeof vi.fn> {
    const mock = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') {
        return get
          ? {
              ok: true,
              status: 200,
              json: async () => ({
                data: { id: 1, key: 'host-individual-wizard', ...get, updated_at: 'now' },
              }),
            }
          : { ok: false, status: 404, json: async () => ({}) };
      }
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
    });
    globalThis.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  const appels = (mock: ReturnType<typeof vi.fn>, verbe: string) =>
    mock.mock.calls.filter((c) => (c[1]?.method ?? 'GET') === verbe);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ouvrir l’assistant et attendre au-delà du débounce : aucun PUT', async () => {
    const mock = moquer(null);
    renderWizard({ debounceMs: 20 });
    // DEUX attentes, et c'est mesuré : `act()` ne vide sa file qu'à sa sortie,
    // donc l'effet d'autosave qui suit l'hydratation n'arme son minuteur qu'à
    // la fin de la première. Une seule attente, même longue, laissait passer le
    // défaut (vert sans le correctif).
    await tick();
    await tick(150);

    expect(appels(mock, 'PUT')).toHaveLength(0);
    expect(appels(mock, 'DELETE')).toHaveLength(0);
  });

  it('quitter sans rien avoir saisi : aucun PUT, et aucun « Progression sauvegardée »', async () => {
    const mock = moquer(null);
    const { demonterAssistant } = renderWizard({ debounceMs: 5000 });
    await tick();

    demonterAssistant();
    await tick(80);

    expect(appels(mock, 'PUT')).toHaveLength(0);
    // Annoncer une progression sauvegardée là où rien n'a été saisi, c'est le
    // même message que la carte « Reprenez là où vous vous étiez arrêté ».
    expect(screen.queryByText('Progression sauvegardée')).not.toBeInTheDocument();
  });

  it('une saisie écrit le brouillon ; l’effacer jusqu’à l’état vierge le supprime', async () => {
    const mock = moquer(null);
    renderWizard({ debounceMs: 20 });
    await tick();

    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Studio' } });
    await tick(120);
    expect(appels(mock, 'PUT').length).toBeGreaterThanOrEqual(1);

    const putsAvant = appels(mock, 'PUT').length;
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '' } });
    await tick(120);

    expect(appels(mock, 'DELETE')).toHaveLength(1);
    // Et l'état vierge n'est pas RÉÉCRIT par-dessus la suppression.
    expect(appels(mock, 'PUT')).toHaveLength(putsAvant);
  });

  it('un brouillon vierge hérité de l’ancien comportement est supprimé à l’ouverture', async () => {
    const mock = moquer({ step: 0, data: { title: '', rooms: 0 } });
    renderWizard({ debounceMs: 20 });
    await tick();
    await tick(150);

    expect(appels(mock, 'DELETE')).toHaveLength(1);
    expect(appels(mock, 'PUT')).toHaveLength(0);
  });

  // ⚠ Ce que le SERVEUR rendait jusqu'à TCK-574 : le middleware
  // `ConvertEmptyStringsToNull` de l'API enregistrait chaque `''` en `null`
  // (mesuré : PUT `{ title: '' }` puis GET → `{ title: null }`). C'est le cas du
  // compte du testeur, et de tout brouillon écrit avant TCK-574 : il reste en
  // base, donc la tolérance reste. Depuis TCK-574, l'API rend le `''` envoyé
  // (cas ci-dessus).
  it('un brouillon vierge hérité, tel que le serveur le rend (null), est supprimé à l’ouverture', async () => {
    const mock = moquer({ step: 0, data: { title: null, rooms: 0 } as unknown as Data });
    renderWizard({ debounceMs: 20 });
    await tick();
    await tick(150);

    expect(appels(mock, 'DELETE')).toHaveLength(1);
    expect(appels(mock, 'PUT')).toHaveLength(0);
    expect((screen.getByLabelText('title') as HTMLInputElement).value).toBe('');
  });

  it('un brouillon réel relu n’est pas réécrit à l’identique à l’ouverture', async () => {
    const mock = moquer({ step: 0, data: { title: 'Existant', rooms: 2 } });
    renderWizard({ debounceMs: 20 });
    await tick();
    await tick(150);

    expect(appels(mock, 'PUT')).toHaveLength(0);
  });

  // Le vérificateur l'a soupçonné sans le prouver : `data` est figé par
  // `useState(initialData)` au MONTAGE, alors que l'état vierge était calculé
  // depuis `initialData` à l'HYDRATATION. Si `initialData` change entre les deux
  // (l'utilisateur ou l'indicatif géolocalisé qui arrivent après le premier
  // rendu, pendant que le GET du brouillon est en vol), l'état affiché diffère
  // de l'« état vierge » et un brouillon s'écrit sans aucune saisie.
  it('un initialData qui change pendant le chargement du brouillon ne crée aucun brouillon', async () => {
    let rendreGet: (reponse: unknown) => void = () => {};
    const mock = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') {
        return new Promise((resolve) => {
          rendreGet = resolve;
        });
      }
      if (method === 'DELETE') return { ok: true, status: 204, json: async () => null };
      return { ok: true, status: 200, json: async () => ({ data: null }) };
    });
    globalThis.fetch = mock as unknown as typeof fetch;

    const arbre = (initialData: Data) => (
      <NextIntlClientProvider locale="fr" messages={messages}>
        <ToastProvider>
          <WizardReprenable<Data>
            storageKey="host-individual-wizard"
            initialData={initialData}
            debounceMs={20}
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
              },
            ]}
            onComplete={vi.fn()}
          />
        </ToastProvider>
      </NextIntlClientProvider>
    );

    const { rerender } = render(arbre({ title: '', rooms: 0 }));
    // L'utilisateur arrive : l'assistant recalcule son squelette.
    rerender(arbre({ title: 'Awa Diop', rooms: 0 }));
    await act(async () => {
      rendreGet({ ok: false, status: 404, json: async () => ({}) });
    });
    await tick();
    await tick(150);

    expect(appels(mock, 'PUT')).toHaveLength(0);
    // Et c'est le squelette À JOUR qui s'affiche, pas celui du premier rendu.
    expect((screen.getByLabelText('title') as HTMLInputElement).value).toBe('Awa Diop');
  });

  // Relevé par le vérificateur : un brouillon écrit sous un ANCIEN
  // comportement (le téléphone de l'assistant hôte amorcé à `+221`) n'a pas la
  // forme de l'état vierge actuel. Réinjecté brut, il n'était jamais reconnu
  // comme vierge, donc jamais supprimé. `relireBrouillon` le remet dans la
  // forme d'aujourd'hui AVANT la comparaison.
  it('relireBrouillon s’applique avant la comparaison : un fantôme hérité est supprimé', async () => {
    const mock = moquer({ step: 0, data: { title: '+221', rooms: 0 } });
    renderWizard({
      debounceMs: 20,
      relireBrouillon: (d) => ({ ...d, title: d.title === '+221' ? '' : d.title }),
    });
    await tick();
    await tick(150);

    expect(appels(mock, 'DELETE')).toHaveLength(1);
    expect(appels(mock, 'PUT')).toHaveLength(0);
    expect((screen.getByLabelText('title') as HTMLInputElement).value).toBe('');
  });

  it('relireBrouillon ne touche pas l’état vierge : sans brouillon, rien n’est écrit', async () => {
    const relire = vi.fn((d: Data) => d);
    const mock = moquer(null);
    renderWizard({ debounceMs: 20, relireBrouillon: relire });
    await tick();
    await tick(150);

    expect(relire).not.toHaveBeenCalled();
    expect(appels(mock, 'PUT')).toHaveLength(0);
  });

  // Relevé par le vérificateur (passe 3, mutation M5) : `relireBrouillon`
  // s'applique au résultat de la FUSION, jamais au brouillon brut. Un `null`
  // rendu par le serveur est un champ absent pour `mergeDraft`, qui garde
  // alors la valeur de l'état initial ; relu avant, il deviendrait `''` et
  // écraserait cette valeur.
  it('relireBrouillon reçoit le brouillon DÉJÀ fusionné : un null serveur ne l’emporte pas', async () => {
    const relire = vi.fn((d: Data) => ({
      ...d,
      title: typeof d.title === 'string' ? d.title : '',
    }));
    // Le serveur rend `null` là où le type attend une chaîne : c’est le sujet.
    moquer({ step: 0, data: { title: null, rooms: 3 } as unknown as Data });
    renderWizard({
      debounceMs: 20,
      initialData: { title: 'Du compte', rooms: 0 },
      relireBrouillon: relire,
    });
    await tick();
    await tick(150);

    expect(relire).toHaveBeenCalledWith({ title: 'Du compte', rooms: 3 });
    expect((screen.getByLabelText('title') as HTMLInputElement).value).toBe('Du compte');
  });

  // TCK-574 — l'API rend désormais `''` tel quel. Un champ PRÉ-REMPLI que la
  // personne a vidé doit donc revenir VIDE à la reprise : la fusion ne tient
  // pour absent que `null` (brouillon d'avant TCK-574), jamais `''`. Une fusion
  // qui sauterait aussi `''` ressusciterait la valeur effacée.
  it('un champ pré-rempli vidé revient vide à la reprise (TCK-574)', async () => {
    const mock = moquer({ step: 0, data: { title: '', rooms: 3 } });
    renderWizard({ debounceMs: 20, initialData: { title: 'Du compte', rooms: 0 } });
    await tick();
    await tick(150);

    expect((screen.getByLabelText('title') as HTMLInputElement).value).toBe('');
    // Ce n'est pas l'état vierge (qui porte « Du compte ») : le brouillon reste.
    expect(appels(mock, 'DELETE')).toHaveLength(0);
  });

  it('un brouillon réel n’est ni supprimé ni perdu à l’ouverture', async () => {
    const mock = moquer({ step: 0, data: { title: 'Existant', rooms: 2 } });
    renderWizard({ debounceMs: 20 });
    await tick();
    await tick(150);

    expect(appels(mock, 'DELETE')).toHaveLength(0);
    expect((screen.getByLabelText('title') as HTMLInputElement).value).toBe('Existant');
  });
});
