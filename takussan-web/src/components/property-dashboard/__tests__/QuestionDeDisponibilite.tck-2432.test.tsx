import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

/**
 * TCK-2432 — l'annonce d'origine d'un bien publié par le Radar a disparu : la fiche pose la question au titulaire, avec
 * trois gestes (loué, vendu, toujours disponible). Rien sans question ouverte.
 */

const api = vi.hoisted(() => ({ lire: vi.fn(), repondre: vi.fn() }));
vi.mock('@/lib/queries/disponibilite-du-bien', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/disponibilite-du-bien')>()),
  lireQuestionDeDisponibilite: (...a: unknown[]) => api.lire(...a),
  repondreQuestionDeDisponibilite: (...a: unknown[]) => api.repondre(...a),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton' }) }));
const routeur = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

import { QuestionDeDisponibilite } from '../QuestionDeDisponibilite';

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <QuestionDeDisponibilite propertyId={42} />
    </QueryClientProvider>,
  ));
}

const OUVERTE = { data: { property_id: 42, open: true, asked_at: '2026-10-29T08:20:00+00:00' } };

describe('TCK-2432 — la question de disponibilité sur la fiche du bien', () => {
  beforeEach(() => {
    api.lire.mockReset();
    api.repondre.mockReset();
    routeur.refresh.mockReset();
  });

  it('rien sans question ouverte', async () => {
    api.lire.mockResolvedValue({ data: { property_id: 42, open: false, asked_at: null } });
    monter();
    await waitFor(() => expect(api.lire).toHaveBeenCalled());
    // La lecture résolue ne rend toujours rien (une attente bornée : rien ne doit apparaître).
    await expect(screen.findByTestId('question-de-disponibilite', {}, { timeout: 300 })).rejects.toThrow();
  });

  it('la question ouverte offre les trois gestes et dit depuis quand', async () => {
    api.lire.mockResolvedValue(OUVERTE);
    monter();
    expect(await screen.findByRole('heading', { name: 'Ce bien est-il toujours disponible ?' })).toBeInTheDocument();
    expect(screen.getByText(/29 octobre 2026/)).toBeInTheDocument();
    for (const libelle of ['Il est loué', 'Il est vendu', 'Toujours disponible']) {
      expect(screen.getByRole('button', { name: libelle })).toBeInTheDocument();
    }
    expect(api.lire).toHaveBeenCalledWith('jeton', 42, expect.anything());
  });

  it('« Il est loué » envoie la réponse, remercie et rafraîchit la fiche', async () => {
    api.lire.mockResolvedValue(OUVERTE);
    api.repondre.mockResolvedValue({ data: { property_id: 42, answer: 'rented', status: 'rented' } });
    monter();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Il est loué' }));

    expect(await screen.findByTestId('question-de-disponibilite-repondue')).toHaveTextContent('Merci, votre réponse est enregistrée.');
    expect(api.repondre).toHaveBeenCalledWith('jeton', 42, 'rented', expect.anything());
    expect(routeur.refresh).toHaveBeenCalled();
  });

  it('un échec le dit, et laisse la question ouverte', async () => {
    api.lire.mockResolvedValue(OUVERTE);
    api.repondre.mockRejectedValue(new ApiError(500, { message: 'boum' }));
    monter();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Toujours disponible' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre réponse n’a pas pu être enregistrée. Réessayez.');
    expect(screen.getByTestId('question-de-disponibilite')).toBeInTheDocument();
    expect(api.repondre).toHaveBeenCalledWith('jeton', 42, 'available', expect.anything());
  });
});
