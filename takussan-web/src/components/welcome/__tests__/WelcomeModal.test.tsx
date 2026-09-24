import { fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { WelcomeIllustration } from '@/components/welcome/WelcomeIllustration';
import { WelcomeModal, type WelcomeSlide } from '@/components/welcome/WelcomeModal';
import { withIntl } from '@/test/intl';

import { classesMasquantes, raisonsDInvisibilite } from './visibilite';

/**
 * TCK-567 (M10) — retour testeur du 2026-09-23, à 390 px : « Les 3 écrans du carrousel ont des
 * espaces vides ». La capture montre, sous le texte de la diapositive, un grand bloc blanc jusqu'aux
 * pastilles.
 *
 * Le mécanisme, lu dans le code : la modale est PLEIN ÉCRAN sous `sm` (`h-[100dvh]`, conforme à
 * TCK-251), et le seul enfant qui grandit était un espaceur VIDE (`<div className="flex-1" />`)
 * posé entre le texte et les pastilles. Aucun des cinq parcours ne passait d'illustration : la
 * hauteur libérée allait donc tout entière à ce vide.
 *
 * jsdom ne calcule aucune mise en page : ces tests portent sur la STRUCTURE qui la commande —
 * ce qui grandit doit porter le contenu, jamais être vide.
 */

function diapos(avecIllustration: boolean): WelcomeSlide[] {
  return [1, 2, 3].map((n) => ({
    title: `Titre ${n}`,
    body: `Corps ${n}`,
    ...(avecIllustration ? { illustration: <WelcomeIllustration icon={House} /> } : {}),
  }));
}

function monter(slides: WelcomeSlide[]) {
  render(withIntl(<WelcomeModal open slides={slides} onComplete={vi.fn()} onSkip={vi.fn()} />));
  return screen.getByRole('dialog');
}

/** Un élément qui prend la hauteur libre (`flex-1` / `grow`) sans rien porter. */
function espaceursVides(racine: HTMLElement): HTMLElement[] {
  return Array.from(racine.querySelectorAll<HTMLElement>('*')).filter(
    (el) =>
      /(^|\s)(flex-1|grow|flex-grow)(\s|$)/.test(el.className)
      && el.children.length === 0
      && (el.textContent ?? '').trim() === '',
  );
}

describe('WelcomeModal — pas de bloc vide dans le carrousel (TCK-567, M10)', () => {
  it('aucun espaceur vide ne prend la hauteur libre — sans illustration', () => {
    const dialog = monter(diapos(false));
    expect(espaceursVides(dialog)).toEqual([]);
  });

  it('aucun espaceur vide ne prend la hauteur libre — avec illustration', () => {
    const dialog = monter(diapos(true));
    expect(espaceursVides(dialog)).toEqual([]);
  });

  it('la zone qui grandit porte le texte de la diapositive, et l’illustration au-dessus', () => {
    const dialog = monter(diapos(true));
    const scene = within(dialog).getByTestId('welcome-stage');

    expect(scene.className).toMatch(/(^|\s)flex-1(\s|$)/);
    expect(within(scene).getByText('Titre 1')).toBeInTheDocument();
    const illustration = within(scene).getByTestId('welcome-illustration');
    const titre = within(scene).getByText('Titre 1');
    // L'illustration PRÉCÈDE le titre dans le document (spec TCK-251 : « illustration au-dessus »).
    expect(illustration.compareDocumentPosition(titre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('une diapositive que son parcours n’illustre pas reçoit l’illustration par défaut', () => {
    // Le parcours administrateur d'agence ne passait aucune illustration : la hauteur réservée
    // restait vide (vérification adverse du 2026-09-23). La modale ne laisse plus ce choix.
    const dialog = monter(diapos(false));
    for (const n of [1, 2, 3]) {
      const illustration = within(dialog).getByTestId('welcome-illustration');
      expect(illustration.querySelector('svg')).not.toBeNull();
      expect(raisonsDInvisibilite(illustration, ['[@media(max-height:30rem)]:hidden'])).toEqual([]);
      expect(illustration).toHaveAttribute('aria-hidden', 'true');
      if (n < 3) fireEvent.click(within(dialog).getByTestId('welcome-next'));
    }
  });

  it('l’illustration passée par le parcours prime sur celle par défaut', () => {
    const dialog = monter(diapos(true));
    const svg = within(dialog).getByTestId('welcome-illustration').querySelector('svg');
    expect(svg?.getAttribute('class')).toMatch(/lucide-house/);
  });

  /*
   * jsdom ne calcule aucune mise en page : ces tests gardent les CLASSES qui la commandent, comme
   * `CoqueHauteur.test.tsx` garde une unité. La géométrie qu'elles produisent est mesurée au
   * navigateur sur le DOM réel du composant, avec la CSS compilée de l'app (TCK-567, AC1 et AC2).
   * Chacune des mutations qu'ils refusent a été mesurée : elle rendait le défaut à l'écran en
   * laissant toute la suite verte (vérifications adverses du 2026-09-23).
   */
  function classesDe(el: HTMLElement): string[] {
    return el.className.split(/\s+/).filter(Boolean);
  }

  it('la scène centre la diapositive par des marges auto — un centrage sûr quand elle déborde', () => {
    const dialog = monter(diapos(true));
    const scene = within(dialog).getByTestId('welcome-stage');
    const diapositive = within(dialog).getByTestId('welcome-slide');

    // La scène prend la hauteur libre et défile quand elle manque (paysage).
    expect(classesDe(scene)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'flex-1', 'min-h-0', 'overflow-y-auto']));
    // Sa diapositive est son SEUL enfant, et c'est elle qui se centre : `my-auto` absorbe
    // l'espace libre en portrait (sinon il retombe tout entier sous le texte : 215 px sans rien de
    // peint à 390 × 844 au lieu de 121) et vaut 0 en débordement (la diapositive part du haut).
    expect(Array.from(scene.children)).toEqual([diapositive]);
    expect(classesDe(diapositive)).toContain('my-auto');
    expect(within(diapositive).getByText('Titre 1')).toBeInTheDocument();
    // Un `justify-content` NON SÛR sur une zone qui défile coupe le débordement du haut sans
    // qu'on puisse y remonter : 56 px d'illustration perdus à 568 × 320 (réparation 1), 24 px
    // encore à 360 × 640 avec le texte agrandi à 150 % — là où `my-auto` ne coupe rien.
    expect(classesDe(scene).filter((c) => /^justify-(center|end|between|around|evenly)$/.test(c))).toEqual([]);

    // Pastilles et boutons restent en pied, à leur hauteur : ils ne se partagent pas le vide.
    const pied = [within(dialog).getByRole('group', { name: /1.*3/ }), within(dialog).getByTestId('welcome-next').parentElement!];
    for (const bloc of pied) {
      expect(scene.contains(bloc)).toBe(false);
      expect(classesDe(bloc)).toContain('shrink-0');
      expect(bloc.className).not.toMatch(/(^|\s)(flex-1|grow)(\s|$)/);
    }
  });

  it.each([
    ['illustrée par le parcours', true],
    ['sans illustration (celle par défaut)', false],
  ])('la boîte de l’illustration porte À LA FOIS sa hauteur et sa peinture — %s', (_cas, avecIllustration) => {
    const dialog = monter(diapos(avecIllustration));
    const boite = within(dialog).getByTestId('welcome-illustration');
    const classes = classesDe(boite);

    // Peinte : c'est ELLE qui porte la surface, pas un enfant censé la remplir. Hauteur sur la
    // boîte et peinture dans l'enfant (`h-full`), la perte du `h-full` rendait 80 px peints dans
    // 320 réservés — le bloc blanc du testeur, suite verte.
    expect(classes).toContain('bg-muted');
    expect(boite.querySelectorAll('.bg-muted')).toHaveLength(0);

    // Dimensionnée sur téléphone par la HAUTEUR DE L'ÉCRAN (la modale y est plein écran) : sans
    // cette hauteur, la boîte se réduit à son icône et le vide revient — 241 px sans rien de
    // peint à 390 × 844 au lieu de 121.
    const telephone = classes.map((c) => /^h-\[clamp\(([\d.]+)rem,(.+),([\d.]+)rem\)\]$/.exec(c)).find(Boolean);
    // ⚠ Messages d'assertion SANS syntaxe de classe : Tailwind scanne aussi les tests, et un
    // message qui en avait la forme générait une règle CSS invalide dans la CSS livrée.
    expect(telephone, 'hauteur téléphone bornée par clamp, en rem, portée par la hauteur d’écran').toBeTruthy();
    const [, min, preferee, max] = telephone!;
    expect(Number(min)).toBeGreaterThanOrEqual(9);
    expect(Number(max)).toBeGreaterThan(Number(min));
    // Le terme préféré est « ce que l'écran laisse après le reste de la modale ». Ce reste (croix,
    // titre, texte, pastilles, boutons, marges) est MESURÉ au navigateur à 19,4 à 21 rem (client
    // fr/en/wo, agence ; 390 × 844, 390 × 664, 360 × 740, 360 × 640). En deçà de 21, le texte
    // passe sous la ligne de flottaison dès que le terme s'applique ; au-delà de 27, chaque rem
    // soustrait en trop est retiré à l'illustration et rendu au vide : 44 la rabattait sur son
    // plancher, 209 px sans rien de peint à 390 × 844 au lieu de 121 (vérification adverse).
    const soustrait = /^calc\(100dvh-([\d.]+)rem\)$/.exec(preferee);
    expect(soustrait, 'terme préféré : 100dvh moins une longueur en rem').toBeTruthy();
    expect(Number(soustrait![1])).toBeGreaterThanOrEqual(21);
    expect(Number(soustrait![1])).toBeLessThanOrEqual(27);
    // …et fixée à partir de `sm`, où la modale redevient une carte centrée.
    expect(classes.some((c) => /^sm:h-(\d+|\[.+\])$/.test(c))).toBe(true);
    expect(classes).toContain('shrink-0');

    // Bloc conteneur des halos, qui se dimensionnent en `%` de la boîte, et qui la bordent.
    expect(classes).toEqual(expect.arrayContaining(['relative', 'overflow-hidden']));
  });

  it('sur un écran bas (paysage), l’illustration décorative s’efface devant le texte', () => {
    // À 568 × 320, la scène n'a que 146 px : illustration en tête, titre et texte passaient sous
    // la ligne de flottaison, sans signe qu'il fallait défiler (TCK-567, AC2).
    const dialog = monter(diapos(true));
    const classes = classesDe(within(dialog).getByTestId('welcome-illustration'));
    const seuil = classes.map((c) => /^\[@media\(max-height:([\d.]+)rem\)\]:hidden$/.exec(c)).find(Boolean);
    expect(seuil, 'variante de requête média sur la hauteur maximale, en rem, qui masque').toBeTruthy();
    // Au moins 24rem (384 px) pour couvrir les téléphones en paysage mesurés (320 à 390 px de
    // haut), au plus 36rem pour ne jamais l'ôter à un téléphone en portrait (640 px et plus).
    expect(Number(seuil![1])).toBeGreaterThanOrEqual(24);
    expect(Number(seuil![1])).toBeLessThanOrEqual(36);
  });

  it('rien d’autre ne masque l’illustration — ni sur la boîte, ni sur ce qui la contient', () => {
    // Vérification adverse du 2026-09-23 : `max-sm:hidden` (ou `hidden sm:flex`, la forme qu'on
    // écrit pour « gagner de la place sur mobile ») sur la boîte rendait sur téléphone le vide du
    // testeur — 293 px sans rien de peint à 390 × 844 au lieu de 121 — suite verte : les gardes
    // vérifiaient la PRÉSENCE de la hauteur et de la peinture, jamais qu'aucune autre classe ne
    // les annule. Le seul masquage permis est celui de l'écran bas, sur la boîte elle-même.
    // Et une opacité PARTIELLE délave le panneau sans le retirer : la liste ne connaissait que
    // l'opacité nulle, et une opacité de 5 % au téléphone restait verte (vérification adverse,
    // 50/50 vert). `classesMasquantes` refuse toute opacité sous 100 %, et les formes arbitraires.
    const dialog = monter(diapos(true));
    const boite = within(dialog).getByTestId('welcome-illustration');
    const masquantes = (el: HTMLElement) => classesMasquantes(el);

    expect(masquantes(boite)).toEqual(['[@media(max-height:30rem)]:hidden']);
    for (let el = boite.parentElement; el && el !== dialog; el = el.parentElement) {
      expect(masquantes(el), el.dataset.testid ?? el.tagName).toEqual([]);
    }
  });

  it('l’illustration est AU-DESSUS du texte à l’écran, pas seulement dans le document', () => {
    // L'ordre du DOM ne suffit pas : `flex-col-reverse` sur la diapositive (ou un `order-*`)
    // posait l'illustration SOUS le texte, suite verte (vérification adverse du 2026-09-23),
    // contre TCK-251 qui la veut au-dessus.
    const dialog = monter(diapos(true));
    const diapositive = within(dialog).getByTestId('welcome-slide');
    const inversantes = (el: Element) =>
      (el as HTMLElement).className.split(/\s+/).filter((c) => /(^|:)(flex-col-reverse|flex-row|flex-row-reverse|order-.+)$/.test(c));

    expect(classesDe(diapositive)).toContain('flex-col');
    expect(inversantes(diapositive)).toEqual([]);
    for (const enfant of Array.from(diapositive.children)) {
      expect(inversantes(enfant)).toEqual([]);
    }
    expect(diapositive.firstElementChild).toBe(within(dialog).getByTestId('welcome-illustration'));
  });

  it('l’illustration est décorative : masquée aux lecteurs d’écran, le titre porte le sens', () => {
    const dialog = monter(diapos(true));
    const illustration = within(dialog).getByTestId('welcome-illustration');
    expect(illustration).toHaveAttribute('aria-hidden', 'true');
  });

  it('chaque diapositive garde son illustration en avançant', () => {
    const dialog = monter(diapos(true));
    for (const n of [1, 2, 3]) {
      expect(within(dialog).getByText(`Titre ${n}`)).toBeInTheDocument();
      expect(within(dialog).getByTestId('welcome-illustration')).toBeInTheDocument();
      if (n < 3) fireEvent.click(within(dialog).getByTestId('welcome-next'));
    }
  });

  it('l’indicateur d’étape n’annonce pas un rôle ARIA sans ses enfants requis', () => {
    const dialog = monter(diapos(false));
    // `role="tablist"` exige des `role="tab"` : les pastilles n'en sont pas (ce ne sont pas des
    // commandes). Le groupe garde son libellé « Étape 1 sur 3 ».
    expect(within(dialog).queryByRole('tablist')).toBeNull();
    expect(within(dialog).getByRole('group', { name: /1.*3/ })).toBeInTheDocument();
  });
});
