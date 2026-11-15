import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/fr/share/jeton-abc',
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import SharePage from '@/app/[locale]/(public)/share/[token]/page';
import { ShareReception } from '../ShareReception';

/**
 * TCK-587 §8 (AC15) — la page de réception d'un lien de partage.
 *
 * Ce qu'elle garde : sur un 401, le champ mot de passe apparaît, et la requête suivante est un
 * `POST` dont l'URL ne porte PAS le mot de passe — il voyage dans le corps. L'API refuse en 400
 * toute URL qui le porte ; ce test garde l'appelant, l'API se garde elle-même
 * (`DocumentShareLinkPasswordTransportTest`).
 */
const T = fr.shareReception;
const SECRET = 'secret1234';

const DOCUMENT = {
  data: {
    token: 'jeton-abc',
    document: { id: 4, name: 'Bail signé.pdf', type: 'other', size: 2 * 1024 * 1024 },
    expires_at: null,
    downloads_count: 0,
    max_downloads: 3,
  },
};

function reponse(status: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let appels: { url: string; method: string; body: string | null }[] = [];

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
      });
      const suivante = file.shift();
      if (!suivante) throw new Error(`requête inattendue : ${String(url)}`);
      return suivante;
    }),
  );
}

describe('<ShareReception> (TCK-587, AC15)', () => {
  beforeEach(() => {
    appels = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sur un 401, demande le mot de passe et l’envoie dans le CORPS d’un POST, jamais dans l’URL', async () => {
    bouchonner(reponse(401, { message: 'Invalid password.' }), reponse(200, DOCUMENT));
    const user = userEvent.setup();
    render(withIntl(<ShareReception token="jeton-abc" />));

    const champ = await screen.findByLabelText(T.passwordLabel);
    expect(appels[0]).toMatchObject({ method: 'GET' });
    expect(appels[0].url).toMatch(/\/api\/share\/jeton-abc$/);

    await user.type(champ, SECRET);
    await user.click(screen.getByRole('button', { name: T.submit }));

    expect(await screen.findByText('Bail signé.pdf')).toBeInTheDocument();
    expect(appels).toHaveLength(2);
    expect(appels[1].method).toBe('POST');
    expect(appels[1].url).toMatch(/\/api\/share\/jeton-abc$/);
    expect(appels[1].url).not.toContain(SECRET);
    expect(appels[1].url).not.toContain('password');
    expect(JSON.parse(appels[1].body ?? '{}')).toEqual({ password: SECRET });
  });

  it('télécharge par un POST qui porte le mot de passe dans le corps', async () => {
    bouchonner(
      reponse(401, {}),
      reponse(200, DOCUMENT),
      new Response(new Blob(['contenu']), { status: 200 }),
    );
    const creer = vi.fn(() => 'blob:local');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: creer, revokeObjectURL: vi.fn() }));
    const user = userEvent.setup();
    render(withIntl(<ShareReception token="jeton-abc" />));

    await user.type(await screen.findByLabelText(T.passwordLabel), SECRET);
    await user.click(screen.getByRole('button', { name: T.submit }));
    await user.click(await screen.findByRole('button', { name: T.download }));

    await waitFor(() => expect(appels).toHaveLength(3));
    expect(appels[2].method).toBe('POST');
    expect(appels[2].url).toMatch(/\/api\/share\/jeton-abc\/download$/);
    expect(appels[2].url).not.toContain(SECRET);
    expect(JSON.parse(appels[2].body ?? '{}')).toEqual({ password: SECRET });
    expect(creer).toHaveBeenCalledTimes(1);
  });

  it('nomme le mot de passe faux, sans quitter le formulaire', async () => {
    bouchonner(reponse(401, {}), reponse(401, { message: 'Invalid password.' }));
    const user = userEvent.setup();
    render(withIntl(<ShareReception token="jeton-abc" />));

    await user.type(await screen.findByLabelText(T.passwordLabel), 'faux');
    await user.click(screen.getByRole('button', { name: T.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.wrongPassword);
    expect(screen.getByLabelText(T.passwordLabel)).toBeInTheDocument();
  });

  it('nomme le lien expiré, révoqué ou épuisé (410)', async () => {
    bouchonner(reponse(410, { message: 'This share link has expired.' }));
    render(withIntl(<ShareReception token="jeton-abc" />));

    expect(await screen.findByTestId('share-gone')).toHaveTextContent(T.goneTitle);
    expect(screen.queryByLabelText(T.passwordLabel)).not.toBeInTheDocument();
  });

  it('nomme le lien introuvable (404)', async () => {
    bouchonner(reponse(404, {}));
    render(withIntl(<ShareReception token="inconnu" />));

    expect(await screen.findByTestId('share-not-found')).toHaveTextContent(T.notFoundTitle);
  });

  it('un lien sans mot de passe s’ouvre d’un GET et affiche nom et taille', async () => {
    bouchonner(reponse(200, DOCUMENT));
    render(withIntl(<ShareReception token="jeton-abc" />));

    expect(await screen.findByText('Bail signé.pdf')).toBeInTheDocument();
    expect(screen.getByText(T.size)).toBeInTheDocument();
    expect(screen.getByText(/2\s?Mo/)).toBeInTheDocument();
    expect(appels).toEqual([expect.objectContaining({ method: 'GET' })]);
  });

  /* TCK-2514 — « la carte au centre » */

  it('le document prêt : titre, format et taille sur une ligne, date limite, téléchargements restants', async () => {
    bouchonner(reponse(200, { data: { ...DOCUMENT.data, expires_at: '2026-11-15T18:00:00+00:00' } }));
    render(withIntl(<ShareReception token="jeton-abc" />));

    expect(await screen.findByRole('heading', { level: 1, name: T.title })).toBeInTheDocument();
    const fiche = screen.getByTestId('share-document');
    expect(fiche).toHaveTextContent(/PDF · Taille 2\s?Mo/);
    expect(fiche).toHaveTextContent('Disponible jusqu\'au 15 nov. 2026');
    expect(fiche).toHaveTextContent('3 téléchargements restants');
    expect(fiche).toHaveTextContent(fr.lienPublic.document.compte);
    expect(screen.getByText(fr.lienPublic.document.prive)).toBeInTheDocument();
  });

  it('sans limite de téléchargements : ni compte ni avertissement', async () => {
    bouchonner(reponse(200, { data: { ...DOCUMENT.data, max_downloads: null } }));
    render(withIntl(<ShareReception token="jeton-abc" />));

    await screen.findByText('Bail signé.pdf');
    expect(screen.queryByText(/téléchargements? restants?/)).toBeNull();
    expect(screen.queryByText(fr.lienPublic.document.compte)).toBeNull();
  });

  it('un téléchargement en panne passe par ErrorState, le bouton reste', async () => {
    bouchonner(reponse(200, DOCUMENT), reponse(500, {}));
    const user = userEvent.setup();
    render(withIntl(<ShareReception token="jeton-abc" />));

    await user.click(await screen.findByRole('button', { name: T.download }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.downloadError);
    expect(screen.getByRole('button', { name: T.download })).toBeEnabled();
  });

  it('le mot de passe faux est relié au champ (aria-describedby → ErrorState)', async () => {
    bouchonner(reponse(401, {}), reponse(401, {}));
    const user = userEvent.setup();
    render(withIntl(<ShareReception token="jeton-abc" />));

    await user.type(await screen.findByLabelText(T.passwordLabel), 'faux');
    await user.click(screen.getByRole('button', { name: T.submit }));

    const alerte = await screen.findByRole('alert');
    const champ = screen.getByLabelText(T.passwordLabel);
    expect(champ).toHaveAttribute('aria-invalid', 'true');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.closest('[id]')?.id);
  });

  it.each([
    [410, 'share-gone', T.goneTitle],
    [404, 'share-not-found', T.notFoundTitle],
  ])('un lien mort (%i) a ses deux issues', async (statut, testid, titre) => {
    bouchonner(reponse(statut, {}));
    render(withIntl(<ShareReception token="jeton-abc" />));

    const mort = await screen.findByTestId(testid);
    expect(within(mort).getByRole('heading', { level: 1 })).toHaveTextContent(titre);
    expect(within(mort).getByRole('link', { name: fr.lienPublic.mort.rechercher })).toHaveAttribute('href', '/fr/properties');
    expect(within(mort).getByRole('link', { name: fr.lienPublic.mort.aide })).toHaveAttribute('href', 'mailto:contact@takussan.com');
  });

  it('AC4 — la page vit dans la coque de lien : ni recherche, ni favoris, ni comparateur, ni navigation', async () => {
    bouchonner(reponse(200, DOCUMENT));
    const page = await SharePage({ params: Promise.resolve({ token: 'jeton-abc' }) });
    const { container } = render(withIntl(page));

    await screen.findByText('Bail signé.pdf');
    expect(container.querySelector('[data-coque-lien]')).not.toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    const hrefs = screen.queryAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.filter((h) => /favorites|compare|properties/.test(h))).toEqual([]);
  });
});
