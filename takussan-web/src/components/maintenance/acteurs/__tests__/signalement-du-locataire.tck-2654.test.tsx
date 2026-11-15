import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider, Toaster } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import { SignalementDuLocataire } from '../SignalementDuLocataire';

const routeur = { push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

// La réduction passe par un canvas, que jsdom n'a pas : les fichiers passent tels quels.
vi.mock('@/lib/reduire-photo', () => ({ reduirePhotos: async (files: File[]) => files }));

/**
 * TCK-2654 — le signalement du locataire, photo d'abord. L'API est bouchonnée au `fetch` : ce que le
 * test lit est le CORPS envoyé, pas l'appel d'un hook.
 */
interface Appel {
  readonly url: string;
  readonly methode: string;
  readonly corps: unknown;
}

let appels: Appel[] = [];
let baux: unknown[] = [];

function bail(id: number, propertyId: number, title: string) {
  return { id, status: 'active', property: { id: propertyId, title } };
}

function photo(nom: string): File {
  return new File([new Uint8Array(8)], nom, { type: 'image/jpeg' });
}

beforeEach(() => {
  appels = [];
  baux = [bail(5, 44, 'Garage à Ouest Foire')];
  routeur.push.mockReset();
  let objet = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:photo-${++objet}`, revokeObjectURL: () => undefined }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const methode = init?.method ?? 'GET';
      const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      appels.push({ url: String(url), methode, corps });
      if (methode === 'GET' && String(url).includes('/api/leases')) {
        return new Response(JSON.stringify({ data: baux, meta: { current_page: 1, last_page: 1, per_page: 100, total: baux.length } }), { status: 200 });
      }
      if (methode === 'POST' && /\/api\/maintenance-requests$/.test(new URL(String(url), 'http://api.test').pathname)) {
        return new Response(JSON.stringify({ data: { id: 91 } }), { status: 201 });
      }
      if (methode === 'POST' && String(url).includes('/photos')) {
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function monter(props: { initialPropertyId?: number | null } = {}, locale: 'fr' | 'en' = 'fr') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <SignalementDuLocataire {...props} />
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
      locale,
    ),
  );
}

async function formulaire(): Promise<HTMLFormElement> {
  return (await screen.findByText('Prendre une photo')).closest('form') as HTMLFormElement;
}

const envoi = () => appels.filter((a) => a.methode === 'POST' && !a.url.includes('/photos'));

describe('SignalementDuLocataire — TCK-2654', () => {
  it('AC1 — le premier champ du formulaire est l’entrée photo, avec capture="environment"', async () => {
    monter();
    const form = await formulaire();
    const premier = form.querySelector('input, select, textarea');
    expect(premier).toHaveAttribute('type', 'file');
    expect(premier).toHaveAttribute('capture', 'environment');
    // Plus de champ natif « Choose Files » visible : l'entrée est sous son libellé stylé.
    expect(premier).toHaveClass('sr-only');
  });

  it('AC2 — Eau, « Oui, ça ne peut pas attendre », Envoyer : plumbing, urgent, un titre, sans description', async () => {
    monter();
    const form = await formulaire();
    fireEvent.click(within(form).getByRole('radio', { name: 'Eau' }));
    fireEvent.click(within(form).getByRole('radio', { name: /Oui, ça ne peut pas attendre/ }));
    fireEvent.submit(form);

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/maintenance/91/envoyee'));
    expect(envoi()).toHaveLength(1);
    expect(envoi()[0].corps).toEqual({
      property_id: 44,
      lease_id: 5,
      title: 'Problème d’eau',
      category: 'plumbing',
      priority: 'urgent',
    });
    expect(envoi()[0].corps).not.toHaveProperty('description');
  });

  it('« Ça peut attendre » donne normal, et « En deux mots » devient la description', async () => {
    monter();
    const form = await formulaire();
    fireEvent.click(within(form).getByRole('radio', { name: 'Porte, serrure' }));
    fireEvent.click(within(form).getByRole('radio', { name: /Ça peut attendre quelques jours/ }));
    fireEvent.change(within(form).getByLabelText(/En deux mots/), { target: { value: '  La clé tourne dans le vide  ' } });
    fireEvent.submit(form);

    await waitFor(() => expect(envoi()).toHaveLength(1));
    expect(envoi()[0].corps).toMatchObject({ category: 'locksmith', priority: 'normal', title: 'Problème de porte ou de serrure', description: 'La clé tourne dans le vide' });
  });

  it('les six tuiles se projettent sur l’énumération de l’API', async () => {
    monter();
    const form = await formulaire();
    const tuiles = within(form).getAllByRole('radio').slice(0, 6) as HTMLInputElement[];
    expect(tuiles.map((r) => r.value)).toEqual(['plumbing', 'electrical', 'locksmith', 'pest_control', 'appliance', 'other']);
    expect(tuiles.map((r) => r.closest('label')?.textContent)).toEqual(['Eau', 'Électricité', 'Porte, serrure', 'Nuisibles', 'Électroménager', 'Autre']);
  });

  it('le titre se lit dans la langue de l’écran', async () => {
    monter({}, 'en');
    const form = (await screen.findByText('Take a photo')).closest('form') as HTMLFormElement;
    fireEvent.click(within(form).getByRole('radio', { name: 'Water' }));
    fireEvent.submit(form);
    await waitFor(() => expect(envoi()).toHaveLength(1));
    expect(envoi()[0].corps).toMatchObject({ title: 'Water problem', priority: 'normal' });
  });

  it('sans « C’est quoi ? », rien ne part et l’écran le dit', async () => {
    monter();
    const form = await formulaire();
    fireEvent.submit(form);
    expect(await within(form).findByRole('alert')).toHaveTextContent('Choisissez ce qui ne va pas.');
    expect(envoi()).toHaveLength(0);
  });

  it('les photos s’ajoutent, se retirent, et le total reste à 20', async () => {
    monter();
    const form = await formulaire();
    const [appareil, galerie] = form.querySelectorAll('input[type="file"]');
    fireEvent.change(appareil, { target: { files: [photo('a.jpg')] } });
    fireEvent.change(galerie, { target: { files: [photo('b.jpg'), photo('c.jpg')] } });
    expect(within(form).getByText(/3 photos sur 20/)).toBeInTheDocument();

    fireEvent.click(within(form).getByRole('button', { name: 'Retirer la photo 2' }));
    expect(within(form).getByText(/2 photos sur 20/)).toBeInTheDocument();

    const vingt = Array.from({ length: 20 }, (_, i) => photo(`g-${i}.jpg`));
    fireEvent.change(form.querySelector('[data-slot="photo-galerie"]') as HTMLInputElement, { target: { files: vingt } });
    expect(within(form).getByText(/20 photos sur 20/)).toBeInTheDocument();
    expect(within(form).getByRole('alert')).toHaveTextContent('2 photos n’ont pas été ajoutées : 20 au plus.');
    // À 20, la galerie ne s'offre plus.
    expect(form.querySelector('[data-slot="photo-galerie"]')).toBeNull();
  });

  it('les photos partent une à une après la demande, dans l’ordre', async () => {
    monter();
    const form = await formulaire();
    const [appareil] = form.querySelectorAll('input[type="file"]');
    fireEvent.change(appareil, { target: { files: [photo('a.jpg')] } });
    fireEvent.change(form.querySelector('[data-slot="photo-galerie"]') as HTMLInputElement, { target: { files: [photo('b.jpg')] } });
    fireEvent.click(within(form).getByRole('radio', { name: 'Eau' }));
    fireEvent.submit(form);

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/maintenance/91/envoyee'));
    const envois = appels.filter((a) => a.url.includes('/api/maintenance-requests/91/photos'));
    expect(envois).toHaveLength(2);
    expect(envois.map((a) => ((a.corps as FormData).getAll('photos[]')[0] as File).name)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('plusieurs logements : « Quel logement ? » d’abord, puis la bannière et « Changer »', async () => {
    baux = [bail(5, 44, 'Garage à Ouest Foire'), bail(6, 45, 'Studio Mermoz')];
    monter();
    fireEvent.click(await screen.findByRole('button', { name: 'Studio Mermoz' }));
    const form = await formulaire();
    expect(within(form).getByText('Studio Mermoz')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Changer' }));
    expect(await screen.findByText('Quel logement ?')).toBeInTheDocument();
  });

  it('un seul logement : retenu sans question, et ?property= étranger ignoré', async () => {
    monter({ initialPropertyId: 999 });
    const form = await formulaire();
    expect(within(form).getByText('Garage à Ouest Foire')).toBeInTheDocument();
    expect(within(form).queryByRole('button', { name: 'Changer' })).toBeNull();
  });
});
