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

function pagine<T>(data: T[], total = data.length) {
  return {
    data,
    meta: { total, per_page: 20, current_page: 1, last_page: Math.max(1, Math.ceil(total / 20)) },
  };
}

/**
 * TCK-576 — le périmètre d'un agent de démo, en petit : 206 biens, dont « Espace de bureau à
 * Mbour » classé bien au-delà de la première page. C'est ce bien-là que l'ancienne liste (100
 * premiers, sans recherche) ne permettait pas de choisir.
 */
const BIENS = [
  { id: 31, title: 'Villa Almadies', reference_number: 'PR-ALMA0031' },
  ...Array.from({ length: 204 }, (_, i) => ({
    id: 1000 + i,
    title: `Appartement ${String(i).padStart(3, '0')}`,
    reference_number: `PR-APPT${i}`,
  })),
  { id: 145, title: 'Espace de bureau à Mbour', reference_number: 'PR-QWVI2KQS' },
];

const BAUX = [
  { id: 41, reference_number: 'BAIL-2026-041', property_id: 31, property: BIENS[0] },
  { id: 363, reference_number: 'LS-FC-DSZY4E', property_id: 145, property: BIENS[205] },
];

let echecBiens = false;
/** Un acteur qui ne voit encore aucun bien : l'API rend une liste vide SANS recherche. */
let aucunBien = false;
/**
 * TCK-576, réparation 1 — retient la réponse des baux d'UN bien (`filter[property_id]`) tant que
 * le test ne la libère pas : c'est la fenêtre où l'écran montrait les baux d'autres biens.
 */
let retenueBauxDuBien: Promise<void> | null = null;
/** Un locataire sans agence ni relation : l'API ne lui rend personne. */
let aucunContact = false;

function mockApi() {
  const appels: Appel[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      appels.push({ url });
      const terme = (url.searchParams.get('filter[search]') ?? '').toLowerCase();
      let corps: unknown = pagine([]);
      if (url.pathname.endsWith('/api/conversations/contacts')) {
        corps = pagine(aucunContact ? [] : CONTACTS.filter((c) => c.name.toLowerCase().includes(terme)));
      } else if (url.pathname.endsWith('/api/conversations/context/properties')) {
        if (echecBiens) return { ok: false, status: 500, json: async () => ({ message: 'boom' }) };
        const trouves = (aucunBien ? [] : BIENS).filter((b) =>
          terme.split(/\s+/).every((mot) => `${b.title} ${b.reference_number}`.toLowerCase().includes(mot)),
        );
        corps = pagine(trouves.slice(0, 20), trouves.length);
      } else if (url.pathname.endsWith('/api/conversations/context/leases')) {
        const bien = url.searchParams.get('filter[property_id]');
        if (bien && retenueBauxDuBien) await retenueBauxDuBien;
        corps = pagine(
          BAUX.filter((b) => !bien || String(b.property_id) === bien).filter((b) =>
            `${b.reference_number} ${b.property.title}`.toLowerCase().includes(terme),
          ),
        );
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
    echecBiens = false;
    aucunBien = false;
    retenueBauxDuBien = null;
    aucunContact = false;
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
    await user.click(await screen.findByRole('option', { name: /Villa Almadies/ }));
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

  // ── TCK-576 : le bien et le bail se CHERCHENT côté serveur ─────────────────────────────────────

  async function jusquALEtape2(user: ReturnType<typeof userEvent.setup>) {
    await choisir(user, 'Awa', 'Awa Sarr');
    await choisir(user, 'Moussa', 'Moussa Ndiaye');
    await user.click(screen.getByRole('button', { name: 'Suivant' }));
    await user.type(await screen.findByLabelText('Sujet'), 'Visite');
  }

  /** Tape dans un champ de contexte et attend que la requête de RECHERCHE soit partie. */
  async function chercher(
    user: ReturnType<typeof userEvent.setup>,
    libelle: string,
    chemin: string,
    recherche: string,
  ) {
    const champ = screen.getByLabelText(libelle);
    await user.click(champ);
    await user.type(champ, recherche);
    await waitFor(() =>
      expect(
        appels.some(
          ({ url }) => url.pathname === chemin && url.searchParams.get('filter[search]') === recherche,
        ),
      ).toBe(true),
    );
  }

  const CHEMIN_BIENS = '/api/conversations/context/properties';
  const CHEMIN_BAUX = '/api/conversations/context/leases';

  it('TCK-576 — un bien au-delà de la première page se trouve par la recherche serveur, et se rattache', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    rendre();
    await jusquALEtape2(user);

    // À l'ouverture : la première page, et la troncature DITE.
    await user.click(screen.getByLabelText('Bien (optionnel)'));
    expect(await screen.findByText('20 sur 206 — précisez la recherche')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Espace de bureau/ })).not.toBeInTheDocument();
    const ouverture = appels.find(({ url }) => url.pathname === CHEMIN_BIENS);
    expect(ouverture?.url.searchParams.get('fields[properties]')).toBe('id,title,reference_number');
    expect(ouverture?.url.searchParams.get('per_page')).toBe('20');
    expect(appels.some(({ url }) => url.pathname === '/api/properties')).toBe(false);

    await user.keyboard('{Escape}');
    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'bureau mbour');
    await user.click(await screen.findByRole('option', { name: /Espace de bureau à Mbour/ }));

    // La référence distingue deux homonymes ; le champ affiche le titre choisi.
    expect(screen.getByLabelText('Bien (optionnel)')).toHaveValue('Espace de bureau à Mbour');

    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: 145 }),
    );
    expect(mutateAsyncMock.mock.calls[0][0]).not.toHaveProperty('lease_id');
  });

  it('TCK-576 (TCK-565, X1/X2) — le bail choisi est ENVOYÉ, et c’est celui qu’on a choisi', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    rendre();
    await jusquALEtape2(user);

    await chercher(user, 'Bail (optionnel)', CHEMIN_BAUX, 'mbour');
    await user.click(await screen.findByRole('option', { name: /LS-FC-DSZY4E/ }));
    expect(screen.getByLabelText('Bail (optionnel)')).toHaveValue('LS-FC-DSZY4E');

    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      type: 'group',
      subject: 'Visite',
      participants: [5, 6],
      lease_id: 363,
    });
  });

  it('TCK-576 (TCK-565, X8) — les baux se restreignent au bien choisi, et changer de bien retire le bail', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    rendre();
    await jusquALEtape2(user);

    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'almadies');
    await user.click(await screen.findByRole('option', { name: /Villa Almadies/ }));

    await user.click(screen.getByLabelText('Bail (optionnel)'));
    await user.click(await screen.findByRole('option', { name: /BAIL-2026-041/ }));
    const requeteBaux = appels.filter(({ url }) => url.pathname === CHEMIN_BAUX).at(-1);
    expect(requeteBaux?.url.searchParams.get('filter[property_id]')).toBe('31');
    expect(requeteBaux?.url.searchParams.get('include')).toBe('property');
    expect(requeteBaux?.url.searchParams.get('fields[leases]')).toBe('id,reference_number,property_id');
    expect(screen.queryByRole('option', { name: /LS-FC-DSZY4E/ })).not.toBeInTheDocument();

    // Un autre bien : le bail d'Almadies ne peut pas rester rattaché.
    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'mbour');
    await user.click(await screen.findByRole('option', { name: /Espace de bureau à Mbour/ }));
    expect(screen.getByLabelText('Bail (optionnel)')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(mutateAsyncMock.mock.calls[0][0]).toMatchObject({ property_id: 145 });
    expect(mutateAsyncMock.mock.calls[0][0]).not.toHaveProperty('lease_id');
  });

  it('TCK-576 — la croix « Retirer le bien » (44 px) défait le rattachement', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    rendre();
    await jusquALEtape2(user);

    expect(screen.queryByRole('button', { name: 'Retirer le bien' })).not.toBeInTheDocument();
    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'almadies');
    await user.click(await screen.findByRole('option', { name: /Villa Almadies/ }));

    const croix = screen.getByRole('button', { name: 'Retirer le bien' });
    expect(croix).toHaveClass('size-11');
    await user.click(croix);
    expect(screen.getByLabelText('Bien (optionnel)')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(mutateAsyncMock.mock.calls[0][0]).not.toHaveProperty('property_id');
  });

  it('TCK-576 — un échec de chargement se dit et se réessaie', async () => {
    const user = userEvent.setup();
    echecBiens = true;
    rendre();
    await jusquALEtape2(user);

    await user.click(screen.getByLabelText('Bien (optionnel)'));
    const erreur = await screen.findByTestId('group-context-error');
    expect(erreur).toHaveTextContent('Impossible de charger la liste.');

    echecBiens = false;
    await user.click(within(erreur).getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('option', { name: /Villa Almadies/ })).toBeInTheDocument();
  });

  /**
   * TCK-565, risque résiduel soldé le 2026-09-24 : « un locataire sans agence ni relation préalable
   * n'a personne à inviter, et l'écran ne le lui dit pas ». Il le dit — à l'ouverture de la liste,
   * pas dans l'aide sous le champ —, mais aucun test ne le tenait. Distinct du « personne ne
   * correspond » d'une recherche : celui-là invite à reformuler, celui-ci dit qu'il n'y a rien à
   * chercher.
   */
  it('TCK-565 — sans personne à inviter, la liste le dit à l’ouverture, et pas « aucun résultat »', async () => {
    const user = userEvent.setup();
    aucunContact = true;
    rendre();

    await user.click(screen.getByLabelText('Participants'));
    expect(await screen.findByText('Vous n’avez encore personne à inviter.')).toBeInTheDocument();
    expect(screen.queryByText('Personne ne correspond à cette recherche.')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Participants'), 'Awa');
    expect(await screen.findByText('Personne ne correspond à cette recherche.')).toBeInTheDocument();
  });
  // ── TCK-576, réparation 1 (vérificateur du 2026-09-24) ─────────────────────────────────────────

  /**
   * Défaut MAJEUR relevé au navigateur (latence 2,5 s) : pendant que la requête
   * `filter[property_id]=<nouveau bien>` était en vol, la liste des baux gardait celle de la clé
   * PRÉCÉDENTE (`placeholderData: (precedent) => precedent`) — les baux de TOUS les biens, ou d'un
   * autre bien — et ils restaient cliquables. Le groupe partait avec `{property_id: 31,
   * lease_id: 363}`, un bail de Mbour sur la villa d'Almadies.
   */
  it('TCK-576 (X8) — pendant le chargement des baux d’un bien, aucun bail d’un AUTRE bien n’est proposé', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    rendre();
    await jusquALEtape2(user);

    // Les baux sans bien choisi : les deux, chargés et mis en cache.
    await user.click(screen.getByLabelText('Bail (optionnel)'));
    expect(await screen.findByRole('option', { name: /LS-FC-DSZY4E/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    let liberer!: () => void;
    retenueBauxDuBien = new Promise<void>((resolve) => {
      liberer = resolve;
    });

    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'almadies');
    await user.click(await screen.findByRole('option', { name: /Villa Almadies/ }));

    await user.click(screen.getByLabelText('Bail (optionnel)'));
    await waitFor(() =>
      expect(
        appels.some(
          ({ url }) => url.pathname === CHEMIN_BAUX && url.searchParams.get('filter[property_id]') === '31',
        ),
      ).toBe(true),
    );
    // La requête du bien est EN VOL : le bail de Mbour ne doit être ni montré ni cliquable.
    expect(screen.queryByRole('option', { name: /LS-FC-DSZY4E/ })).not.toBeInTheDocument();
    // (le libellé porte un gluon U+2060 : on le lit par motif)
    expect(screen.getByText(/^Recherche…/)).toBeInTheDocument();

    liberer();
    await user.click(await screen.findByRole('option', { name: /BAIL-2026-041/ }));
    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(mutateAsyncMock.mock.calls[0][0]).toMatchObject({ property_id: 31, lease_id: 41 });
  });

  /**
   * Reprise des défauts mineurs (2026-09-24) : le test précédent ne couvre que « aucun bien → un
   * bien ». Le passage d'un bien A à un bien B n'était gardé par rien : la condition mutée en
   * `… || requetePrecedente?.queryKey[3] != null ? precedent : undefined` (garder dès qu'un bien
   * était déjà choisi) laissait 22/22 verts. C'est pourtant le cas le plus fréquent — on se trompe
   * de bien, on en choisit un autre —, et la liste en vol montrait alors, cliquables, les baux du
   * PREMIER bien.
   */
  it('TCK-576 (X8) — en passant d’un bien à un autre, les baux du premier ne sont pas proposés pendant le chargement', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    rendre();
    await jusquALEtape2(user);

    // Bien A (Almadies) : ses baux, chargés et mis en cache.
    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'almadies');
    await user.click(await screen.findByRole('option', { name: /Villa Almadies/ }));
    await user.click(screen.getByLabelText('Bail (optionnel)'));
    expect(await screen.findByRole('option', { name: /BAIL-2026-041/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    let liberer!: () => void;
    retenueBauxDuBien = new Promise<void>((resolve) => {
      liberer = resolve;
    });

    // Bien B (Mbour) : sa requête est retenue.
    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'mbour');
    await user.click(await screen.findByRole('option', { name: /Espace de bureau à Mbour/ }));
    await user.click(screen.getByLabelText('Bail (optionnel)'));
    await waitFor(() =>
      expect(
        appels.some(
          ({ url }) => url.pathname === CHEMIN_BAUX && url.searchParams.get('filter[property_id]') === '145',
        ),
      ).toBe(true),
    );
    // Le bail d'Almadies (bien A) ne doit être ni montré ni cliquable pendant que B charge.
    expect(screen.queryByRole('option', { name: /BAIL-2026-041/ })).not.toBeInTheDocument();
    expect(screen.getByText(/^Recherche…/)).toBeInTheDocument();

    liberer();
    await user.click(await screen.findByRole('option', { name: /LS-FC-DSZY4E/ }));
    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(mutateAsyncMock.mock.calls[0][0]).toMatchObject({ property_id: 145, lease_id: 363 });
  });

  /**
   * Reprise des défauts mineurs (2026-09-24) : « retirer le bien garde le bail » était écrit dans
   * `NewGroupDialog` et dans le ticket, et rien ne le tenait — la condition mutée en
   * `bail.propertyId !== suivant?.id` (sans `suivant !== null`) effaçait le bail à la croix, 22/22
   * verts. Un bail seul est un rattachement valide ; le retirer en silence ferait partir un groupe
   * sans le contexte que l'utilisateur voyait choisi un instant plus tôt.
   */
  it('TCK-576 — retirer le bien garde le bail, et le groupe part avec le bail seul', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    rendre();
    await jusquALEtape2(user);

    await chercher(user, 'Bail (optionnel)', CHEMIN_BAUX, 'mbour');
    await user.click(await screen.findByRole('option', { name: /LS-FC-DSZY4E/ }));
    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'bureau');
    await user.click(await screen.findByRole('option', { name: /Espace de bureau à Mbour/ }));
    expect(screen.getByLabelText('Bail (optionnel)')).toHaveValue('LS-FC-DSZY4E');

    await user.click(screen.getByRole('button', { name: 'Retirer le bien' }));
    expect(screen.getByLabelText('Bien (optionnel)')).toHaveValue('');
    expect(screen.getByLabelText('Bail (optionnel)')).toHaveValue('LS-FC-DSZY4E');

    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(mutateAsyncMock.mock.calls[0][0]).toMatchObject({ lease_id: 363 });
    expect(mutateAsyncMock.mock.calls[0][0]).not.toHaveProperty('property_id');
  });

  /**
   * Relevé mineur : choisir le bail PUIS son propre bien effaçait le bail, parce que le bien
   * passait de « aucun » à « un » — la condition comparait les biens, pas le bien DU BAIL.
   */
  it('TCK-576 — un bail choisi avant son bien le reste quand on choisit CE bien, et part avec lui', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ data: { id: 99 } });
    rendre();
    await jusquALEtape2(user);

    await chercher(user, 'Bail (optionnel)', CHEMIN_BAUX, 'mbour');
    await user.click(await screen.findByRole('option', { name: /LS-FC-DSZY4E/ }));

    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'bureau');
    await user.click(await screen.findByRole('option', { name: /Espace de bureau à Mbour/ }));
    expect(screen.getByLabelText('Bail (optionnel)')).toHaveValue('LS-FC-DSZY4E');

    await user.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(mutateAsyncMock.mock.calls[0][0]).toMatchObject({ property_id: 145, lease_id: 363 });
  });

  it('TCK-576 — un bail choisi avant un AUTRE bien est retiré', async () => {
    const user = userEvent.setup();
    rendre();
    await jusquALEtape2(user);

    await chercher(user, 'Bail (optionnel)', CHEMIN_BAUX, 'mbour');
    await user.click(await screen.findByRole('option', { name: /LS-FC-DSZY4E/ }));

    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'almadies');
    await user.click(await screen.findByRole('option', { name: /Villa Almadies/ }));
    expect(screen.getByLabelText('Bail (optionnel)')).toHaveValue('');
  });

  /**
   * Relevé mineur : sans recherche et sans résultat, les sélecteurs disaient « Aucun bien ne
   * correspond à cette recherche » — à quelqu'un qui n'a rien cherché. Même distinction que celle
   * des participants (`noContactYet`).
   */
  it('TCK-576 — sans bien du tout, la liste le dit, et pas « aucun résultat »', async () => {
    const user = userEvent.setup();
    aucunBien = true;
    rendre();
    await jusquALEtape2(user);

    await user.click(screen.getByLabelText('Bien (optionnel)'));
    expect(await screen.findByText('Vous n’avez encore aucun bien à rattacher.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun bien ne correspond à cette recherche.')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Bien (optionnel)'), 'villa');
    expect(await screen.findByText('Aucun bien ne correspond à cette recherche.')).toBeInTheDocument();
  });

  it('TCK-576 — un bien sans bail le dit, et pas « aucun résultat »', async () => {
    const user = userEvent.setup();
    rendre();
    await jusquALEtape2(user);

    await chercher(user, 'Bien (optionnel)', CHEMIN_BIENS, 'Appartement 000');
    await user.click(await screen.findByRole('option', { name: /Appartement 000/ }));

    await user.click(screen.getByLabelText('Bail (optionnel)'));
    expect(await screen.findByText('Ce bien n’a aucun bail.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun bail ne correspond à cette recherche.')).not.toBeInTheDocument();
  });

  /**
   * Relevé mineur : à l'étape 2, le Sujet faisait 40 px au mobile et 32 px au bureau quand les
   * deux sélecteurs en font 44. La primitive `Input` connaît le régime 44 px sous une portée
   * `data-field-density="comfortable"` (TCK-468) : c'est le formulaire qui l'ouvre.
   */
  it('TCK-576 — à l’étape 2, le Sujet est sous la portée de densité confortable (44 px)', async () => {
    const user = userEvent.setup();
    rendre();
    await jusquALEtape2(user);

    const sujet = screen.getByLabelText('Sujet');
    expect(sujet.closest('[data-field-density="comfortable"]')).not.toBeNull();
    expect(sujet).toHaveClass('in-data-[field-density=comfortable]:h-11');
  });
});
