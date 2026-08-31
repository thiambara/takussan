import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

const refreshUser = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, refreshUser }),
}));

import { QuestionDIntention } from '../QuestionDIntention';

const T = frMessages.onboarding.intention;

function monter(apres = '/app') {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <QuestionDIntention apres={apres} />
    </NextIntlClientProvider>,
  );
}

/**
 * TCK-493 — la question d'orientation posée après la création du compte.
 *
 * ⚠ Ce que ces tests gardent en priorité : **la réponse ORIENTE, elle
 * n'attribue rien**, et **passer s'enregistre**. Le second point est le moins
 * évident — un « passer » qui n'écrirait rien reposerait la question à la
 * connexion suivante, ce qui n'est pas passer.
 */
describe('<QuestionDIntention>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  it('propose deux réponses, dans un vrai groupe de radios', () => {
    monter();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('group', { name: T.legend })).toBeInTheDocument();
  });

  it('« je cherche un logement » mène à la recherche', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('radio', { name: new RegExp(T.options.search.title) }));
    await user.click(screen.getByRole('button', { name: T.submit }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/properties'));
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ entry_intent: 'search' });
  });

  it('« je veux publier » mène à l’assistant hôte', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('radio', { name: new RegExp(T.options.publish.title) }));
    await user.click(screen.getByRole('button', { name: T.submit }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding/host'));
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ entry_intent: 'publish' });
  });

  it('passer mène à la destination demandée, ET s’enregistre', async () => {
    // AC4 — sans l'écriture, « passer » deviendrait « repousser » : la question
    // reviendrait à la connexion suivante.
    const user = userEvent.setup();
    monter('/app/properties/42');

    await user.click(screen.getByRole('button', { name: T.skip }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app/properties/42'));
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ entry_intent: 'skipped' });
  });

  it('n’enferme personne quand l’enregistrement échoue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.error);
    expect(replace).not.toHaveBeenCalled();
    // Et le bouton « passer » reste disponible : une panne d'enregistrement ne
    // doit pas bloquer l'accès au produit.
    expect(screen.getByRole('button', { name: T.skip })).toBeEnabled();
  });

  it('rafraîchit le compte avant de partir — sinon un retour arrière rouvre la question', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.submit }));

    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
  });
});
