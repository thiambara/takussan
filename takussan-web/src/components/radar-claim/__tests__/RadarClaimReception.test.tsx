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
        ...over.account,
      },
      listings: over.listings ?? [annonce(), annonce({ id: 2, title: 'Studio aux Almadies', description: null, price: 150000 })],
      publishing: over.publishing ?? [],
      awaiting_review: over.awaiting_review ?? [],
      published: over.published ?? [],
      terms_version: '2026-10-29',
      mandate: over.mandate ?? null,
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
