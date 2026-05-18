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
    },
  },
};

type Data = { title: string; rooms: number };

function renderWizard({
  initialData = { title: '', rooms: 0 },
  onComplete = vi.fn(),
}: { initialData?: Data; onComplete?: () => void | Promise<void> } = {}) {
  return render(
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
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
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
});
