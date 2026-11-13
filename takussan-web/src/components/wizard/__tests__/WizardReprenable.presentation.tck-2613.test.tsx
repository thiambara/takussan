import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { WizardReprenable, type PresentationDEtape } from '../WizardReprenable';
import { ToastProvider, Toaster } from '@/components/ui/toast';

/**
 * TCK-2613 — les assistants des invités passent à deux écrans dans la coque d'entrée : la barre de la coque dit
 * l'avancement, et chaque écran porte son geste. `WizardReprenable` garde le brouillon et ses gardes (TCK-475,
 * TCK-483, TCK-566) ; la page rend l'étape (`presentation`) et le numéro vérifié saute l'étape 1
 * (`etapeImposee`), sans écrire de brouillon fantôme.
 */
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
      savedToastBody: 'Vous pourrez reprendre.',
      saveFailedToastTitle: 'Progression non enregistrée',
      saveFailedToastBody: 'Rouvrez l’assistant.',
      completionFailedToastTitle: 'Impossible de terminer pour l’instant',
      completionFailedToastBody: 'Vérifiez votre connexion.',
      draftNotClearedToastTitle: 'Brouillon non effacé',
      draftNotClearedToastBody: 'Votre démarche est bien enregistrée.',
    },
  },
  ui: { toast: { close: 'Fermer la notification' } },
};

type Data = { phone: { verified: boolean }; zones: string[] };

const VIERGE: Data = { phone: { verified: false }, zones: [] };

let brouillonServeur: { step: number; data: unknown } | null = null;

function presentation(api: PresentationDEtape<Data>) {
  return (
    <div data-testid="presentation" data-etape={api.etape} data-total={api.total}>
      {api.corps}
      <button type="button" onClick={() => api.allerA(1)}>
        Aller à 2
      </button>
      <button type="button" onClick={() => void api.suivant()} disabled={!api.peutAvancer}>
        {api.derniere ? 'Aller à mon espace' : 'Continuer'}
      </button>
    </div>
  );
}

function monter({
  initialData = VIERGE,
  onComplete = vi.fn(),
}: {
  initialData?: Data;
  onComplete?: (data: Data) => void | Promise<void>;
} = {}) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <ToastProvider>
        <WizardReprenable<Data>
          storageKey="owner-onboarding-7"
          initialData={initialData}
          debounceMs={20}
          etapeImposee={(data, lue) => (data.phone.verified ? Math.max(1, Math.min(lue, 1)) : 0)}
          presentation={presentation}
          steps={[
            { id: 'phone', title: 'Numéro', render: () => <p>Écran du numéro</p>, canAdvance: (d) => d.phone.verified },
            {
              id: 'raison',
              title: 'Raison',
              render: ({ data, setData }) => (
                <input aria-label="zones" value={data.zones.join(',')} onChange={(e) => setData({ ...data, zones: e.target.value.split(',') })} />
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

function appels(methode: string) {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return fetchMock.mock.calls.filter((c) => ((c[1] as RequestInit | undefined)?.method ?? 'GET') === methode);
}

describe('WizardReprenable — présentation rendue par la page (TCK-2613)', () => {
  beforeEach(() => {
    brouillonServeur = null;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (method === 'GET') {
        return brouillonServeur
          ? { ok: true, status: 200, json: async () => ({ data: { id: 1, key: 'owner-onboarding-7', ...brouillonServeur, updated_at: 'now' } }) }
          : { ok: false, status: 404, json: async () => ({}) };
      }
      if (method === 'PUT') {
        const body = JSON.parse(((init as RequestInit).body as string) ?? '{}');
        return { ok: true, status: 200, json: async () => ({ data: { id: 1, key: 'owner-onboarding-7', ...body, updated_at: 'now' } }) };
      }
      if (method === 'DELETE') return { ok: true, status: 204, json: async () => null };
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('la page rend l’étape : ni rail, ni titre d’étape, ni Précédent / Suivant de l’assistant', async () => {
    monter();
    await tick();

    expect(screen.getByTestId('presentation')).toHaveAttribute('data-etape', '0');
    expect(screen.getByTestId('presentation')).toHaveAttribute('data-total', '2');
    expect(screen.getByText('Écran du numéro')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Numéro' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Précédent/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Suivant/ })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('un numéro déjà vérifié ouvre l’étape 2, sans écrire de brouillon (TCK-566)', async () => {
    monter({ initialData: { phone: { verified: true }, zones: [] } });
    // Deux temps : `act` ne rend l'hydratation qu'en sortant du premier ; le second laisse au débounce (20 ms) bien
    // plus que le temps de partir — une écriture fantôme partirait là.
    await tick();
    await tick(400);

    expect(screen.getByTestId('presentation')).toHaveAttribute('data-etape', '1');
    expect(screen.getByLabelText('zones')).toBeInTheDocument();
    expect(appels('PUT')).toHaveLength(0);
  });

  it('un brouillon d’avant, à l’étape 3 d’un assistant à quatre écrans, reprend à l’étape 2 avec sa saisie', async () => {
    brouillonServeur = { step: 3, data: { phone: { verified: true }, zones: ['Mermoz'], kyc: { cni_uploaded: true }, tour: { finished: true } } };
    monter();
    await tick();

    expect(screen.getByTestId('presentation')).toHaveAttribute('data-etape', '1');
    expect(screen.getByLabelText('zones')).toHaveValue('Mermoz');
  });

  it('un numéro non vérifié ne saute jamais l’étape 1, même si le brouillon disait l’étape 2', async () => {
    brouillonServeur = { step: 1, data: { phone: { verified: false }, zones: [] } };
    monter();
    await tick();

    expect(screen.getByTestId('presentation')).toHaveAttribute('data-etape', '0');
  });

  it('`allerA` passe à l’étape suivante sans relire la garde rendue avant la vérification', async () => {
    monter();
    await tick();

    fireEvent.click(screen.getByRole('button', { name: 'Aller à 2' }));
    await tick();

    expect(screen.getByTestId('presentation')).toHaveAttribute('data-etape', '1');
  });

  it('le geste de la dernière étape finalise : écriture lue, onComplete, brouillon effacé', async () => {
    const onComplete = vi.fn();
    monter({ initialData: { phone: { verified: true }, zones: [] }, onComplete });
    await tick();

    fireEvent.change(screen.getByLabelText('zones'), { target: { value: 'Ngor' } });
    await tick(80);
    fireEvent.click(screen.getByRole('button', { name: 'Aller à mon espace' }));
    await tick(80);

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ zones: ['Ngor'] }));
    expect(appels('DELETE').length).toBeGreaterThanOrEqual(1);
  });
});
