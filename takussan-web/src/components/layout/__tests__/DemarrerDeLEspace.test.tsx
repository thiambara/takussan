/**
 * TCK-2479 (AC5, ADR-0089 §5) — le groupe « Démarrer » d'un espace neuf, éprouvé seul : trois liens
 * vers l'écran qui fait chaque étape, une étape faite qui SORT du groupe, rien quand tout est fait
 * (ni au chargement, ni sur une erreur, ni pour un profil sans étape), et un geste qui le masque —
 * sans survivre au remontage quand rien ne l'enregistre ; TCK-2480 l'enregistre par `onMasquer`. Son
 * branchement dans la barre (qui le voit, où) est éprouvé par `AppSidebar.test.tsx`, et son masquage
 * enregistré par `AppSidebar.personnalisation.test.tsx`.
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
  options: [] as { enabled: boolean }[],
}));
vi.mock('@/lib/queries/demarrage-espace', () => ({
  useDemarrageDeLEspace: (options: { enabled: boolean }) => (etat.options.push(options), etat.reponse),
}));

const CODES = ['premier_bien', 'kyc', 'equipe'];
const avec = (...faites: boolean[]): Reponse => ({
  data: { data: { etapes: faites.map((faite, i) => ({ code: CODES[i]!, faite })) } },
});
const ui = (
  mode: 'espace' | 'bailleur' = 'espace',
  onNavigate?: () => void,
  ouverte: (href: string) => boolean = () => true,
) => withIntl(<DemarrerDeLEspace mode={mode} ouverte={ouverte} onNavigate={onNavigate} />);

describe('<DemarrerDeLEspace> — TCK-2479 (AC5)', () => {
  beforeEach(() => {
    etat.reponse = {};
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

  it('bailleur : ses libellés, et ses pièces se donnent sur « Vos pièces » (TCK-2614, 3a)', () => {
    etat.reponse = {
      data: { data: { etapes: [{ code: 'premier_bien', faite: false }, { code: 'kyc', faite: false }] } },
    };
    render(ui('bailleur'));
    expect(screen.getByRole('link', { name: /Proposer un premier bien/ })).toHaveAttribute('href', '/app/properties/new');
    expect(screen.getByRole('link', { name: /Envoyer vos pièces d’identité/ })).toHaveAttribute('href', '/app/pieces');
    expect(screen.getByText('0 sur 2')).toBeInTheDocument();
  });

  it('agent et prestataire : l’étape « Pièces » (TCK-2614, AC1)', () => {
    etat.reponse = { data: { data: { etapes: [{ code: 'pieces', faite: false }] } } };
    render(ui('espace'));
    expect(screen.getByRole('link', { name: /Envoyer vos pièces/ })).toHaveAttribute('href', '/app/pieces');
    expect(screen.getByText('0 sur 1')).toBeInTheDocument();
  });

  it('un clic sur une étape referme le tiroir (onNavigate)', async () => {
    etat.reponse = avec(false, false, false);
    const onNavigate = vi.fn();
    render(ui('espace', onNavigate));
    await userEvent.setup().click(screen.getByRole('link', { name: /Inviter un premier membre/ }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('sans `onMasquer`, un geste le masque, et il cesse de se lire ; il revient au remontage', async () => {
    etat.reponse = avec(false, false, false);
    const { container, unmount } = render(ui());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Masquer « Démarrer »' }));
    expect(container).toBeEmptyDOMElement();
    expect(etat.options.at(-1)).toEqual({ enabled: false });

    unmount();
    render(ui());
    expect(screen.getByRole('group', { name: 'Démarrer' })).toBeInTheDocument();
  });

  it('TCK-2480 — avec `onMasquer`, la croix le délègue au compte', async () => {
    etat.reponse = avec(false, false, false);
    const onMasquer = vi.fn();
    render(withIntl(<DemarrerDeLEspace mode="espace" ouverte={() => true} onMasquer={onMasquer} />));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Masquer « Démarrer »' }));
    expect(onMasquer).toHaveBeenCalledTimes(1);
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
