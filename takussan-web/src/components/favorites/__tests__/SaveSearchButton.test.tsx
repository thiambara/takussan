import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import { SaveSearchButton } from '../SaveSearchButton';

/**
 * TCK-292 (lot L) — **ce composant n'avait aucun test**, et c'est pour cela que sa régression est
 * passée : `savedSearchPayloadSchema.safeParse()` rend un message qui porte une CLÉ, et le
 * composant le posait tel quel dans `setNameError`. L'utilisateur lisait
 * `validation.search.savedSearchNameRequired`.
 *
 * Le libellé attendu ci-dessous est celui d'AVANT la conversion, au caractère près — relevé par
 * `git show HEAD:takussan-web/src/lib/schemas/search.ts` (AC3 du ticket).
 */
const LIBELLE_AVANT_CONVERSION = 'Donnez un nom à cette recherche.';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

const mutateAsync = vi.fn();
vi.mock('@/lib/queries/saved-searches', () => ({
  useCreateSavedSearchMutation: () => ({ mutateAsync, isPending: false }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<SaveSearchButton> — le message de validation qui partait en clé brute', () => {
  beforeEach(() => {
    push.mockReset();
    mutateAsync.mockReset();
  });

  it('affiche le libellé français, PAS la clé, quand le nom est vide', async () => {
    const user = userEvent.setup();
    render(wrap(<SaveSearchButton filters={{ city: 'Dakar' }} activeCount={1} />));

    await user.click(screen.getByRole('button', { name: 'Sauvegarder la recherche' }));

    const champ = await screen.findByLabelText('Nom');
    // UN ESPACE, et non le champ vide — et ce détail est le chemin RÉEL de la régression.
    // L'`<input>` porte `required` : vide, la validation native du navigateur bloque la soumission
    // et `safeParse` n'est jamais atteint. C'est `name.trim()` côté composant qui ramène « " " » à
    // la chaîne vide, fait échouer le `min(1)` du schéma, et pose le message à l'écran.
    await user.clear(champ);
    await user.type(champ, ' ');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(LIBELLE_AVANT_CONVERSION)).toBeInTheDocument();
    expect(screen.queryByText(/^validation\./)).toBeNull();
    attendAucuneCleBrute();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
