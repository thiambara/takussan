import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const auth = {
  token: null as string | null,
  openSession: vi.fn(),
  logout: vi.fn(),
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

import { RadarClaimReception } from '../RadarClaimReception';

/**
 * TCK-2390 (ADR-0077 §3) — la page publique de réclamation : l'annonceur lit ses annonces, décoche
 * ou corrige, accepte les conditions, reçoit le code à SON numéro (la requête n'en porte aucun) et
 * confirme. Le lien mort (STOP, révocation, expiration) le dit sans rien proposer.
 */
const T = fr.radarClaim;
const JETON = '12.1798000000.AbCdEfGhIjKlMnOpQrStUv';

function annonce(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Appartement 3 pièces à Mermoz',
    description: 'Appelez le [TELEPHONE] pour visiter.',
    price: 350000,
    contract: 'rent',
    rent_period: 'monthly',
    property_type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    surface_m2: 90,
    furnished: false,
    neighborhood: 'Mermoz',
    photo_url: null,
    ...over,
  };
}

function reclamation(
  over: {
    account?: Record<string, unknown>;
    listings?: unknown[];
    publishing?: unknown[];
    awaiting_review?: unknown[];
    published?: unknown[];
    mandate?: { properties_count: number } | null;
    demand?: { quarter: string; searches_30d: number } | null;
  } = {},
) {
  return {
    data: {
      advertiser: { first_name: 'Awa', phone_masked: '+221 •• ••• •• 67' },
      account: {
        state: 'new',
        space_name: 'Espace de Awa',
        viewer_is_owner: false,
        viewer_is_other: false,
        space: null,
        space_unavailable: false,
        ...over.account,
      },
      listings: over.listings ?? [annonce(), annonce({ id: 2, title: 'Studio aux Almadies', description: null, price: 150000 })],
      publishing: over.publishing ?? [],
      awaiting_review: over.awaiting_review ?? [],
      published: over.published ?? [],
      terms_version: '2026-10-29',
      mandate: over.mandate ?? null,
      demand: over.demand ?? null,
    },
  };
}

function reponse(status: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

let appels: { url: string; method: string; body: string | null; headers: Record<string, string> }[] = [];

function bouchonner(...reponses: Response[]) {
  const file = [...reponses];
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : null,
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      const suivante = file.shift();
      if (!suivante) throw new Error(`requête inattendue : ${String(url)}`);
      return suivante;
    }),
  );
}

const texte = (el: Element | null) => (el?.textContent ?? '').replace(/[\s  ]+/g, ' ').trim();

describe('<RadarClaimReception> (TCK-2390)', () => {
  beforeEach(() => {
    auth.token = null;
    auth.openSession.mockReset().mockResolvedValue(undefined);
    auth.logout.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('compte neuf : décoche, corrige, reçoit le code sans envoyer de numéro, confirme et ouvre la session', async () => {
    const session = { token: 'jeton-session', user: { id: 7 }, expires_at: '2026-11-28T12:00:00Z' };
    bouchonner(
      reponse(200, reclamation()),
      reponse(202, { data: { retry_after: 60, phone_masked: '+221 •• ••• •• 67' }, otp_preview: '123456' }),
      reponse(200, {
        claim: { state: 'new', agency: { id: 3, name: 'Chez Awa' }, listing_ids: [1], declined_ids: [2], moved_property_ids: [], taken_back_property_ids: [] },
        ...session,
        is_new_account: true,
      }),
    );
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    expect(await screen.findByText(T.intro.replace('{phone}', '+221 •• ••• •• 67'))).toBeInTheDocument();
    expect(appels[0].url).toMatch(new RegExp(`/api/radar/claims/${JETON.replace(/\./g, '\\.')}$`));
    expect(appels[0].headers.Authorization).toBeUndefined();

    const cartes = screen.getAllByTestId('claim-listing');
    await user.click(within(cartes[1]).getByRole('checkbox', { name: new RegExp(T.keep) }));
    await user.click(within(cartes[0]).getByRole('button', { name: T.edit }));
    const titre = within(cartes[0]).getByLabelText(T.fieldTitle);
    await user.clear(titre);
    await user.type(titre, 'Bel appartement à Mermoz');

    await user.clear(screen.getByLabelText(T.fieldSpaceName));
    await user.type(screen.getByLabelText(T.fieldSpaceName), 'Chez Awa');

    const envoyer = screen.getByRole('button', { name: T.sendCode });
    expect(envoyer).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(envoyer);

    expect(appels[1].url).toMatch(/\/api\/radar\/claims\/.+\/otp$/);
    expect(JSON.parse(appels[1].body ?? 'null')).toEqual({});
    expect(await screen.findByText(T.codeSentTo.replace('{phone}', '+221 •• ••• •• 67'))).toBeInTheDocument();

    await user.type(screen.getByLabelText(T.codeLabel), '123456');
    await user.click(screen.getByRole('button', { name: 'Publier mon annonce' }));

    expect(appels[2].url).toMatch(/\/api\/radar\/claims\/.+\/confirm$/);
    expect(JSON.parse(appels[2].body ?? 'null')).toEqual({
      code: '123456',
      terms_version: '2026-10-29',
      accept_terms: true,
      // Seule la correction part : la description laissée telle quelle garde son numéro côté serveur.
      listings: [{ id: 1, title: 'Bel appartement à Mermoz' }],
      first_name: 'Awa',
      space_name: 'Chez Awa',
    });
    expect(await screen.findByTestId('claim-done')).toHaveTextContent('Chez Awa');
    expect(auth.openSession).toHaveBeenCalledWith('jeton-session', { id: 7 }, '2026-11-28T12:00:00Z');
  });

  it('une correction qui garde [TELEPHONE] est arrêtée avant tout appel', async () => {
    bouchonner(reponse(200, reclamation({ listings: [annonce()] })), reponse(202, { data: { retry_after: 60 } }));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: T.edit }));
    await user.type(screen.getByLabelText(T.fieldDescription), ' Libre de suite.');
    await user.click(screen.getByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(screen.getByRole('button', { name: T.sendCode }));
    await user.type(await screen.findByLabelText(T.codeLabel), '123456');
    await user.click(screen.getByRole('button', { name: 'Publier mon annonce' }));

    expect(await screen.findByText(T.errors.phoneToken)).toBeInTheDocument();
    expect(appels).toHaveLength(2);
  });

  it('un nom refusé par l’API pour un numéro se dit sous son champ, traduit, pas dans le bandeau', async () => {
    bouchonner(
      reponse(200, reclamation({ listings: [annonce()] })),
      reponse(202, { data: { retry_after: 60 } }),
      reponse(422, { code: 'radar.claim.name_contains_phone', message: 'brut', fields: ['space_name'] }),
    );
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(screen.getByRole('button', { name: T.sendCode }));
    await user.type(await screen.findByLabelText(T.codeLabel), '123456');
    await user.click(screen.getByRole('button', { name: 'Publier mon annonce' }));

    const alerte = await screen.findByText(T.errors.spaceNameContainsPhone);
    const champ = screen.getByLabelText(T.fieldSpaceName);
    expect(champ).toHaveAttribute('aria-invalid', 'true');
    expect(champ.getAttribute('aria-describedby')).toContain(alerte.id);
    expect(screen.getByLabelText(T.fieldFirstName)).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('brut')).not.toBeInTheDocument();
    expect(screen.queryByText(T.errors.nameContainsPhone)).not.toBeInTheDocument();
  });

  it('un numéro dans le prénom ou le nom de l’espace est signalé avant tout SMS', async () => {
    bouchonner(reponse(200, reclamation({ listings: [annonce()] })));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    const espace = await screen.findByLabelText(T.fieldSpaceName);
    await user.clear(espace);
    await user.type(espace, 'Location 77 123 45 67');
    await user.click(screen.getByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(screen.getByRole('button', { name: T.sendCode }));

    expect(await screen.findByText(T.errors.spaceNameContainsPhone)).toBeInTheDocument();
    expect(screen.queryByText(T.errors.firstNameContainsPhone)).not.toBeInTheDocument();
    expect(appels).toHaveLength(1);

    // Corrigé, le message s'efface et le code part.
    await user.clear(espace);
    await user.type(espace, 'Location Awa');
    expect(screen.queryByText(T.errors.spaceNameContainsPhone)).not.toBeInTheDocument();
  });

  it('une annonce déjà confirmée, en attente de publication, se montre sans case ni bouton', async () => {
    bouchonner(
      reponse(200, reclamation({
        account: { state: 'existing', viewer_is_owner: true, space: { name: 'Chez Awa' } },
        listings: [],
        publishing: [annonce({ id: 5, title: 'Villa à Ngor' })],
      })),
    );
    auth.token = 'jeton-session';
    render(withIntl(<RadarClaimReception token={JETON} />));

    const section = await screen.findByTestId('claim-publishing');
    expect(within(section).getByRole('heading', { name: T.publishingTitle })).toBeInTheDocument();
    expect(section).toHaveTextContent('Villa à Ngor');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: T.sendCode })).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-listing')).not.toBeInTheDocument();
  });

  // TCK-2413 — la publication l'a laissée à l'équipe : ni « en cours de publication », ni « quelques minutes », ni la raison.
  it('une annonce laissée à l\'équipe attend sa vérification, sans se dire en cours de publication', async () => {
    bouchonner(
      reponse(200, reclamation({
        account: { state: 'existing', viewer_is_owner: true, space: { name: 'Chez Awa' } },
        listings: [],
        awaiting_review: [annonce({ id: 6, title: 'Maison à Yoff' })],
      })),
    );
    auth.token = 'jeton-session';
    render(withIntl(<RadarClaimReception token={JETON} />));

    const section = await screen.findByTestId('claim-awaiting-review');
    expect(within(section).getByRole('heading', { name: T.awaitingReviewTitle })).toBeInTheDocument();
    expect(section).toHaveTextContent('Maison à Yoff');
    expect(section).toHaveTextContent(T.awaitingReviewHint);
    expect(screen.queryByTestId('claim-publishing')).not.toBeInTheDocument();
    expect(screen.queryByText(T.publishingHint)).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-empty')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('un code refusé se dit par la page, et la saisie reste ouverte', async () => {
    bouchonner(
      reponse(200, reclamation({ listings: [annonce()] })),
      reponse(202, { data: { retry_after: 60 } }),
      reponse(422, { code: 'phone_code_invalid', message: 'Code invalide.' }),
    );
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(screen.getByRole('button', { name: T.sendCode }));
    await user.type(await screen.findByLabelText(T.codeLabel), '000000');
    await user.click(screen.getByRole('button', { name: 'Publier mon annonce' }));

    expect(await screen.findByText(T.errors.codeInvalid)).toBeInTheDocument();
    expect(screen.getByLabelText(T.codeLabel)).toBeInTheDocument();
    expect(auth.openSession).not.toHaveBeenCalled();
  });

  it('numéro déjà inscrit, visiteur anonyme : la connexion d’abord, retour sur la page, aucun formulaire', async () => {
    bouchonner(reponse(200, reclamation({ account: { state: 'existing' } })));
    render(withIntl(<RadarClaimReception token={JETON} />));

    const bloc = await screen.findByTestId('claim-existingLogin');
    const lien = within(bloc).getByRole('link', { name: T.login });
    expect(lien.getAttribute('href')).toBe(`/auth/login?redirect=${encodeURIComponent(`/fr/claim/${JETON}`)}`);
    expect(screen.queryByRole('button', { name: T.sendCode })).toBeNull();
  });

  it('titulaire connecté : la session part avec l’appel, l’espace existant est nommé, sans champ de compte', async () => {
    auth.token = 'jeton-titulaire';
    bouchonner(
      reponse(200, reclamation({ account: { state: 'existing', viewer_is_owner: true, space: { name: 'Agence Awa' } } })),
    );
    render(withIntl(<RadarClaimReception token={JETON} />));

    expect(await screen.findByTestId('claim-existing-space')).toHaveTextContent('Agence Awa');
    expect(appels[0].headers.Authorization).toBe('Bearer jeton-titulaire');
    expect(screen.queryByLabelText(T.fieldSpaceName)).toBeNull();
    expect(screen.getByRole('button', { name: T.sendCode })).toBeInTheDocument();
  });

  it('un autre compte connecté : la page propose de se déconnecter, pas de publier ailleurs', async () => {
    auth.token = 'jeton-autre';
    bouchonner(reponse(200, reclamation({ account: { viewer_is_other: true } })));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    const bloc = await screen.findByTestId('claim-otherAccount');
    expect(screen.queryByRole('button', { name: T.sendCode })).toBeNull();
    await user.click(within(bloc).getByRole('button', { name: T.logout }));
    expect(auth.logout).toHaveBeenCalled();
  });

  it('deux comptes pour ce numéro : la page renvoie au support, sans formulaire ni code', async () => {
    auth.token = 'jeton-titulaire';
    bouchonner(reponse(200, reclamation({ account: { state: 'support', viewer_is_other: true } })));
    render(withIntl(<RadarClaimReception token={JETON} />));

    const bloc = await screen.findByTestId('claim-support');
    expect(bloc).toHaveTextContent('contact@takussan.com');
    expect(screen.queryByRole('button', { name: T.sendCode })).toBeNull();
    expect(screen.queryByRole('button', { name: T.logout })).toBeNull();
  });

  /** TCK-2421 (ADR-0079) — sous mandat, la page le dit et le code reprend ses biens dans son espace, sans annonce à cocher. */
  it('sous mandat : la page le dit, et le code reprend ses biens dans son espace sans annonce à cocher', async () => {
    const enLigne = [
      { title: 'Villa à Ngor', public_url: 'https://takussan.test/fr/properties/villa-a-ngor' },
      { title: 'Studio aux Almadies', public_url: 'https://takussan.test/fr/properties/studio-aux-almadies' },
    ];
    bouchonner(
      reponse(200, reclamation({ listings: [], published: enLigne, mandate: { properties_count: 2 } })),
      reponse(202, { data: { retry_after: 60, phone_masked: '+221 •• ••• •• 67' } }),
      reponse(200, {
        claim: { state: 'new', agency: { id: 3, name: 'Espace de Awa' }, listing_ids: [], declined_ids: [], moved_property_ids: [], taken_back_property_ids: [41, 42] },
      }),
    );
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    expect(await screen.findByText(T.introMandate.replace('{phone}', '+221 •• ••• •• 67'))).toBeInTheDocument();
    const bloc = screen.getByTestId('claim-mandate');
    expect(within(bloc).getByRole('heading', { name: T.mandateTitle })).toBeInTheDocument();
    expect(texte(bloc)).toContain('Takussan diffuse 2 annonces pour votre compte.');
    expect(texte(bloc)).toContain('vous les reprenez dans votre propre espace');
    // Rien à cocher, et pas de « aucune annonce » : il y a des biens à reprendre.
    expect(screen.queryByTestId('claim-listing')).toBeNull();
    expect(screen.queryByTestId('claim-empty')).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(screen.getByRole('button', { name: T.sendCode }));
    await user.type(await screen.findByLabelText(T.codeLabel), '123456');
    await user.click(screen.getByRole('button', { name: 'Reprendre mes annonces' }));

    expect(JSON.parse(appels[2].body ?? 'null')).toMatchObject({ code: '123456', listings: [] });
    const fait = await screen.findByTestId('claim-done');
    expect(within(fait).getByTestId('claim-done-take-back')).toHaveTextContent(
      'Vos 2 annonces sont maintenant dans votre espace « Espace de Awa », toujours en ligne.',
    );
    // Aucune annonce publiée par cette confirmation : la phrase « votre compte est prêt » ne s'ajoute pas.
    expect(fait).not.toHaveTextContent('Votre compte est prêt');
  });

  it('sous mandat avec une annonce encore à publier : le bouton dit les deux gestes', async () => {
    bouchonner(
      reponse(200, reclamation({ listings: [annonce()], mandate: { properties_count: 1 } })),
      reponse(202, { data: { retry_after: 60 } }),
    );
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(screen.getByRole('button', { name: T.sendCode }));
    expect(await screen.findByRole('button', { name: 'Reprendre mes annonces et publier la nouvelle' })).toBeInTheDocument();
  });

  it('sous mandat, un bien qui ne se reprend pas ici : la page renvoie au support, sans formulaire ni code', async () => {
    bouchonner(reponse(200, reclamation({ account: { state: 'mandate_support' }, listings: [], mandate: { properties_count: 1 } })));
    render(withIntl(<RadarClaimReception token={JETON} />));

    const bloc = await screen.findByTestId('claim-mandateSupport');
    expect(bloc).toHaveTextContent(T.mandateSupportTitle);
    expect(bloc).toHaveTextContent('contact@takussan.com');
    expect(screen.queryByRole('button', { name: T.sendCode })).toBeNull();
  });

  it('sous mandat, son espace suspendu : le refus du code se dit, ses annonces restent diffusées', async () => {
    auth.token = 'jeton-titulaire';
    bouchonner(
      reponse(200, reclamation({ account: { state: 'existing', viewer_is_owner: true, space: { name: 'Fatou Location' } }, listings: [], mandate: { properties_count: 2 } })),
      reponse(409, { code: 'radar.claim.space_suspended', message: 'brut' }),
    );
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(screen.getByRole('button', { name: T.sendCode }));
    expect(await screen.findByText(T.errors.spaceSuspended)).toBeInTheDocument();
    expect(screen.queryByLabelText(T.codeLabel)).toBeNull();
  });

  // TCK-2446 — hors mandat, l'espace du compte vérifié n'est pas actif : la publication n'y entrerait pas.
  it.each([
    ['connecté', { state: 'existing', viewer_is_owner: true, space: { name: 'Fatou Location' } }],
    ['non connecté', { state: 'existing', viewer_is_owner: false }],
  ])('hors mandat, son espace non actif (%s) : la page le dit d’avance, sans parler de mandat, ni formulaire ni code', async (_cas, compte) => {
    bouchonner(reponse(200, reclamation({ account: { ...compte, space_unavailable: true } })));
    render(withIntl(<RadarClaimReception token={JETON} />));

    const bloc = await screen.findByTestId('claim-spaceUnavailable');
    expect(bloc).toHaveTextContent(T.spaceUnavailableTitle);
    expect(bloc).toHaveTextContent('contact@takussan.com');
    expect(texte(bloc)).not.toMatch(/mandat|diffusées par Takussan/i);
    expect(screen.queryByTestId('claim-existingLogin')).toBeNull();
    expect(screen.queryByRole('button', { name: T.sendCode })).toBeNull();
  });

  it('hors mandat, son espace devenu non actif après la lecture : le refus du code se dit, sans parler de mandat', async () => {
    auth.token = 'jeton-titulaire';
    bouchonner(
      reponse(200, reclamation({ account: { state: 'existing', viewer_is_owner: true, space: { name: 'Fatou Location' } } })),
      reponse(409, { code: 'radar.claim.space_unavailable', message: 'brut' }),
    );
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('checkbox', { name: /conditions d'utilisation/ }));
    await user.click(screen.getByRole('button', { name: T.sendCode }));
    expect(await screen.findByText(T.errors.spaceUnavailable)).toBeInTheDocument();
    expect(T.errors.spaceUnavailable).not.toMatch(/mandat/i);
    expect(screen.queryByLabelText(T.codeLabel)).toBeNull();
  });

  it('compte préparé par le Radar sans annonce restante : le code active le compte seul', async () => {
    bouchonner(reponse(200, reclamation({ account: { state: 'activation' }, listings: [] })));
    render(withIntl(<RadarClaimReception token={JETON} />));

    expect(await screen.findByRole('button', { name: T.sendCode })).toBeInTheDocument();
    expect(screen.queryByTestId('claim-empty')).toBeNull();
  });

  it.each([
    [410, 'radar.claim.revoked', 'claim-revoked', T.revokedTitle],
    [410, 'radar.claim.expired', 'claim-expired', T.expiredTitle],
    [404, 'radar.claim.invalid', 'claim-not-found', T.notFoundTitle],
    [503, 'radar.claim.unavailable', 'claim-unavailable', T.unavailableTitle],
  ])('%i %s : la page le dit, sans formulaire', async (status, code, testId, titre) => {
    bouchonner(reponse(status, { code, message: 'x' }));
    render(withIntl(<RadarClaimReception token={JETON} />));

    expect(await screen.findByTestId(testId)).toHaveTextContent(titre);
    expect(screen.queryByRole('button', { name: T.sendCode })).toBeNull();
  });

  it('un jeton qui réécrirait le chemin est refusé sans appel', async () => {
    bouchonner();
    render(withIntl(<RadarClaimReception token="../me?x=1" />));

    expect(await screen.findByTestId('claim-not-found')).toBeInTheDocument();
    expect(appels).toHaveLength(0);
  });

  it('n’affiche aucun champ du Radar que l’API ne rend pas, et le prix suit la période', async () => {
    bouchonner(reponse(200, reclamation({ listings: [annonce()] })));
    render(withIntl(<RadarClaimReception token={JETON} />));

    const carte = await screen.findByTestId('claim-listing');
    expect(texte(carte)).toMatch(/350 000.*\/ Mois/);
    expect(texte(carte)).toContain('Appartement · Location · 2 chambres · 1 salle de bain · 90 m²');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-2512 — « La promesse, puis la liste »
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

const L = fr.lienPublic.reclamation;

/** Simule le téléphone (sous `lg`) : la barre collante et les feuilles. */
function surTelephone(oui: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: oui && query === '(width < 64rem)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('<RadarClaimReception> — TCK-2512', () => {
  const matchMediaDOrigine = window.matchMedia;
  beforeEach(() => {
    auth.token = null;
    auth.openSession.mockReset().mockResolvedValue(undefined);
    auth.logout.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.matchMedia = matchMediaDOrigine;
  });

  it('AC2 — demand: null : aucun chiffre ni phrase de demande', async () => {
    bouchonner(reponse(200, reclamation({ demand: null })));
    render(withIntl(<RadarClaimReception token={JETON} />));

    await screen.findByTestId('claim-ready');
    expect(screen.queryByTestId('claim-demand')).toBeNull();
    expect(texte(document.body)).not.toMatch(/recherches?|ces 30 derniers jours/i);
  });

  it('la demande du quartier se dit en RECHERCHES, jamais en personnes', async () => {
    bouchonner(reponse(200, reclamation({ demand: { quarter: 'Mermoz', searches_30d: 57 } })));
    render(withIntl(<RadarClaimReception token={JETON} />));

    const demande = await screen.findByTestId('claim-demand');
    expect(texte(demande)).toBe('57 recherches à Mermoz ces 30 derniers jours.');
    // « personnes » serait faux : une même personne cherche plusieurs fois (TCK-2511).
    expect(texte(document.body)).not.toMatch(/personnes?\b/i);
  });

  it('la promesse d’abord : le prénom en titre, la gratuité, le numéro masqué', async () => {
    bouchonner(reponse(200, reclamation()));
    render(withIntl(<RadarClaimReception token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: 'Bonjour Awa,' })).toBeInTheDocument();
    expect(screen.getByText(L.avantageGratuit)).toBeInTheDocument();
    expect(screen.getByText(L.avantageNumero)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: L.aPublierTitre })).toBeInTheDocument();
  });

  it.each([
    ['not_me', L.opposition.pasMoi, L.refus.faitPasMoi],
    ['stop_contact', L.opposition.neplus, L.refus.faitNeplus],
  ] as const)('AC3 — « %s » confirmé appelle decline UNE fois et laisse un écran sans action', async (motif, lien, phrase) => {
    bouchonner(reponse(200, reclamation()), reponse(200, { data: { status: 'declined' } }));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: lien }));
    expect(screen.getByRole('radio', { name: new RegExp(motif === 'not_me' ? L.refus.pasMoiTitre : L.refus.neplusTitre) })).toBeChecked();
    // Rien ne part à l'ouverture de la feuille.
    expect(appels).toHaveLength(1);
    const confirmer = screen.getByRole('button', { name: L.refus.confirmer });
    await user.click(confirmer);

    const fait = await screen.findByTestId('claim-declined');
    expect(fait).toHaveTextContent(L.refus.faitTitre);
    expect(fait).toHaveTextContent(phrase);
    const refus = appels.filter((a) => a.url.endsWith('/decline'));
    expect(refus).toHaveLength(1);
    expect(refus[0]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(refus[0].body ?? 'null')).toEqual({ reason: motif });
    expect(appels).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('AC3 — un double clic sur Confirmer, refus en vol : UN seul POST decline', async () => {
    let liberer: (r: Response) => void = () => {};
    const declines: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/decline')) {
          declines.push(init?.body as string);
          return new Promise<Response>((r) => {
            liberer = r;
          });
        }
        return reponse(200, reclamation());
      }),
    );
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: L.opposition.pasMoi }));
    const confirmer = screen.getByRole('button', { name: L.refus.confirmer });
    await user.dblClick(confirmer);
    await user.click(confirmer);
    expect(declines).toHaveLength(1);

    liberer(reponse(200, { data: { status: 'declined' } }));
    expect(await screen.findByTestId('claim-declined')).toBeInTheDocument();
    expect(declines).toHaveLength(1);
  });

  it('le motif se change dans la feuille avant de confirmer', async () => {
    bouchonner(reponse(200, reclamation()), reponse(200, { data: { status: 'declined' } }));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: L.opposition.pasMoi }));
    await user.click(screen.getByRole('radio', { name: new RegExp(L.refus.neplusTitre) }));
    await user.click(screen.getByRole('button', { name: L.refus.confirmer }));
    await screen.findByTestId('claim-declined');
    expect(JSON.parse(appels[1].body ?? 'null')).toEqual({ reason: 'stop_contact' });
  });

  it('des annonces déjà en ligne : la feuille dit qu’elles seront retirées', async () => {
    bouchonner(reponse(200, reclamation({ published: [{ title: 'Villa à Ngor', public_url: 'https://takussan.test/fr/properties/v' }] })));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: L.opposition.neplus }));
    expect(screen.getByText(L.refus.effetEnLigne)).toBeInTheDocument();
  });

  it('503 : la publication est fermée, le refus reste ouvert (TCK-2511)', async () => {
    bouchonner(reponse(503, { code: 'radar.claim.unavailable', message: 'x' }), reponse(200, { data: { status: 'declined' } }));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    expect(await screen.findByTestId('claim-unavailable')).toHaveTextContent(T.unavailableTitle);
    await user.click(screen.getByRole('button', { name: L.opposition.pasMoi }));
    await user.click(screen.getByRole('button', { name: L.refus.confirmer }));
    expect(await screen.findByTestId('claim-declined')).toBeInTheDocument();
    expect(appels[1].url).toMatch(/\/api\/radar\/claims\/.+\/decline$/);
  });

  it('un refus sur un lien mort entre-temps (410) : l’état du lien mort, avec ses deux issues', async () => {
    bouchonner(reponse(200, reclamation()), reponse(410, { code: 'radar.claim.revoked', message: 'x' }));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: L.opposition.pasMoi }));
    await user.click(screen.getByRole('button', { name: L.refus.confirmer }));
    const mort = await screen.findByTestId('claim-revoked');
    expect(within(mort).getByRole('link', { name: fr.lienPublic.mort.rechercher })).toBeInTheDocument();
    expect(within(mort).getByRole('link', { name: fr.lienPublic.mort.aide })).toBeInTheDocument();
  });

  it('annonces en mouvement (409) : la feuille le dit et reste ouverte', async () => {
    bouchonner(reponse(200, reclamation()), reponse(409, { code: 'radar.advertiser.busy', message: 'x' }));
    const user = userEvent.setup();
    render(withIntl(<RadarClaimReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: L.opposition.pasMoi }));
    await user.click(screen.getByRole('button', { name: L.refus.confirmer }));
    expect(await screen.findByText(L.refus.occupe)).toBeInTheDocument();
    expect(screen.queryByTestId('claim-declined')).toBeNull();
  });

  // AC4 — les six blocages de la spec § 2.12, chacun avec son texte actuel, au téléphone comme en bureau.
  it.each([
    ['support', { state: 'support' }, 'supportTitle', 'supportBody'],
    ['mandateSupport', { state: 'mandate_support' }, 'mandateSupportTitle', 'mandateSupportBody'],
    ['unavailableAccount', { state: 'unavailable' }, 'unavailableAccountTitle', 'unavailableAccountBody'],
    ['spaceUnavailable', { state: 'existing', viewer_is_owner: true, space_unavailable: true }, 'spaceUnavailableTitle', 'spaceUnavailableBody'],
    ['otherAccount', { viewer_is_other: true }, 'otherAccountTitle', 'otherAccountBody'],
    ['existingLogin', { state: 'existing' }, 'existingLoginTitle', 'existingLoginBody'],
  ] as const)('AC4 — blocage %s : titre et texte actuels, ni barre ni formulaire, refus toujours là', async (cle, compte, titre, corps) => {
    for (const telephone of [false, true]) {
      surTelephone(telephone);
      bouchonner(reponse(200, reclamation({ account: compte })));
      const { unmount } = render(withIntl(<RadarClaimReception token={JETON} />));

      const bloc = await screen.findByTestId(`claim-${cle}`);
      expect(texte(bloc)).toContain(T[titre]);
      const attendu = T[corps].replace('{phone}', '+221 •• ••• •• 67').replace('{email}', 'contact@takussan.com');
      expect(texte(bloc)).toContain(attendu);
      expect(screen.queryByRole('button', { name: T.sendCode })).toBeNull();
      expect(screen.queryByTestId('claim-publish-bar')).toBeNull();
      expect(screen.getByRole('button', { name: L.opposition.pasMoi })).toBeInTheDocument();
      unmount();
    }
  });

  describe('au téléphone', () => {
    beforeEach(() => surTelephone(true));

    it('AC1 — la barre « Publier mes N annonces » suit les cases cochées', async () => {
      bouchonner(reponse(200, reclamation()));
      const user = userEvent.setup();
      render(withIntl(<RadarClaimReception token={JETON} />));

      const barre = await screen.findByTestId('claim-publish-bar');
      expect(within(barre).getByRole('button', { name: 'Publier mes 2 annonces' })).toBeEnabled();
      const cartes = screen.getAllByTestId('claim-listing');
      await user.click(within(cartes[1]).getByRole('checkbox', { name: new RegExp(T.keep) }));
      expect(within(barre).getByRole('button', { name: 'Publier mon annonce' })).toBeEnabled();
      await user.click(within(cartes[0]).getByRole('checkbox', { name: new RegExp(T.keep) }));
      expect(within(barre).getByRole('button', { name: L.publierAucune })).toBeDisabled();
      expect(barre).toHaveTextContent(T.errors.nothingSelected);
      // Le formulaire n'est pas dans la page : il vit dans la feuille.
      expect(screen.queryByLabelText(T.fieldSpaceName)).toBeNull();
    });

    it('deux feuilles successives : l’espace, puis le code — et la confirmation', async () => {
      bouchonner(
        reponse(200, reclamation({ listings: [annonce()] })),
        reponse(202, { data: { retry_after: 60 } }),
        reponse(200, {
          claim: { state: 'new', agency: { id: 3, name: 'Espace de Awa' }, listing_ids: [1], declined_ids: [], moved_property_ids: [], taken_back_property_ids: [] },
        }),
      );
      const user = userEvent.setup();
      render(withIntl(<RadarClaimReception token={JETON} />));

      await user.click(await screen.findByRole('button', { name: 'Publier mon annonce' }));
      const espace = await screen.findByRole('dialog', { name: T.spaceTitle });
      expect(within(espace).getByLabelText(T.fieldSpaceName)).toHaveValue('Espace de Awa');
      expect(within(espace).getByText(L.codeArriveAu.replace('{phone}', '+221 •• ••• •• 67'))).toBeInTheDocument();
      await user.click(within(espace).getByRole('checkbox', { name: /conditions d'utilisation/ }));
      await user.click(within(espace).getByRole('button', { name: T.sendCode }));

      const feuilleDuCode = await screen.findByRole('dialog', { name: T.codeLabel });
      const champ = within(feuilleDuCode).getByRole('textbox', { name: T.codeLabel });
      expect(champ).toHaveAttribute('autocomplete', 'one-time-code');
      expect(screen.getByRole('button', { name: /Renvoyer dans/ })).toBeDisabled();
      await user.type(champ, '123456');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publier mon annonce' }));

      expect(JSON.parse(appels[2].body ?? 'null')).toMatchObject({ code: '123456', listings: [{ id: 1 }], space_name: 'Espace de Awa' });
      expect(await screen.findByTestId('claim-done')).toHaveTextContent('Espace de Awa');
    });
  });
});
