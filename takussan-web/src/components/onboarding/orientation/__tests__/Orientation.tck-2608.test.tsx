import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

const refreshUser = vi.fn(async () => undefined);
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', refreshUser }),
}));

// Les deux écrans suivants ont leurs propres tests : ici, on juge la porte qui y mène.
vi.mock('../EtapeChercheur', () => ({ EtapeChercheur: () => <p>[écran du chercheur]</p> }));
vi.mock('../EtapePro', () => ({ EtapePro: () => <p>[écran du professionnel]</p> }));

// Un vrai `<a>` : le lien de Next sans routeur monté n'est pas l'objet du test.
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { CoqueDEntree } from '@/components/entree/CoqueDEntree';

import { Orientation } from '../Orientation';

const O = frMessages.onboarding.orientation;
const C = frMessages.coqueDEntree;

function monter(apres = '/app', ecranInitial?: 'portes' | 'chercheur' | 'pro', ecrireProfessionnel?: boolean) {
  // Dans la coque, SANS sortie (comme la page) : la barre que chaque écran déclare est rendue.
  return render(
    withIntl(
      <CoqueDEntree
        libelles={{ marque: 'Takussan', retourAuSite: C.retourAuSite, fermer: C.fermer, quitter: C.quitter, avancement: C.avancement, sortie: C.sortie }}
        titre={O.compteCree}
      >
      <Orientation
        ecranInitial={ecranInitial}
        ecrireProfessionnel={ecrireProfessionnel}
        prenom="Awa"
        apres={apres}
        marque="Takussan"
        quartiersSuggeres={[]}
        whatsapp={null}
        compte={{ telephone: null, telephoneVerifie: false, origineDuSite: 'https://www.takussan.com', roles: {} }}
      />
      </CoqueDEntree>,
    ),
  );
}

function corpsDuPatch(): unknown {
  const appels = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
  expect(appels).toHaveLength(1);
  const [url, init] = appels[0] as [string, RequestInit];
  expect(url).toBe('/api/me');
  expect(init.method).toBe('PATCH');
  return JSON.parse(init.body as string);
}

/**
 * TCK-2608 — trois portes, un geste : la carte touchée EST la réponse. Chaque porte écrit son
 * `entry_intent`, puis mène quelque part ; « Plus tard » s'enregistre aussi (TCK-493 : passer n'est
 * pas repousser).
 */
describe('TCK-2608 — les trois portes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/onboarding/intention');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  it('trois cartes-boutons, « Bienvenue, Awa », et aucun « Continuer »', () => {
    monter();
    expect(screen.getByRole('heading', { name: 'Bienvenue, Awa' })).toBeInTheDocument();
    for (const porte of ['chercher', 'publier', 'pro'] as const) {
      expect(screen.getByRole('button', { name: O.portes[porte].titre })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: frMessages.onboarding.intention.name.submit })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('AC1 — « J’ai un bien à louer ou vendre » : PATCH /api/me {entry_intent: "publish"}, puis /publish, sans autre clic', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: O.portes.publier.titre }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/publish'));
    expect(corpsDuPatch()).toEqual({ entry_intent: 'publish' });
    // Le compte en mémoire porte `preferences` : un retour arrière ne repose pas la question.
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it('« Je cherche un logement » : `search`, puis « Où et pour combien ? »', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: O.portes.chercher.titre }));
    expect(await screen.findByText('[écran du chercheur]')).toBeInTheDocument();
    expect(corpsDuPatch()).toEqual({ entry_intent: 'search' });
    expect(replace).not.toHaveBeenCalled();
    // L'écran courant est dans l'URL, sans navigation : un re-rendu serveur (ou un rechargement) le reprend.
    expect(new URLSearchParams(window.location.search).get('etape')).toBe('chercheur');
  });

  it('la page reprend un écran (`ecranInitial`) : l’écran du professionnel, sans repasser par les portes', () => {
    monter('/app', 'pro');
    expect(screen.getByText('[écran du professionnel]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: O.portes.pro.titre })).not.toBeInTheDocument();
    // Une reprise n'écrit rien : la réponse est déjà là.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('la porte pro du site (`ecrireProfessionnel`) : l’écran du professionnel, et `professional` écrit UNE fois à l’ouverture', async () => {
    monter('/app', 'pro', true);
    expect(screen.getByText('[écran du professionnel]')).toBeInTheDocument();
    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
    expect(corpsDuPatch()).toEqual({ entry_intent: 'professional' });
  });

  it('« Je suis un professionnel » : `professional`, puis « Votre agence sur Takussan »', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: O.portes.pro.titre }));
    expect(await screen.findByText('[écran du professionnel]')).toBeInTheDocument();
    expect(corpsDuPatch()).toEqual({ entry_intent: 'professional' });
  });

  it('« Plus tard » mène à la destination demandée, ET s’enregistre (`skipped`)', async () => {
    const user = userEvent.setup();
    monter('/properties/villa-ngor');
    // Téléphone et bureau : la même action, aux deux places de la barre (jsdom rend les deux).
    const plusTard = screen.getAllByRole('button', { name: O.plusTard });
    expect(plusTard).toHaveLength(2);
    await user.click(plusTard[0]!);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/properties/villa-ngor'));
    expect(corpsDuPatch()).toEqual({ entry_intent: 'skipped' });
  });

  it('la barre : la marque mène au site, aucun « Retour au site » ; l’intention et l’avancement au bureau', () => {
    monter();
    expect(screen.queryByRole('link', { name: C.retourAuSite })).not.toBeInTheDocument();
    for (const marque of screen.getAllByRole('link', { name: /Takussan/ })) expect(marque).toHaveAttribute('href', '/');
    expect(screen.getByText(O.compteCree)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Étape 2 sur 2' })).toBeInTheDocument();
  });

  it('un échec d’enregistrement est annoncé, et rien ne s’ouvre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: O.portes.publier.titre }));
    expect(await screen.findByRole('alert')).toHaveTextContent(O.erreur);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: O.portes.publier.titre })).toBeEnabled();
  });
});
