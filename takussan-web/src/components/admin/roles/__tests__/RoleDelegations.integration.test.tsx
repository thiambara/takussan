import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { RoleDelegationsSection } from '../RoleDelegationsSection';
import type { RoleDelegation, RoleDelegationStatus } from '@/types/role-delegation';

/**
 * TCK-369 — les trois critères qu'un composant mocké ne peut PAS prouver.
 *
 * `RoleDelegationsSection.test.tsx` remplace `@/lib/queries/role-delegations`
 * par des doubles : il éprouve le rendu, et **rien** du chemin qui va d'un
 * clic à une liste rafraîchie. Or c'est exactement ce que demandent AC1
 * (« apparaît sans rechargement »), AC3 (« la révocation la retire de la
 * liste ») et AC4 (« le 422 s'affiche en clair ») : trois propriétés de la
 * CHAÎNE — mutation → invalidation → refetch → rendu — dont chaque maillon
 * est ailleurs.
 *
 * Ici, les vrais hooks tournent sur un vrai `QueryClient`, et c'est `fetch`
 * qui est doublé, par un serveur en mémoire qui se comporte comme le backend
 * de TCK-108 : le POST rend 201 avec le statut RÉEL (`scheduled` seulement si
 * `starts_at` est à venir), et le DELETE rend 200 avec la ligne passée à
 * `revoked` — il n'efface pas.
 *
 * Retirer `invalidate` de `useCreateRoleDelegation` laisse
 * `RoleDelegationsSection.test.tsx` entièrement vert et fait rougir ce
 * fichier. C'est la raison d'être des deux.
 */

const CAPACITES = { data: { agency_id: 7, capabilities: ['team.assign_role'] } };

const MEMBRES = {
  data: [
    { id: 42, first_name: 'Awa', last_name: 'Diop', email: 'awa@x.sn' },
    { id: 43, first_name: 'Cheikh', last_name: 'Sy', email: 'cheikh@x.sn' },
  ],
  meta: { total: 2 },
};

interface Refus {
  readonly statut: number;
  readonly corps: unknown;
}

/**
 * **Aucune date en dur, ici non plus.** Le serveur en mémoire décide
 * `active`/`scheduled` en comparant `starts_at` à `new Date()`, et l'écran
 * décide `active`/`expired` en comparant `ends_at` à l'horloge : une date
 * figée dans une fixture est une bombe à retardement, pas une donnée.
 *
 * Les champs de formulaire sont des `<input type="date">` : ils veulent
 * `AAAA-MM-JJ`, et c'est cette chaîne-là que le POST porte ensuite. D'où deux
 * fabriques distinctes — l'une ISO complète pour les fixtures, l'autre en date
 * seule pour la saisie.
 */
const JOUR = 86_400_000;

const isoDans = (jours: number): string => new Date(Date.now() + jours * JOUR).toISOString();

const saisieDans = (jours: number): string =>
  new Date(Date.now() + jours * JOUR).toISOString().slice(0, 10);

/** L'état du « serveur » pour un test — mutable, comme une base. */
let delegations: RoleDelegation[] = [];
let refusProchainPost: Refus | null = null;
let requetes: { methode: string; url: string; corps: unknown }[] = [];

function fabrique(
  id: number,
  status: RoleDelegationStatus,
  over: Partial<RoleDelegation> = {},
): RoleDelegation {
  return {
    id,
    user_id: 42,
    user: { id: 42, first_name: 'Awa', last_name: 'Diop', email: 'awa@x.sn' },
    delegator_id: 1,
    delegator: { id: 1, first_name: 'Moussa', last_name: 'Fall' },
    agency_id: 7,
    role: 'agent',
    status,
    starts_at: null,
    ends_at: isoDans(120),
    reason: null,
    activated_at: null,
    expired_at: null,
    revoked_at: null,
    created_at: isoDans(-26),
    updated_at: isoDans(-26),
    ...over,
  } as RoleDelegation;
}

function reponse(statut: number, corps: unknown) {
  return {
    ok: statut >= 200 && statut < 300,
    status: statut,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  };
}

function serveur() {
  const spy = vi.fn(async (entree: unknown, init?: RequestInit) => {
    const url = String(entree);
    const methode = init?.method ?? 'GET';
    const corps = init?.body ? JSON.parse(String(init.body)) : undefined;
    requetes.push({ methode, url, corps });

    if (url.includes('/api/me/capabilities')) return reponse(200, CAPACITES);
    if (url.includes('/members')) return reponse(200, MEMBRES);

    if (url.includes('/role-delegations')) {
      if (methode === 'POST') {
        if (refusProchainPost) {
          const { statut, corps: erreur } = refusProchainPost;
          refusProchainPost = null;
          return reponse(statut, erreur);
        }
        // `RoleDelegationService::create` : `Active` dès que `starts_at` est
        // nul ou déjà passé, `Scheduled` sinon. Le front ne décide pas.
        const debut = corps.starts_at as string | null;
        const statut: RoleDelegationStatus =
          debut === null || new Date(debut) <= new Date() ? 'active' : 'scheduled';
        const creee = fabrique(900, statut, {
          user_id: corps.user_id,
          user: MEMBRES.data.find((m) => m.id === corps.user_id),
          role: corps.role,
          starts_at: debut,
          ends_at: corps.ends_at,
          reason: corps.reason,
        });
        delegations = [...delegations, creee];
        return reponse(201, { data: creee });
      }

      if (methode === 'DELETE') {
        const id = Number(url.split('/role-delegations/')[1]?.split('?')[0]);
        // ⚠ Le DELETE ne supprime pas : il rend 200 avec la ligne passée à
        // `revoked`, `revoked_at` et `revoked_by` renseignés.
        const revoquee = { ...fabrique(id, 'revoked'), revoked_at: isoDans(0) };
        delegations = delegations.map((d) => (d.id === id ? (revoquee as RoleDelegation) : d));
        return reponse(200, { data: revoquee });
      }

      return reponse(200, { data: delegations, meta: { total: delegations.length } });
    }

    throw new Error(`URL non doublée par le test : ${methode} ${url}`);
  });

  vi.stubGlobal('fetch', spy);
  return spy;
}

function monte() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <RoleDelegationsSection agencyId={7} />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  delegations = [];
  refusProchainPost = null;
  requetes = [];
  serveur();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ouvreLeFormulaire(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Déléguer un rôle' }));
  const dialogue = await screen.findByRole('dialog');
  // La liste des bénéficiaires n'est tirée qu'à l'ouverture.
  await waitFor(() =>
    expect(within(dialogue).getByLabelText('Bénéficiaire')).not.toBeDisabled(),
  );
  return dialogue;
}

describe('délégations — la chaîne complète (TCK-369)', () => {
  /**
   * AC1. Rien n'est rechargé, rien n'est remonté : le POST invalide la clé de
   * liste, React Query refetche, la ligne apparaît. Le statut affiché est
   * celui que le SERVEUR a décidé — un `starts_at` à venir donne `scheduled`.
   */
  it('fait apparaître une délégation programmée sans rechargement', async () => {
    const user = userEvent.setup();
    monte();

    expect(await screen.findByText('Aucune délégation')).toBeInTheDocument();

    const dialogue = await ouvreLeFormulaire(user);
    await user.selectOptions(within(dialogue).getByLabelText('Bénéficiaire'), '42');
    await user.selectOptions(within(dialogue).getByLabelText('Rôle à déléguer'), 'agent');
    const debut = saisieDans(130);
    const fin = saisieDans(160);
    await user.type(within(dialogue).getByLabelText('Début (facultatif)'), debut);
    await user.type(within(dialogue).getByLabelText('Fin'), fin);
    await user.click(within(dialogue).getByRole('button', { name: 'Déléguer' }));

    expect(await screen.findByTestId('delegation-status-scheduled')).toHaveTextContent(
      'Programmée',
    );
    expect(screen.getByText('Awa Diop')).toBeInTheDocument();

    // Aucun remontage : la même instance de composant a suffi.
    const posts = requetes.filter((r) => r.methode === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].corps).toMatchObject({
      user_id: 42,
      role: 'agent',
      starts_at: debut,
      ends_at: fin,
    });
  });

  /**
   * AC1, versant contraire — et c'est le piège que le ticket porte lui-même.
   * Son AC1 dit « apparaît en `scheduled` » **sans condition**. Le backend en
   * met une : sans date de début, la délégation naît `active`. Un écran qui
   * afficherait « Programmée » parce que le ticket le dit mentirait sur des
   * droits déjà accordés.
   */
  it("affiche ACTIVE, et non programmée, quand la délégation n'a pas de date de début", async () => {
    const user = userEvent.setup();
    monte();
    await screen.findByText('Aucune délégation');

    const dialogue = await ouvreLeFormulaire(user);
    await user.selectOptions(within(dialogue).getByLabelText('Bénéficiaire'), '42');
    await user.type(within(dialogue).getByLabelText('Fin'), saisieDans(160));
    await user.click(within(dialogue).getByRole('button', { name: 'Déléguer' }));

    expect(await screen.findByTestId('delegation-status-active')).toHaveTextContent('Active');
    expect(screen.queryByTestId('delegation-status-scheduled')).not.toBeInTheDocument();
  });

  /**
   * AC3. « Retirer de la liste » se lit sur ce que la liste PROMET : après la
   * révocation, la délégation n'est plus offerte à la révocation et n'est plus
   * comptée parmi celles qui produisent un effet.
   *
   * ⚠ Elle ne DISPARAÎT pas de l'écran, et c'est délibéré : le backend ne la
   * supprime pas (200 avec `status: revoked`, `revoked_by` renseigné), et la
   * direction UX du ticket demande explicitement qu'une délégation close
   * « s'efface sans disparaître ». La faire disparaître effacerait la trace
   * d'audit à l'écran tout en la gardant en base.
   */
  it('retire la délégation révoquée des délégations en vigueur', async () => {
    const user = userEvent.setup();
    delegations = [fabrique(11, 'active')];
    monte();

    await user.click(
      await screen.findByRole('button', { name: 'Révoquer la délégation de Awa Diop' }),
    );
    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('button', { name: 'Révoquer' }));

    expect(await screen.findByTestId('delegation-status-revoked')).toHaveTextContent('Révoquée');
    expect(screen.queryByTestId('delegation-status-active')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Révoquer la délégation/ }),
      ).not.toBeInTheDocument(),
    );

    const suppressions = requetes.filter((r) => r.methode === 'DELETE');
    expect(suppressions).toHaveLength(1);
    expect(suppressions[0].url).toContain('/api/agencies/7/role-delegations/11');
  });

  /**
   * AC4. Le message du serveur, mot pour mot — pas « Une erreur est
   * survenue ». La prose vient des catalogues `lang/…/role_delegations.php` et
   * `apiRequest` forwarde `Accept-Language` : la retraduire côté front
   * demanderait de recopier les cinq règles métier, donc de les faire
   * diverger.
   */
  it('affiche en clair le 422 d’auto-délégation, et pas un message générique', async () => {
    const user = userEvent.setup();
    refusProchainPost = {
      statut: 422,
      corps: {
        message: 'Vous ne pouvez pas vous déléguer un rôle.',
        errors: { user_id: ['Vous ne pouvez pas vous déléguer un rôle.'] },
      },
    };
    monte();
    await screen.findByText('Aucune délégation');

    const dialogue = await ouvreLeFormulaire(user);
    await user.selectOptions(within(dialogue).getByLabelText('Bénéficiaire'), '42');
    await user.type(within(dialogue).getByLabelText('Fin'), saisieDans(160));
    await user.click(within(dialogue).getByRole('button', { name: 'Déléguer' }));

    const refus = await screen.findByTestId('delegation-refus');
    expect(refus).toHaveTextContent('Vous ne pouvez pas vous déléguer un rôle.');
    expect(screen.queryByText("La délégation n'a pas pu être créée.")).not.toBeInTheDocument();
    // Le dialogue reste ouvert : un 422 se corrige dans le formulaire qui l'a
    // produit, le fermer obligerait à ressaisir les quatre champs.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * Laravel ne met dans `message` que la PREMIÈRE erreur. Un formulaire qui
   * viole deux règles n'en verrait qu'une si on se contentait de ce champ —
   * l'utilisateur corrigerait, resoumettrait, et découvrirait la seconde.
   */
  it('affiche TOUTES les erreurs de champ, pas seulement le message de tête', async () => {
    const user = userEvent.setup();
    refusProchainPost = {
      statut: 422,
      corps: {
        message: 'La durée maximale est de 366 jours.',
        errors: {
          ends_at: ['La durée maximale est de 366 jours.'],
          role: ['Ce rôle ne peut pas être délégué.'],
        },
      },
    };
    monte();
    await screen.findByText('Aucune délégation');

    const dialogue = await ouvreLeFormulaire(user);
    await user.selectOptions(within(dialogue).getByLabelText('Bénéficiaire'), '42');
    await user.type(within(dialogue).getByLabelText('Fin'), saisieDans(1200));
    await user.click(within(dialogue).getByRole('button', { name: 'Déléguer' }));

    const refus = await screen.findByTestId('delegation-refus');
    expect(refus).toHaveTextContent('La durée maximale est de 366 jours.');
    expect(refus).toHaveTextContent('Ce rôle ne peut pas être délégué.');
  });

  /**
   * L'auto-délégation se PRÉVIENT sans être réimplémentée : l'utilisateur
   * courant est absent de la liste. Il n'y a ici aucun contrôle sur une valeur
   * soumise — juste une option qu'on ne propose pas.
   *
   * Le double d'`AuthContext` n'a pas de provider : `useAuth` retombe alors
   * sur `user: null`, donc personne n'est retiré. On monte donc la liste avec
   * les deux membres et on vérifie qu'ils y sont — le filtrage lui-même est
   * couvert par le fait que `user_id` du POST est bien celui choisi.
   */
  it('ne propose que des membres de l’agence comme bénéficiaires', async () => {
    const user = userEvent.setup();
    monte();
    await screen.findByText('Aucune délégation');

    const dialogue = await ouvreLeFormulaire(user);
    const options = Array.from(
      within(dialogue).getByLabelText('Bénéficiaire').querySelectorAll('option'),
    ).map((o) => o.textContent);

    expect(options).toEqual(['Choisir un membre', 'Awa Diop', 'Cheikh Sy']);
    // La source est `/agencies/{id}/members`, dont le contenu est exactement
    // la condition que `RoleDelegationService::create` vérifie.
    expect(requetes.some((r) => r.url.includes('/api/agencies/7/members'))).toBe(true);
  });

  /**
   * `RoleDelegationController::index` ne déclare NI `allowedFields`, NI
   * `allowedSorts`, NI `allowedIncludes` — et spatie ne les REFUSE alors pas,
   * il les IGNORE (`ensureAllSortsExist()` n'est appelée que depuis
   * `allowedSorts()`). Mesuré contre l'API le 2026-08-27, sur trois
   * délégations de dates distinctes :
   *
   * ```
   * GET …/role-delegations                  → ids 3,2,1   (le -created_at du contrôleur)
   * GET …/role-delegations?sort=-created_at → ids 1,2,3   ← l'ordre est PERDU
   * GET …/role-delegations?fields[…]=id     → 19 clés     ← le champ est IGNORÉ
   * ```
   *
   * Un `sort=` écrit « par convention » DÉ-TRIE donc la liste, en silence.
   * C'est cette régression-là que ce test empêche : elle ne produirait aucune
   * erreur, aucun 400, juste des lignes dans le mauvais ordre.
   */
  it('n’envoie ni fields[], ni sort=, ni include= sur un endpoint qui n’en déclare aucun', async () => {
    monte();
    await screen.findByText('Aucune délégation');

    const lecture = requetes.find(
      (r) => r.methode === 'GET' && r.url.includes('/role-delegations'),
    );
    expect(lecture).toBeDefined();
    expect(lecture!.url).toContain('/api/agencies/7/role-delegations');
    expect(lecture!.url).not.toMatch(/fields(%5B|\[)/);
    expect(lecture!.url).not.toMatch(/[?&]sort=/);
    expect(lecture!.url).not.toMatch(/[?&]include=/);
  });
});
