/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * TCK-370, réserve de revue — **le profil actif traverse tout `admin-settings`, ou l'écran ment**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * TCK-370 a ajouté l'entrée de menu « Intégrations » et ouvert `/admin/settings/integrations` aux
 * `agency_admin`. Le module de requêtes derrière, lui, n'a pas bougé — et il ne transmettait pas
 * le profil actif :
 *
 * ```
 * $ grep -n getActiveProfileId src/app/actions/admin-settings.ts
 * (aucune occurrence)                       ← alors que admin-agency.ts le passe partout
 * ```
 *
 * **Ce que ça produit, mesuré par test API le 2026-08-27 :** un `agency_admin` MULTI-AGENCES
 * clique sur l'entrée neuve, `apiRequest` part sans `X-Active-Profile-Hint`,
 * `ResolveActiveProfile` refuse de deviner l'agence (multi-agences = choix explicite),
 * `user.agency_id` reste `null`, et `IntegrationController::index` fait
 * `abort_unless($user->agency_id !== null && …, 403)` → **403**. L'écran rend un `ErrorState` :
 * un chemin de navigation dont la destination ne contient pas ce qu'elle annonce, ce que l'AC1 du
 * ticket promettait précisément d'éviter.
 *
 * Le code fautif est PRÉEXISTANT ; il était inoffensif tant que seul un super-admin — qui
 * court-circuite le test `agency_id` — atteignait ces écrans. *Un défaut dormant se réveille quand
 * on ouvre le chemin qui y mène, pas quand on l'écrit.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER ÉPROUVE — ET POURQUOI IL MONTE LA CHAÎNE ENTIÈRE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le seul maillon doublé est `apiRequest` : les actions et le module de requêtes sont les VRAIS.
 * Un test qui se contenterait de vérifier que `fetchIntegrations` *accepte* un `activeProfileId`
 * resterait vert alors que personne ne le lui passe — c'est exactement la forme du défaut. Ce qui
 * compte est ce qui part sur le fil, donc les OPTIONS que `apiRequest` reçoit.
 *
 * ⚠️ Les dix actions sont couvertes, écritures comprises. `store`, `update`, `destroy` et `test`
 * comparent tous `$user->agency_id` à l'agence de la ressource : une écriture sans contexte
 * d'agence n'échoue pas moins qu'une lecture, elle échoue plus tard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...reel,
    // `buildQueryString` reste le VRAI — ce module n'éprouve que le transport.
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const getActiveProfileIdMock = vi.fn();
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton-de-test',
  getActiveProfileId: () => getActiveProfileIdMock(),
}));

const actions = await import('@/app/actions/admin-settings');

/** Les options passées à `apiRequest` au n-ième appel — c'est là que vit le hint. */
function optionsDuPremierAppel(): Record<string, unknown> {
  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  return apiRequestMock.mock.calls[0][1] as Record<string, unknown>;
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ data: [], meta: { total: 0 } });
  getActiveProfileIdMock.mockReset();
  // Le cookie `active_profile_id` d'un agency_admin qui a CHOISI son agence.
  getActiveProfileIdMock.mockResolvedValue('profil-agence-7');
});

/**
 * Le cas nommé par la revue, monté de bout en bout. Sans le correctif, les
 * options ne portent que `token` et cette assertion rougit.
 */
describe('TCK-370 — /admin/settings/integrations pour un agency_admin multi-agences', () => {
  it('transmet le profil actif à /api/integrations, sans quoi le serveur rend 403', async () => {
    await actions.fetchIntegrationsAction();

    const options = optionsDuPremierAppel();
    expect(options.activeProfileId).toBe('profil-agence-7');
    // L'URL reste celle de l'écran, hint ou pas : le défaut ne se voit QUE dans les options.
    expect(String(apiRequestMock.mock.calls[0][0])).toContain('/api/integrations');
  });

  /**
   * Le jeton seul ne suffit pas, et c'est tout le sujet : il dit QUI appelle, jamais DEPUIS
   * QUELLE AGENCE. Vérifier les deux ensemble empêche un correctif qui remplacerait l'un par
   * l'autre de passer pour bon.
   */
  it("porte le jeton ET l'agence — l'identité seule ne désigne pas une frontière d'isolation", async () => {
    await actions.fetchIntegrationsAction();

    expect(optionsDuPremierAppel()).toMatchObject({
      token: 'jeton-de-test',
      activeProfileId: 'profil-agence-7',
    });
  });
});

/**
 * **Les dix actions du module, pas seulement celle que la revue a nommée.**
 *
 * Corriger le seul appel cité laisserait neuf chemins ouverts sur le même défaut — dont quatre
 * écritures, où un 403 arrive APRÈS que l'utilisateur a rempli un formulaire. La table est
 * exhaustive par construction : un ajout d'action non listé ici ne sera pas gardé, et c'est ce que
 * le dernier test de ce fichier refuse.
 */
const LES_DIX: readonly (readonly [string, () => Promise<unknown>])[] = [
  ['fetchSettingsAction', () => actions.fetchSettingsAction({})],
  [
    'upsertSettingAction',
    () => actions.upsertSettingAction({ key: 'k', scope: 'agency', value: {} }),
  ],
  ['updateSettingAction', () => actions.updateSettingAction(1, {})],
  ['deleteSettingAction', () => actions.deleteSettingAction(1)],
  ['fetchIntegrationsAction', () => actions.fetchIntegrationsAction()],
  [
    'createIntegrationAction',
    () => actions.createIntegrationAction({ provider: 'wave', credentials: {} } as never),
  ],
  ['updateIntegrationAction', () => actions.updateIntegrationAction(1, {})],
  ['testIntegrationAction', () => actions.testIntegrationAction(1)],
  ['deleteIntegrationAction', () => actions.deleteIntegrationAction(1)],
];

describe('admin-settings — le contexte d’agence sur TOUTES les actions', () => {
  it.each(LES_DIX)('%s transmet le profil actif', async (_nom, appel) => {
    apiRequestMock.mockResolvedValue({ data: { id: 1 }, meta: { total: 0 } });

    await appel();

    expect(optionsDuPremierAppel().activeProfileId).toBe('profil-agence-7');
  });

  /**
   * ⚠️ **Un `undefined` ne doit PAS être confondu avec un oubli.** `getActiveProfileId()` rend
   * `undefined` quand le cookie est absent — un mono-agence qui n'a jamais choisi. `apiRequest` ne
   * pose alors simplement pas l'en-tête, et `ResolveActiveProfile` résout tout seul : c'est le cas
   * nominal d'avant TCK-370, il doit continuer de marcher.
   *
   * Ce test existe pour que le correctif ne se transforme pas en garde : *rendre obligatoire ce
   * qui n'est requis que pour un multi-agences fermerait l'écran à tous les autres.*
   */
  it('reste silencieux quand aucun profil n’est choisi, au lieu de refuser l’appel', async () => {
    getActiveProfileIdMock.mockResolvedValue(undefined);

    const resultat = await actions.fetchIntegrationsAction();

    expect(resultat).toMatchObject({ ok: true });
    expect(optionsDuPremierAppel().activeProfileId).toBeUndefined();
  });

  /**
   * La table ci-dessus est écrite à la main ; celle-ci vérifie qu'elle n'a pas pris de retard.
   * *Une liste maintenue à la main n'est juste que le jour où on l'écrit* — sans ce contrôle, une
   * onzième action arriverait non gardée et la suite resterait verte.
   */
  it('ne laisse aucune action du module hors de la table', async () => {
    const exportees = Object.keys(actions).filter((n) => n.endsWith('Action'));
    const couvertes = LES_DIX.map(([nom]) => nom);

    expect([...exportees].sort()).toEqual([...couvertes].sort());
  });
});
