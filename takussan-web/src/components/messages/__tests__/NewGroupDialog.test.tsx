import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { NewGroupDialog } from '../NewGroupDialog';

/**
 * TCK-085 — l'assistant de création d'un groupe.
 *
 * TCK-565 — retour testeur du 2026-09-23 :
 *   - M12 : on choisit les participants PAR LEUR NOM, parmi ceux que l'API renvoie — plus aucun
 *     champ « ID utilisateur » ;
 *   - M11 : le bien et le bail se choisissent dans des listes empilées — plus aucune saisie
 *     d'identifiant, plus de grille à deux colonnes qui les décalait.
 *
 * Le réseau est simulé au niveau de `fetch`, pas en remplaçant les hooks : le contrat testé est
 * aussi celui de l'URL (chemin `/api/...`, sparse fieldset, `filter[search]`). Seule la mutation de
 * création est remplacée, pour lire le corps envoyé.
 */

const mutateAsyncMock = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton' }),
}));

vi.mock('@/lib/queries/conversations', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/queries/conversations')>();
  return {
    ...reel,
    useCreateGroupConversation: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
  };
});

const CONTACTS = [
  { id: 5, name: 'Awa Sarr', avatar_url: null },
  { id: 6, name: 'Moussa Ndiaye', avatar_url: null },
  { id: 7, name: 'Khady Ba', avatar_url: null },
];

type Appel = { url: URL };

function pagine<T>(data: T[]) {
  return {
    data,
    meta: { total: data.length, per_page: 100, current_page: 1, last_page: 1 },
  };
}

function mockApi() {
  const appels: Appel[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      appels.push({ url });
      let corps: unknown = pagine([]);
      if (url.pathname.endsWith('/api/conversations/contacts')) {
        const terme = (url.searchParams.get('filter[search]') ?? '').toLowerCase();
        corps = pagine(CONTACTS.filter((c) => c.name.toLowerCase().includes(terme)));
      } else if (url.pathname.endsWith('/api/properties')) {
        corps = pagine([{ id: 31, title: 'Villa Almadies' }]);
      } else if (url.pathname.endsWith('/api/leases')) {
        corps = pagine([
          { id: 41, reference_number: 'BAIL-2026-041', property_id: 31, property: { id: 31, title: 'Villa Almadies' } },
        ]);
      }
      return { ok: true, status: 200, json: async () => corps };
    }),
  );
  return appels;
}

function rendre(props: Partial<Parameters<typeof NewGroupDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <NewGroupDialog open onClose={props.onClose ?? (() => {})} onCreated={props.onCreated} />
      </QueryClientProvider>,
    ),
  );
}

let appels: Appel[] = [];

/**
 * jsdom ne calcule aucune mise en page (pas de CSS) : on ne peut pas y mesurer que deux champs
 * sont l'un sous l'autre. On vérifie donc ce qui les y met — les classes du conteneur et de chaque
 * champ, et l'absence de style en ligne.
 *
 * ⚠️ **C'est une LISTE BLANCHE, et elle doit le rester.** Deux listes noires successives ont été
 * contournées : la première ne refusait que `grid-cols-*` (`flex gap-3` passait), la seconde
 * refusait aussi `flex` sans `flex-col`, `flex-row`, `columns-*` et `table` — et
 * `grid grid-flow-col auto-cols-fr` remettait les deux champs côte à côte, à 10/10 verts (relevé
 * du vérificateur, réparation 2). Tailwind a trop de façons de mettre deux blocs en ligne pour
 * qu'on les énumère ; on énumère plutôt celles, peu nombreuses, qui les gardent EMPILÉS. Tout
 * autre jeton — préfixé d'un point de rupture ou non — est refusé : il faudra l'ajouter ici en
 * connaissance de cause. La mesure réelle à 360 px est dans le ticket.
 */
const JETONS_EMPILES: RegExp[] = [
  /^space-y-[\d.]+$/, // marge verticale entre enfants : ne change pas le flux
  /^gap(?:-y)?-[\d.]+$/, // espacement, sans effet sur le sens
  /^flex$/, // seulement avec `flex-col`, vérifié plus bas
  /^flex-col$/,
  /^grid$/, // une grille sans colonnes déclarées empile ses enfants
  /^grid-cols-1$/,
  /^w-full$/,
  /^[mp][tby]?-[\d.]+$/, // marges et remplissages verticaux ou uniformes
];

function dispositionHorsPile(element: HTMLElement): string | null {
  const style = element.getAttribute('style');
  if (style && style.trim() !== '') return `style="${style}"`;
  const jetons = element.className.split(/\s+/).filter(Boolean);
  for (const jeton of jetons) {
    if (!JETONS_EMPILES.some((motif) => motif.test(jeton))) return jeton;
  }
  if (jetons.includes('flex') && !jetons.includes('flex-col')) return 'flex (sans flex-col)';
  return null;
}

/**
 * Cherche puis choisit. On attend que la requête de RECHERCHE soit partie (après l'anti-rebond)
 * avant de cliquer : sinon le clic porterait sur la liste initiale, non filtrée, et le test ne
 * prouverait rien de la recherche serveur.
 */
async function choisir(user: ReturnType<typeof userEvent.setup>, recherche: string, nom: string) {
  const champ = screen.getByLabelText('Participants');
  await user.click(champ);
  await user.type(champ, recherche);
  await waitFor(() =>
    expect(
      appels.some(
        ({ url }) =>
          url.pathname === '/api/conversations/contacts' &&
          url.searchParams.get('filter[search]') === recherche,
      ),
    ).toBe(true),
  );
  await user.click(await screen.findByRole('option', { name: nom }));
}

describe('<NewGroupDialog>', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    appels = mockApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('M12 — ne demande aucun identifiant : le champ cherche par nom', () => {
    rendre();

    const champ = screen.getByLabelText('Participants');
    expect(champ).toHaveAttribute('placeholder', 'Rechercher par nom…');
    expect(champ).not.toHaveAttribute('type', 'number');
    expect(screen.queryByPlaceholderText('ID utilisateur')).not.toBeInTheDocument();
    expect(screen.queryByText(/IDs/)).not.toBeInTheDocument();
  });

  it('M12 — cherche côté serveur, avec le sparse fieldset, et ajoute la personne PAR SON NOM', async () => {
    const user = userEvent.setup();
    rendre();

    await choisir(user, 'Awa', 'Awa Sarr');

    const puces = screen.getByTestId('participant-chips');
    expect(within(puces).getByText('Awa Sarr')).toBeInTheDocument();
    expect(within(puces).queryByText(/#\d+/)).not.toBeInTheDocument();

    const recherche = appels.find(
      ({ url }) =>
        url.pathname === '/api/conversations/contacts' &&
        url.searchParams.get('filter[search]') === 'Awa',
    );
    expect(recherche).toBeDefined();
    expect(recherche?.url.searchParams.get('fields[users]')).toBe('id,first_name,last_name');
  });

  it("une personne déjà choisie n'est plus proposée : le doublon est impossible à produire", async () => {
    const user = userEvent.setup();
    rendre();

    await choisir(user, 'Awa', 'Awa Sarr');

    const champ = screen.getByLabelText('Participants');
    await user.click(champ);
    await user.type(champ, 'a');
    await screen.findByRole('option', { name: 'Moussa Ndiaye' });
    expect(screen.queryByRole('option', { name: 'Awa Sarr' })).not.toBeInTheDocument();
  });

  it('retire une personne par son nom', async () => {
    const user = userEvent.setup();
    rendre();

    await choisir(user, 'Awa', 'Awa Sarr');
    await user.click(screen.getByRole('button', { name: 'Retirer Awa Sarr' }));

    expect(screen.queryByTestId('participant-chips')).not.toBeInTheDocument();
  });

  it('refuses to advance to step 2 with too few participants', async () => {
    const user = userEvent.setup();
    rendre();

    await choisir(user, 'Awa', 'Awa Sarr');
    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(await screen.findByText(/Minimum 3 participants au total/)).toBeInTheDocument();
  });

  it("M11 — l'étape 2 propose le bien et le bail dans des listes, plus aucune saisie d'identifiant", async () => {
    const user = userEvent.setup();
    rendre();

    await choisir(user, 'Awa', 'Awa Sarr');
    await choisir(user, 'Moussa', 'Moussa Ndiaye');
    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    const contexte = await screen.findByTestId('group-context-fields');
    expect(contexte.querySelector('input[type="number"]')).toBeNull();
    // Empilés : aucune disposition en ligne, dont la hauteur des libellés décalait les champs.
    expect(dispositionHorsPile(contexte)).toBeNull();
    // Chaque champ est un bloc à part entière, dont le déclencheur occupe toute la largeur.
    const champs = Array.from(contexte.children) as HTMLElement[];
    expect(champs).toHaveLength(2);
    for (const champ of champs) {
      expect(dispositionHorsPile(champ)).toBeNull();
      expect(champ.querySelector('[role="combobox"]')).toHaveClass('w-full');
    }
    expect(screen.getByLabelText('Bien (optionnel)')).toHaveAttribute('role', 'combobox');
    expect(screen.getByLabelText('Bail (optionnel)')).toHaveAttribute('role', 'combobox');

    // Les options viennent de ce que l'API montre à l'utilisateur, en sparse fieldset.
    await waitFor(() =>
      expect(appels.some(({ url }) => url.pathname === '/api/properties')).toBe(true),
    );
    const biens = appels.find(({ url }) => url.pathname === '/api/properties');
    expect(biens?.url.searchParams.get('fields[properties]')).toBe('id,title');
  });

  it('crée le groupe avec les identifiants des personnes choisies et le bien choisi', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    rendre({ onCreated, onClose });

    await choisir(user, 'Awa', 'Awa Sarr');
    await choisir(user, 'Moussa', 'Moussa Ndiaye');
    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    await user.type(screen.getByLabelText('Sujet'), 'Visite Almadies');
    await user.click(screen.getByLabelText('Bien (optionnel)'));
    await user.click(await screen.findByRole('option', { name: 'Villa Almadies' }));
    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      type: 'group',
      subject: 'Visite Almadies',
      participants: [5, 6],
      property_id: 31,
    });
    expect(onCreated).toHaveBeenCalledWith(99);
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * M13, côté écran : l'API rend une phrase localisée par problème dans `errors`, mais le
   * `message` d'une 422 reste le RÉSUMÉ du framework — la première, puis « (and 1 more error) ».
   * L'écran affichait ce résumé (`messageErreurApi` lit `message`) : la seconde erreur était
   * cachée, et le suffixe restait en anglais. Aucun test ne tenait l'affichage.
   */
  async function jusquALaCreation(user: ReturnType<typeof userEvent.setup>) {
    await choisir(user, 'Awa', 'Awa Sarr');
    await choisir(user, 'Moussa', 'Moussa Ndiaye');
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    await user.type(screen.getByLabelText('Sujet'), 'Visite Almadies');
    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
  }

  it("M13 — affiche CHAQUE phrase de l'API, jamais le résumé « (and 1 more error) »", async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockRejectedValue(
      new ApiError(422, {
        message: 'Certaines personnes choisies ne peuvent pas être ajoutées. (and 1 more error)',
        errors: {
          participants: ['Certaines personnes choisies ne peuvent pas être ajoutées.'],
          property_id: ['Vous ne pouvez pas rattacher le groupe à cet élément.'],
        },
      }),
    );
    rendre();

    await jusquALaCreation(user);

    const alerte = await screen.findByRole('alert');
    expect(within(alerte).getByText('Certaines personnes choisies ne peuvent pas être ajoutées.')).toBeInTheDocument();
    expect(within(alerte).getByText('Vous ne pouvez pas rattacher le groupe à cet élément.')).toBeInTheDocument();
    expect(alerte).not.toHaveTextContent(/more error|autre erreur/);
  });

  it('M13 — une même phrase répétée par plusieurs clés ne s’affiche qu’une fois', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockRejectedValue(
      new ApiError(422, {
        message: 'Une personne choisie n’est plus disponible. (and 1 more error)',
        errors: {
          'participants.0': ['Une personne choisie n’est plus disponible.'],
          'participants.1': ['Une personne choisie n’est plus disponible.'],
        },
      }),
    );
    rendre();

    await jusquALaCreation(user);

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent(/^Une personne choisie n’est plus disponible\.$/);
  });

  it("hors validation, garde le libellé d'échec de l'écran", async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockRejectedValue(new ApiError(500, {}));
    rendre();

    await jusquALaCreation(user);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent(/API error/);
  });
});
