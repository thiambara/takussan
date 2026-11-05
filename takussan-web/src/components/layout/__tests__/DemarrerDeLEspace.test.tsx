/**
 * TCK-2479 (AC5, ADR-0089 §5) — le groupe « Démarrer » d'un espace neuf, éprouvé seul : trois liens
 * vers l'écran qui fait chaque étape, une étape faite qui SORT du groupe, rien quand tout est fait
 * (ni au chargement, ni sur une erreur, ni pour un profil sans étape), et un geste qui le masque —
 * sans survivre au remontage tant que TCK-2480 ne l'enregistre pas. Son branchement dans la barre
 * (qui le voit, où) est éprouvé par `AppSidebar.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { withIntl } from '@/test/intl';
import { DemarrerDeLEspace } from '../DemarrerDeLEspace';

type Reponse = { data?: { data: { etapes: { code: string; faite: boolean }[] } }; isError?: boolean };

const etat = vi.hoisted(() => ({
  reponse: {} as Reponse,
  profil: null as string | null,
  profilResoluParLApi: undefined as string | null | undefined,
  options: [] as { enabled: boolean }[],
}));
vi.mock('@/lib/queries/demarrage-espace', () => ({
  useDemarrageDeLEspace: (options: { enabled: boolean }) => (etat.options.push(options), etat.reponse),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ activeProfileId: etat.profil }) }));
// Le profil que l'API a résolu (`/api/me/profiles` → `meta.active_profile_id`), lu par le sélecteur
// de profil de la barre : le même cache.
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: etat.profilResoluParLApi === undefined ? undefined : { data: [], meta: { active_profile_id: etat.profilResoluParLApi, count: 1 } },
  }),
}));

const CODES = ['premier_bien', 'kyc', 'equipe'];
const avec = (...faites: boolean[]): Reponse => ({
  data: { data: { etapes: faites.map((faite, i) => ({ code: CODES[i]!, faite })) } },
});
const ui = (mode: 'espace' | 'bailleur' = 'espace', onNavigate?: () => void) =>
  withIntl(<DemarrerDeLEspace mode={mode} onNavigate={onNavigate} />);

describe('<DemarrerDeLEspace> — TCK-2479 (AC5)', () => {
  beforeEach(() => {
    etat.reponse = {};
    etat.profil = null;
    etat.profilResoluParLApi = undefined;
    etat.options = [];
  });

  it('une agence neuve : un groupe « Démarrer », trois liens vers l’écran qui fait chaque étape', () => {
    etat.reponse = avec(false, false, false);
    render(ui());
    const groupe = screen.getByRole('group', { name: 'Démarrer' });
    expect(
      within(groupe)
        .getAllByRole('link')
        .map((l) => [l.textContent, l.getAttribute('href')]),
    ).toEqual([
      ['Publier un premier bienÀ faire', '/app/properties/new'],
      ['Faire vérifier l’agenceÀ faire', '/app/agency/kyc'],
      ['Inviter un premier membreÀ faire', '/app/agency/team'],
    ]);
    expect(within(groupe).getByText('0 sur 3')).toBeInTheDocument();
    expect(etat.options.at(-1)).toEqual({ enabled: true });
  });

  it('AC5 — disparaît étape par étape, puis en entier', () => {
    etat.reponse = avec(false, false, false);
    const { rerender, container } = render(ui());
    expect(screen.getAllByRole('link')).toHaveLength(3);

    etat.reponse = avec(true, false, false);
    rerender(ui());
    expect(screen.queryByRole('link', { name: /Publier un premier bien/ })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('1 sur 3')).toBeInTheDocument();

    etat.reponse = avec(true, true, false);
    rerender(ui());
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/app/agency/team']);
    expect(screen.getByText('2 sur 3')).toBeInTheDocument();

    etat.reponse = avec(true, true, true);
    rerender(ui());
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['au chargement', {}],
    ['sur une erreur', { isError: true }],
    ['sur une erreur, même avec un ancien `data` gardé par le cache', { ...avec(false, false, false), isError: true }],
    ['pour `etapes: []`', { data: { data: { etapes: [] } } }],
    ['pour un code inconnu seulement', { data: { data: { etapes: [{ code: 'inconnu', faite: false }] } } }],
    ['pour une réponse sans `etapes` (contrat qui dérive) — sans lever', { data: { data: [] } }],
    ['pour une réponse sans `data`', { data: {} }],
  ] as const)('rien %s', (_cas, reponse) => {
    etat.reponse = reponse as Reponse;
    const { container } = render(ui());
    expect(container).toBeEmptyDOMElement();
  });

  it('bailleur : ses libellés, et le KYC rouvre SON assistant', () => {
    etat.reponse = {
      data: { data: { etapes: [{ code: 'premier_bien', faite: false }, { code: 'kyc', faite: false }] } },
    };
    etat.profil = 'owner:3';
    render(ui('bailleur'));
    expect(screen.getByRole('link', { name: /Proposer un premier bien/ })).toHaveAttribute('href', '/app/properties/new');
    expect(screen.getByRole('link', { name: /Envoyer vos pièces d’identité/ })).toHaveAttribute(
      'href',
      '/onboarding/owner?owner=3',
    );
    expect(screen.getByText('0 sur 2')).toBeInTheDocument();
  });

  /**
   * Mesuré au navigateur (tâche 6) : la connexion ne pose pas le cookie `active_profile_id`, donc
   * `activeProfileId` vaut `null` pour un bailleur connecté normalement. Le lien perdait `?owner=`, et
   * `/onboarding/owner` renvoie alors vers `/app` un profil déjà actif : l'étape bouclait. Le profil
   * que l'API a résolu prend le relais.
   */
  it('bailleur sans cookie de profil : le KYC rouvre l’assistant du profil que l’API a résolu', () => {
    etat.reponse = { data: { data: { etapes: [{ code: 'kyc', faite: false }] } } };
    etat.profil = null;
    etat.profilResoluParLApi = 'owner:2';
    render(ui('bailleur'));
    expect(screen.getByRole('link', { name: /Envoyer vos pièces d’identité/ })).toHaveAttribute(
      'href',
      '/onboarding/owner?owner=2',
    );
  });

  it('le profil choisi dans le client prime sur la lecture de l’API (un changement d’espace en cours)', () => {
    etat.reponse = { data: { data: { etapes: [{ code: 'kyc', faite: false }] } } };
    etat.profil = 'owner:3';
    etat.profilResoluParLApi = 'owner:2';
    render(ui('bailleur'));
    expect(screen.getByRole('link', { name: /Envoyer vos pièces d’identité/ })).toHaveAttribute(
      'href',
      '/onboarding/owner?owner=3',
    );
  });

  it('un clic sur une étape referme le tiroir (onNavigate)', async () => {
    etat.reponse = avec(false, false, false);
    const onNavigate = vi.fn();
    render(ui('espace', onNavigate));
    await userEvent.setup().click(screen.getByRole('link', { name: /Inviter un premier membre/ }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('un geste le masque, et il cesse de se lire ; il revient au remontage tant que TCK-2480 ne l’enregistre pas', async () => {
    etat.reponse = avec(false, false, false);
    const { container, unmount } = render(ui());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Masquer « Démarrer »' }));
    expect(container).toBeEmptyDOMElement();
    expect(etat.options.at(-1)).toEqual({ enabled: false });

    unmount();
    render(ui());
    expect(screen.getByRole('group', { name: 'Démarrer' })).toBeInTheDocument();
  });

  it('chaque cible porte l’anneau de focus de la barre, et aucune la couleur primaire', () => {
    etat.reponse = avec(false, false, false);
    render(ui());
    for (const cible of [...screen.getAllByRole('link'), screen.getByRole('button')]) {
      expect(cible.className).toContain('focus-visible:ring-2');
      expect(cible.className).not.toMatch(/\b(bg|text)-primary\b/);
    }
  });

  it('a11y : aucune violation', async () => {
    etat.reponse = avec(true, false, false);
    const { container } = render(ui());
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
