/**
 * TCK-2589 (lot C) — le fil de la fiche client :
 *  · AC2 — « Demande reçue » (avec le message), « Réponse WhatsApp (Sokhna) », « Visite confirmée »,
 *    « Compte rendu : Intéressé », dans cet ordre de lecture (du plus ancien au plus récent) ;
 *  · 1a — un geste sur la demande est une « Réponse », sur la fiche un « Appel » / « WhatsApp » ;
 *  · 4a — le filtre vit dans l'URL (`?fil=…`) et part au serveur ;
 *  · 2b — les épinglées en tête ET à leur date, sous des clés distinctes, sans aucun nombre ;
 *  · 3a — la saisie crée une note (épinglée ou non) ou une tâche ; un refus se dit sur place, le
 *    texte reste, et un double toucher n'envoie qu'une fois ;
 *  · 6a — chaque visite mène à sa fiche.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import { withIntl } from '@/test/intl';
import type { CustomerDetail, CustomerNote } from '@/types/customer';

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: nav.refresh }),
  useSearchParams: () => nav.params,
  usePathname: () => '/app/customers/7',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 }, isLoading: false }) }));

const api = vi.hoisted(() => ({ fil: vi.fn(), note: vi.fn(), tache: vi.fn() }));
vi.mock('@/lib/queries/customer-timeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/customer-timeline')>()),
  fetchCustomerTimeline: (...a: unknown[]) => api.fil(...a),
}));
vi.mock('@/lib/queries/customers', async (original) => ({
  ...(await original<typeof import('@/lib/queries/customers')>()),
  createCustomerNote: (...a: unknown[]) => api.note(...a),
}));
vi.mock('@/lib/queries/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/pipeline')>()),
  createCustomerTask: (...a: unknown[]) => api.tache(...a),
}));

import { FilDuClient } from '../FilDuClient';

const CLIENT = { id: 7, first_name: 'Mouhamed', last_name: 'Dieng' } as CustomerDetail;
const SOKHNA = { id: 4, name: 'Sokhna Ba' };

/** Le fil d'AC2, tel que l'API le rend : du plus récent au plus ancien. */
const AC2: EntreeDuFil[] = [
  { type: 'note', id: 30, at: '2026-11-07T11:30:00+00:00', kind: 'visit_report', body: 'A aimé la terrasse', pinned: false, property_visit_id: 9, author: SOKHNA, report: { visit_id: 9, outcome: 'interested', objections: ['price'], follow_up: null } },
  { type: 'visit', id: 9, at: '2026-11-04T09:00:00+00:00', milestone: 'confirmed', status: 'confirmed', scheduled_at: '2026-11-08T10:00:00+00:00', property: { id: 3, title: 'Studio meublé · Mermoz' } },
  { type: 'contact', id: 21, at: '2026-11-03T15:02:00+00:00', channel: 'whatsapp', on: 'lead', causer: SOKHNA },
  { type: 'visit', id: 9, at: '2026-11-03T14:40:00+00:00', milestone: 'created', status: 'confirmed', scheduled_at: '2026-11-08T10:00:00+00:00', property: { id: 3, title: 'Studio meublé · Mermoz' } },
  { type: 'note', id: 29, at: '2026-11-03T14:31:00+00:00', kind: 'lead_message', body: 'Une visite samedi est-elle possible ?', pinned: false, property_visit_id: null, author: null },
];

const page = (data: EntreeDuFil[], current_page = 1, last_page = 1) => ({ data, meta: { total: data.length, per_page: 20, current_page, last_page } });

function rendu(notes: readonly CustomerNote[] = [], demandeDeSaisie = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <FilDuClient customer={CLIENT} notes={notes} demandeDeSaisie={demandeDeSaisie} />
      </QueryClientProvider>,
    ),
  );
}

const lignes = () => Array.from(document.querySelectorAll('[data-slot="entrees-du-fil"] > li'));

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  api.fil.mockResolvedValue(page(AC2));
  api.note.mockResolvedValue({ id: 99 });
  api.tache.mockResolvedValue({ id: 98 });
});
afterEach(() => vi.restoreAllMocks());

describe('TCK-2589 — le fil de la fiche client', () => {
  it('AC2 — demande, réponse WhatsApp de Sokhna, visite confirmée, compte rendu, dans l’ordre de lecture', async () => {
    rendu();
    await screen.findByText('Compte rendu : Intéressé');
    const textes = lignes().map((l) => l.textContent ?? '');
    const lecture = [...textes].reverse();
    const rang = (motif: RegExp) => lecture.findIndex((t) => motif.test(t));
    expect(rang(/^Demande reçue/)).toBeLessThan(rang(/^Réponse WhatsApp.*Sokhna Ba/));
    expect(rang(/^Réponse WhatsApp.*Sokhna Ba/)).toBeLessThan(rang(/^Visite confirmée/));
    expect(rang(/^Visite confirmée/)).toBeLessThan(rang(/^Compte rendu : Intéressé/));
    expect(rang(/^Demande reçue/)).toBeGreaterThanOrEqual(0);
    expect(screen.getByText('« Une visite samedi est-elle possible ? »')).toBeInTheDocument();
    expect(screen.getByText('Objections : Prix')).toBeInTheDocument();
  });

  it('1a — un geste sur la fiche se dit par son canal, sans « Réponse »', async () => {
    api.fil.mockResolvedValue(page([
      { type: 'contact', id: 1, at: '2026-11-06T11:05:00+00:00', channel: 'call', on: 'customer', causer: SOKHNA },
      { type: 'contact', id: 2, at: '2026-11-05T11:05:00+00:00', channel: 'whatsapp', on: 'customer', causer: null },
    ]));
    rendu();
    expect(await screen.findByText('Appel')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.queryByText(/^Réponse/)).toBeNull();
  });

  it('6a — chaque visite mène à sa fiche ; une visite encore demandée dit « à confirmer »', async () => {
    api.fil.mockResolvedValue(page([
      { type: 'visit', id: 12, at: '2026-11-10T09:12:00+00:00', milestone: 'created', status: 'scheduled', scheduled_at: '2026-11-12T10:00:00+00:00', property: { id: 3, title: 'Studio meublé · Mermoz' } },
    ]));
    rendu();
    const lien = await screen.findByRole('link', { name: /^Visite demandée pour / });
    expect(lien).toHaveAttribute('href', '/app/visits/12');
    expect(screen.getByText('Studio meublé · Mermoz · à confirmer')).toBeInTheDocument();
  });

  it('l’étape se dit de l’une à l’autre', async () => {
    api.fil.mockResolvedValue(page([{ type: 'stage', id: 5, at: '2026-11-04T18:02:00+00:00', from: 'lead', to: 'prospect', causer: SOKHNA }]));
    rendu();
    expect(await screen.findByText('Étape : Lead → Prospect')).toBeInTheDocument();
  });

  it('4a — le filtre se pose dans l’URL, et celui de l’URL part au serveur', async () => {
    rendu();
    await screen.findByText('Compte rendu : Intéressé');
    expect(api.fil).toHaveBeenLastCalledWith('jeton', 7, { types: null, page: 1 });
    expect(screen.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Visites' }));
    expect(nav.replace).toHaveBeenCalledWith('/app/customers/7?fil=visites', { scroll: false });
  });

  it('4a — ?fil=appels ne demande que les gestes de contact', async () => {
    nav.params = new URLSearchParams('fil=appels');
    rendu();
    await waitFor(() => expect(api.fil).toHaveBeenCalledWith('jeton', 7, { types: ['contact'], page: 1 }));
    expect(screen.getByRole('button', { name: 'Appels' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('« Voir plus » lit la page suivante et l’ajoute à la suite', async () => {
    api.fil.mockImplementation(async (_t: string, _id: number, { page: p }: { page: number }) =>
      p === 1 ? page(AC2.slice(0, 2), 1, 2) : page(AC2.slice(2), 2, 2),
    );
    rendu();
    await screen.findByText('Compte rendu : Intéressé');
    expect(screen.queryByText('Demande reçue')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Voir plus' }));
    expect(await screen.findByText('Demande reçue')).toBeInTheDocument();
    expect(api.fil).toHaveBeenLastCalledWith('jeton', 7, { types: null, page: 2 });
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('un fil illisible se dit, et se relit', async () => {
    api.fil.mockRejectedValueOnce(new ApiError(500, {}));
    rendu();
    expect(await screen.findByText('Le fil n’a pas pu être chargé.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Compte rendu : Intéressé')).toBeInTheDocument();
  });

  it('2b — une épinglée paraît en tête et à sa date, sous deux clés, sans aucun nombre', async () => {
    const erreurs = vi.spyOn(console, 'error');
    api.fil.mockResolvedValue(page([{ type: 'note', id: 40, at: '2026-11-08T16:40:00+00:00', kind: null, body: 'Budget ferme à 250 000', pinned: true, property_visit_id: null, author: SOKHNA }]));
    rendu([{ id: 40, customer_id: 7, author_id: 4, author_name: 'Sokhna Ba', body: 'Budget ferme à 250 000', pinned: true, kind: null, created_at: '2026-11-08T16:40:00+00:00', updated_at: '2026-11-08T16:40:00+00:00' }]);
    await waitFor(() => expect(document.querySelector('[data-slot="entrees-du-fil"]')).not.toBeNull());
    const tete = document.querySelector('[data-slot="epinglees-du-fil"]') as HTMLElement;
    expect(within(tete).getByText('Budget ferme à 250 000')).toBeInTheDocument();
    expect(screen.getAllByText('Budget ferme à 250 000')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Note épinglée' })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="fil-de-la-fiche"]')?.textContent).not.toMatch(/\(\d+\)|\d+\s+(notes?|épinglées?)\b/i);
    expect(erreurs.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('3a — une note épinglée : envoyée une fois, le texte vidé, la page relue pour ses épinglées', async () => {
    let finir: () => void = () => {};
    api.note.mockReturnValue(new Promise<void>((r) => { finir = r; }));
    rendu();
    await userEvent.type(screen.getByRole('textbox', { name: 'Ajouter une note sur Mouhamed…' }), 'Rappeler samedi');
    await userEvent.click(screen.getByRole('button', { name: 'Épingler' }));
    const ajouter = screen.getByRole('button', { name: 'Ajouter' });
    await userEvent.click(ajouter);
    await userEvent.click(ajouter);
    expect(api.note).toHaveBeenCalledTimes(1);
    expect(api.note).toHaveBeenCalledWith('jeton', 7, 'Rappeler samedi', true);
    finir();
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('3a — une tâche refusée : le refus se dit sur place, le texte reste', async () => {
    api.tache.mockRejectedValue(new ApiError(422, { message: 'Le titre ne peut dépasser 255 caractères.', errors: { title: ['Le titre ne peut dépasser 255 caractères.'] } }));
    rendu();
    await userEvent.click(screen.getByRole('button', { name: 'Tâche' }));
    const champ = screen.getByRole('textbox', { name: 'Une tâche pour Mouhamed…' });
    await userEvent.type(champ, 'Envoyer le bail');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(api.tache).toHaveBeenCalledWith('jeton', 7, { title: 'Envoyer le bail' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
    expect(champ).toHaveValue('Envoyer le bail');
    expect(api.note).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Épingler' })).toBeNull();
  });

  it('une saisie vide n’envoie rien et le dit', async () => {
    rendu();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    const alerte = screen.getByRole('alert');
    expect(alerte).toHaveTextContent('Écrivez d’abord la note.');
    // TCK-868 — le champ refusé dit pourquoi : il est relié à son message.
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', alerte.id);
    expect(api.note).not.toHaveBeenCalled();
  });

  it('au téléphone, la saisie n’est ouverte que par la barre, dans le mode touché', () => {
    const { rerender } = rendu();
    const saisie = document.querySelector('[data-slot="saisie-du-fil"]') as HTMLElement;
    expect(saisie.className).toMatch(/max-md:hidden/);
    const client = new QueryClient();
    rerender(
      withIntl(
        <QueryClientProvider client={client}>
          <FilDuClient customer={CLIENT} notes={[]} demandeDeSaisie={{ mode: 'tache', jeton: 1 }} />
        </QueryClientProvider>,
      ),
    );
    expect((document.querySelector('[data-slot="saisie-du-fil"]') as HTMLElement).className).not.toMatch(/max-md:hidden/);
    expect(screen.getByRole('button', { name: 'Tâche' })).toHaveAttribute('aria-pressed', 'true');
  });
});
