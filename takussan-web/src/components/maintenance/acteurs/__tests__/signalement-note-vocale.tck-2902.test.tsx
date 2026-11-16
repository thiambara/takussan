import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider, Toaster } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import { SignalementDuLocataire } from '../SignalementDuLocataire';

const routeur = { push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));
vi.mock('@/lib/reduire-photo', () => ({ reduirePhotos: async (files: File[]) => files }));

/**
 * TCK-2902 (ADR-0113 § 3) — la note vocale du signalement : le micro à droite de « En deux mots », la
 * note réécoutable et supprimable, envoyée AVEC la demande (multipart). L'API est bouchonnée au `fetch` :
 * le test lit le corps envoyé.
 */
class FauxEnregistreur {
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_flux: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
  }
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['voix'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

interface Appel {
  readonly url: string;
  readonly methode: string;
  readonly corps: unknown;
  readonly entetes: Headers;
}

let appels: Appel[] = [];
let reponse: () => Response;

function avecMicro() {
  vi.stubGlobal('MediaRecorder', FauxEnregistreur);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } });
}

beforeEach(() => {
  appels = [];
  routeur.push.mockReset();
  reponse = () => new Response(JSON.stringify({ data: { id: 91, has_voice_note: true } }), { status: 201 });
  vi.stubGlobal('Audio', class { pause() {} play() { return Promise.resolve(); } });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:note', revokeObjectURL: () => undefined }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const methode = init?.method ?? 'GET';
      const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      appels.push({ url: String(url), methode, corps, entetes: new Headers(init?.headers) });
      if (methode === 'GET' && String(url).includes('/api/leases')) {
        return new Response(JSON.stringify({ data: [{ id: 5, status: 'active', property: { id: 44, title: 'Garage à Ouest Foire' } }], meta: { current_page: 1, last_page: 1, per_page: 100, total: 1 } }), { status: 200 });
      }
      if (methode === 'POST' && /\/api\/maintenance-requests$/.test(new URL(String(url), 'http://api.test').pathname)) return reponse();
      return new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // `navigator.mediaDevices` n'est pas un global stubbé : on le retire à la main.
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
});

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <SignalementDuLocataire />
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

async function formulaire(): Promise<HTMLFormElement> {
  return (await screen.findByText('Prendre une photo')).closest('form') as HTMLFormElement;
}

const envoi = () => appels.filter((a) => a.methode === 'POST');
const MICRO = 'Gardez appuyé pour enregistrer un message vocal';

/** Garder le micro appuyé `secondes`, puis relâcher (l'horloge seule est simulée). */
async function enregistrer(form: HTMLElement, secondes: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  await act(async () => {
    fireEvent.pointerDown(within(form).getByRole('button', { name: MICRO }));
  });
  vi.setSystemTime(Date.now() + secondes * 1000);
  await act(async () => {
    fireEvent.pointerUp(within(form).getByRole('button', { name: 'Relâchez pour terminer' }));
  });
  vi.useRealTimers();
}

describe('SignalementDuLocataire — la note vocale (TCK-2902)', () => {
  it('AC1 — le micro est à droite de « En deux mots », avec l’aide « gardez le micro appuyé »', async () => {
    avecMicro();
    monter();
    const form = await formulaire();
    const champ = within(form).getByLabelText(/En deux mots/);
    const micro = within(form).getByRole('button', { name: MICRO });
    // Même rangée, le micro APRÈS le champ.
    expect(champ.parentElement).toBe(micro.parentElement?.parentElement);
    expect(champ.compareDocumentPosition(micro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(form).getByText('Écrivez, ou gardez le micro appuyé pour un message vocal.')).toBeInTheDocument();
    expect(champ).toHaveAccessibleDescription('Écrivez, ou gardez le micro appuyé pour un message vocal.');
  });

  it('AC1 — sans `MediaRecorder` : ni micro ni « gardez le micro appuyé », l’aide dit « Écrivez »', async () => {
    monter();
    const form = await formulaire();
    expect(within(form).queryByRole('button', { name: MICRO })).toBeNull();
    expect(form.textContent).not.toMatch(/gardez le micro appuyé/);
    expect(within(form).getByText('Écrivez ce qui ne va pas, en quelques mots.')).toBeInTheDocument();
  });

  it('AC2 — une note de 12 s part avec la demande : `voice_note` (fichier) et `voice_note_duration=12`, sans description', async () => {
    avecMicro();
    monter();
    const form = await formulaire();
    await enregistrer(form, 12);
    expect(within(form).getByTestId('note-vocale-enregistree')).toHaveTextContent('Message vocal · 0:12');

    fireEvent.click(within(form).getByRole('radio', { name: 'Eau' }));
    fireEvent.submit(form);

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/maintenance/91/envoyee'));
    expect(envoi()).toHaveLength(1);
    const corps = envoi()[0].corps as FormData;
    expect(corps).toBeInstanceOf(FormData);
    const fichier = corps.get('voice_note') as File;
    expect(fichier).toBeInstanceOf(File);
    expect(fichier.name).toBe('note-vocale.webm');
    expect(fichier.size).toBeGreaterThan(0);
    expect(corps.get('voice_note_duration')).toBe('12');
    expect(corps.get('category')).toBe('plumbing');
    expect(corps.get('property_id')).toBe('44');
    expect(corps.get('lease_id')).toBe('5');
    expect(corps.get('title')).toBe('Problème d’eau');
    expect(corps.has('description')).toBe(false);
    // Idempotent (ADR-0072) : la clé part avec l'envoi multipart aussi.
    expect(envoi()[0].entetes.get('Idempotency-Key')).toBeTruthy();
  });

  it('la note se supprime avant l’envoi : la demande repart sans fichier, en JSON', async () => {
    avecMicro();
    monter();
    const form = await formulaire();
    await enregistrer(form, 5);
    fireEvent.click(within(form).getByRole('button', { name: 'Supprimer le message vocal' }));
    expect(within(form).queryByTestId('note-vocale-enregistree')).toBeNull();
    expect(within(form).getByRole('button', { name: MICRO })).toBeInTheDocument();

    fireEvent.click(within(form).getByRole('radio', { name: 'Eau' }));
    fireEvent.submit(form);
    await waitFor(() => expect(envoi()).toHaveLength(1));
    expect(envoi()[0].corps).not.toBeInstanceOf(FormData);
    expect(envoi()[0].corps).not.toHaveProperty('voice_note');
  });

  it('un double toucher sur « Envoyer » ne crée qu’une demande', async () => {
    avecMicro();
    let liberer: () => void = () => undefined;
    reponse = () => new Response(JSON.stringify({ data: { id: 91 } }), { status: 201 });
    const attente = new Promise<void>((r) => {
      liberer = r;
    });
    const fetchReel = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') await attente;
      return fetchReel(url, init);
    }));
    monter();
    const form = await formulaire();
    await enregistrer(form, 4);
    fireEvent.click(within(form).getByRole('radio', { name: 'Eau' }));
    fireEvent.submit(form);
    fireEvent.submit(form);
    await act(async () => liberer());
    await waitFor(() => expect(routeur.push).toHaveBeenCalledTimes(1));
    expect(envoi()).toHaveLength(1);
  });
});
