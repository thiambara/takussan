/**
 * TCK-2598 — la coque d'entrée commune : la barre (intention, avancement, sortie), le pied collé
 * au-dessus du clavier, le panneau d'objet, la confirmation de sortie, et ce que les segments qui la
 * montent doivent garder (`noindex`, toasts de `/publish`, aucune barre d'onglets publique).
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import { CoqueDEntree, DeclarerEntree, type LibellesDeLaCoque } from '../CoqueDEntree';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/onboarding/intention',
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

// Un vrai `<a>` : le lien de Next sans routeur monté n'est pas l'objet du test.
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const C = frMessages.coqueDEntree;

const LIBELLES: LibellesDeLaCoque = {
  marque: 'Takussan',
  retourAuSite: C.retourAuSite,
  fermer: C.fermer,
  quitter: C.quitter,
  avancement: C.avancement,
  sortie: C.sortie,
};

/** Les clics de LIEN qui atteignent le document, et s'ils étaient annulés (une navigation retenue). */
let clics: { href: string | null; annule: boolean }[] = [];
function enregistrer(evenement: MouseEvent) {
  const lien = (evenement.target as Element).closest('a');
  if (!lien) return;
  clics.push({ href: lien.getAttribute('href'), annule: evenement.defaultPrevented });
  evenement.preventDefault(); // jsdom ne navigue pas : on évite son avertissement.
}

beforeEach(() => {
  clics = [];
  window.addEventListener('click', enregistrer);
});
afterEach(() => {
  window.removeEventListener('click', enregistrer);
});

describe('la barre : intention, avancement, marque', () => {
  it('l’intention en titre et l’avancement du parcours, au téléphone comme au bureau', () => {
    render(
      <CoqueDEntree libelles={LIBELLES} titre="Votre compte est créé" pas={1} total={2}>
        <p>contenu</p>
      </CoqueDEntree>,
    );
    // Ouverte sur la marque, la barre du téléphone n'a que la marque et l'avancement (orientation
    // a-0) : l'intention n'est écrite qu'au bureau.
    expect(screen.getAllByText('Votre compte est créé')).toHaveLength(1);
    expect(screen.getByText('Votre compte est créé').closest('header')!.className).toMatch(/(^|\s)lg:flex(\s|$)/);
    expect(screen.getAllByRole('img', { name: 'Étape 1 sur 2' })).toHaveLength(2);
    // La marque mène toujours à l'accueil.
    for (const marque of screen.getAllByRole('link', { name: 'Takussan' })) expect(marque).toHaveAttribute('href', '/');
  });

  it('une page déclare son étape : la déclaration l’emporte sur le défaut du layout', () => {
    render(
      <CoqueDEntree libelles={LIBELLES} titre="Défaut" pas={1} total={3} sortie={{ href: '/', forme: 'quitter' }}>
        <DeclarerEntree titre="Déclaré" pas={2} />
      </CoqueDEntree>,
    );
    expect(screen.getAllByText('Déclaré')).toHaveLength(2);
    expect(screen.queryByText('Défaut')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Étape 2 sur 3' })).toHaveLength(2);
  });

  it('aucune barre d’onglets publique (règle des couches, ADR-0091) : ni navigation ni onglets', () => {
    const { container } = render(
      <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
        <p>contenu</p>
      </CoqueDEntree>,
    );
    expect(container.querySelector('nav')).toBeNull();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('`/publish` : « ✕ » au téléphone, « Quitter » au bureau, vers l’accueil', () => {
    render(
      <CoqueDEntree libelles={LIBELLES} titre="Publier votre bien" sortie={{ href: '/', forme: 'quitter' }}>
        <p>contenu</p>
      </CoqueDEntree>,
    );
    expect(screen.getByRole('link', { name: 'Fermer' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Quitter' })).toHaveAttribute('href', '/');
  });
});

describe('le panneau d’objet', () => {
  it('sans objet, aucun panneau et aucune image : ni villa ni slogan', () => {
    const { container } = render(
      <CoqueDEntree libelles={LIBELLES}>
        <form aria-label="Connexion" />
      </CoqueDEntree>,
    );
    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    // La colonne de 480 px des maquettes, en rem (30 × 16) : la densité du bureau ne la rabat pas.
    expect(screen.getByRole('form', { name: 'Connexion' }).parentElement!.className).toMatch(/(^|\s)max-w-\[30rem\](\s|$)/);
  });

  it('avec un objet, il vit dans un panneau à côté de la colonne', () => {
    render(
      <CoqueDEntree libelles={LIBELLES} objet={<p>Studio meublé · Mermoz</p>}>
        <form aria-label="Connexion" />
      </CoqueDEntree>,
    );
    const panneau = screen.getByText('Studio meublé · Mermoz').closest('aside');
    expect(panneau).not.toBeNull();
    expect(screen.getByRole('main')).toContainElement(panneau);
  });
});

describe('le pied collé au-dessus du clavier', () => {
  let vue: EventTarget & { height: number; offsetTop: number };
  const avant = Object.getOwnPropertyDescriptor(window, 'visualViewport');

  beforeEach(() => {
    vue = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vue });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  });
  afterEach(() => {
    if (avant) Object.defineProperty(window, 'visualViewport', avant);
    else delete (window as { visualViewport?: unknown }).visualViewport;
  });

  function pied(): HTMLElement {
    return screen.getByRole('button', { name: 'Recevoir un code' }).closest('[data-pied-d-entree]') as HTMLElement;
  }

  it('clavier fermé, en bas ; clavier ouvert (336 px), remonté d’autant ; refermé, redescendu', () => {
    render(
      <CoqueDEntree libelles={LIBELLES}>
        <DeclarerEntree pied={<button type="button">Recevoir un code</button>} />
      </CoqueDEntree>,
    );
    expect(pied().style.bottom).toBe('0px');

    act(() => {
      vue.height = 844 - 336;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(pied().style.bottom).toBe('336px');

    // Le navigateur fait défiler la vue visuelle vers le champ : le bas visible bouge avec elle.
    act(() => {
      vue.offsetTop = 120;
      vue.dispatchEvent(new Event('scroll'));
    });
    expect(pied().style.bottom).toBe('216px');

    act(() => {
      vue.height = 844;
      vue.offsetTop = 0;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(pied().style.bottom).toBe('0px');
  });

  it('collant au téléphone, dans le flux au bureau', () => {
    render(
      <CoqueDEntree libelles={LIBELLES}>
        <DeclarerEntree pied={<button type="button">Recevoir un code</button>} />
      </CoqueDEntree>,
    );
    const classes = pied().className.split(/\s+/);
    expect(classes).toContain('sticky');
    expect(classes).toContain('lg:static');
  });
});

describe('la confirmation de sortie', () => {
  it('sans saisie, « Retour au site » sort directement', () => {
    render(
      <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
        <DeclarerEntree saisie={false} />
      </CoqueDEntree>,
    );
    fireEvent.click(screen.getAllByRole('link', { name: 'Retour au site' })[0]);
    expect(clics).toEqual([{ href: '/', annule: false }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('avec une saisie, elle demande, dit où reprendre ; « Rester » garde la page, « Quitter » sort', () => {
    render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
          <DeclarerEntree saisie reprise="La question vous sera reposée." />
        </CoqueDEntree>,
      ),
    );
    fireEvent.click(screen.getAllByRole('link', { name: 'Retour au site' })[0]);
    expect(clics).toEqual([{ href: '/', annule: true }]);
    const boite = screen.getByRole('dialog');
    expect(within(boite).getByText(C.sortie.titre)).toBeInTheDocument();
    expect(within(boite).getByText('La question vous sera reposée.')).toBeInTheDocument();

    fireEvent.click(within(boite).getByRole('button', { name: C.sortie.rester }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(clics).toHaveLength(1);

    fireEvent.click(screen.getAllByRole('link', { name: 'Retour au site' })[0]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: C.sortie.partir }));
    // Le clic rejoué sur le lien lui-même, cette fois sans être retenu.
    expect(clics.at(-1)).toEqual({ href: '/', annule: false });
  });

  it('« ✕ » de `/publish` : la même garde', () => {
    render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'quitter' }}>
          <DeclarerEntree saisie />
        </CoqueDEntree>,
      ),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Fermer' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText(C.sortie.texte)).toBeInTheDocument();
  });
});

let prenomDuCompte: string | null = 'Awa';

describe('AC3 — `/onboarding/intention`, la vraie page', () => {
  beforeEach(() => {
    prenomDuCompte = 'Awa';
  });
  vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
  vi.mock('@/app/actions/auth', () => ({
    getMeAction: async () => ({ id: 1, first_name: prenomDuCompte, preferences: {} }),
    updateProfileAction: vi.fn(),
  }));
  vi.mock('@/app/actions/profiles', () => ({ getMyProfilesAction: async () => ({ ok: true, data: { data: [] } }) }));

  // TCK-2608 — la liste des quartiers suggérés ne part pas sur le réseau : l'API locale n'est pas l'objet du test.
  vi.mock('@/lib/api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/api')>()),
    apiFetch: async () => {
      throw new Error('hors réseau');
    },
  }));

  /**
   * L'écran du prénom passe par `OnboardingShell` (composant serveur asynchrone, exécuté à la main) ;
   * l'orientation (TCK-2608) monte la coque elle-même, sans sortie.
   */
  async function monter() {
    const { default: Page } = await import('@/app/onboarding/intention/page');
    const { OnboardingShell } = await import('@/components/onboarding/OnboardingShell');
    const element = (await Page({ searchParams: Promise.resolve({}) })) as ReactElement<Parameters<typeof OnboardingShell>[0]>;
    render(withIntl(element.type === OnboardingShell ? await OnboardingShell(element.props) : element));
  }

  it('TCK-2608 — l’orientation : la coque sans « Retour au site », la marque mène au site, « Plus tard » dans la barre', async () => {
    await monter();
    expect(screen.getAllByText(C.compteCree).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Retour au site' })).not.toBeInTheDocument();
    for (const marque of screen.getAllByRole('link', { name: /Takussan/ })) expect(marque).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('button', { name: frMessages.onboarding.orientation.plusTard })).toHaveLength(2);
    expect(screen.getByRole('button', { name: frMessages.onboarding.orientation.portes.publier.titre })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('l’écran du prénom : un nom tapé et pas encore envoyé est une saisie', async () => {
    prenomDuCompte = null;
    await monter();
    expect(screen.getAllByRole('img', { name: 'Étape 1 sur 2' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('link', { name: 'Retour au site' })[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: frMessages.onboarding.intention.name.firstName }), { target: { value: 'Awa' } });
    fireEvent.click(screen.getAllByRole('link', { name: 'Retour au site' })[0]);
    expect(clics.at(-1)).toEqual({ href: '/', annule: true });
    expect(within(screen.getByRole('dialog')).getByText(frMessages.onboarding.intention.name.reprise)).toBeInTheDocument();
  });
});

describe('ce que les segments gardent', () => {
  vi.mock('@/i18n/messages', async () => ({
    messagesPour: async () => (await import('@/messages/fr.json')).default,
  }));

  it('`noindex` sur les quatre segments', async () => {
    const auth = await (await import('@/app/(auth)/layout')).generateMetadata();
    const invitations = await (await import('@/app/invitations/layout')).generateMetadata();
    const { metadata: onboarding } = await import('@/app/onboarding/layout');
    const { metadata: publish } = await import('@/app/publish/layout');
    for (const meta of [auth, invitations, onboarding, publish]) expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('AC5 — `/publish` rend sous la coque un toast déclenché au premier rendu, sans frontière d’erreur', async () => {
    const { useToast } = await import('@/components/ui/toast');
    function ToastAuPremierRendu() {
      const toast = useToast();
      useEffect(() => {
        toast.add({ title: 'Espace changé' });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois, au premier rendu
      }, []);
      return <p>page</p>;
    }
    const { default: PublishLayout } = await import('@/app/publish/layout');
    render(withIntl(await PublishLayout({ children: <ToastAuPremierRendu /> })));
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(await screen.findByText('Espace changé')).toBeInTheDocument();
    expect(screen.getAllByText(C.publier)).toHaveLength(2);
  });
});
