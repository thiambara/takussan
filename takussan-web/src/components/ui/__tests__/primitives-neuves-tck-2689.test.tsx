/**
 * TCK-2689 — PRIMITIVES NEUVES, LOT 1, sous la portée `/app` : puce de filtre et sa rangée,
 * contrôle segmenté (sur `Tabs` par défaut), barre d'action collante, ligne de liste mobile.
 *
 * Deux sortes de preuves, comme pour TCK-2688 :
 *   · le COMPORTEMENT (`aria-pressed`, flèches du segmenté, portail de la barre dans l'emplacement
 *     de la coque, zone sûre, lien ou bouton de la ligne) ;
 *   · l'ASPECT par les classes posées, puis les contrastes RÉSOLUS par `contraste-wcag.ts`. Les
 *     tailles rendues (36 / 44 px, 73 px, 56 px, 44 / 39,6 px) se mesurent au navigateur sur la
 *     vitrine — cf. le ticket.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '@/components/ui/button';
import { BarreDAction, EMPLACEMENT_BARRE_D_ACTION } from '@/components/ui/barre-d-action';
import { IconeDeLigne, LigneDeListe, MontantDeLigne } from '@/components/ui/ligne-de-liste';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JETONS_CLAIR, JETONS_SOMBRE, SEUIL_AA_TEXTE, SEUIL_NON_TEXTUEL, contraste, fmt, resoudreCouleur, versRvb } from '@/test/contraste-wcag';
import { withIntl } from '@/test/intl';

const classes = (el: Element) => Array.from(el.classList);
const horsPortee = (el: Element) => classes(el).filter((c) => !c.startsWith('portee-app:'));
const sousPortee = (el: Element) => classes(el).filter((c) => c.startsWith('portee-app:'));

type Jetons = Readonly<Record<string, string>>;
const rvb = (j: string, jetons: Jetons) => versRvb(resoudreCouleur(j, jetons));
const THEMES = [
  { nom: 'clair', jetons: JETONS_CLAIR },
  { nom: 'sombre', jetons: JETONS_SOMBRE },
] as const;

afterEach(() => {
  document.getElementById(EMPLACEMENT_BARRE_D_ACTION)?.remove();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Puce de filtre et rangée
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('PuceDeFiltre (TCK-2689)', () => {
  it('une bascule : `aria-pressed` suit `active`, et le clic de l’appelant la fait changer', async () => {
    function Rangee() {
      const [actif, setActif] = useState('À traiter');
      return (
        <RangeeDePuces>
          {['À traiter', 'Traitées'].map((l) => (
            <PuceDeFiltre key={l} active={l === actif} onClick={() => setActif(l)}>
              {l}
            </PuceDeFiltre>
          ))}
        </RangeeDePuces>
      );
    }
    render(withIntl(<Rangee />));
    const [a, b] = screen.getAllByRole('button');
    expect(a).toHaveAttribute('type', 'button');
    expect(a).toHaveAttribute('aria-pressed', 'true');
    expect(b).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(b);
    expect(a).toHaveAttribute('aria-pressed', 'false');
    expect(b).toHaveAttribute('aria-pressed', 'true');
  });

  it('la variante « ajouter » est une ACTION : aucun `aria-pressed`, bord en tirets, « Ajouter un filtre » par défaut', () => {
    render(withIntl(<PuceDeFiltre variante="ajouter" active />));
    const puce = screen.getByRole('button', { name: 'Ajouter un filtre' });
    expect(puce).not.toHaveAttribute('aria-pressed');
    expect(puce).toHaveAttribute('data-variante', 'ajouter');
    expect(classes(puce)).toContain('data-[variante=ajouter]:border-dashed');
  });

  it('désactivée : le clic ne part pas', async () => {
    const clic = vi.fn();
    render(
      withIntl(
        <PuceDeFiltre disabled onClick={clic}>
          Vente
        </PuceDeFiltre>,
      ),
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Vente' }));
    expect(clic).not.toHaveBeenCalled();
  });

  it('le gabarit de la maquette : h-9 rounded-full border px-3.5 text-sm 500, gap-1.5 ; `sm` : h-8 px-3, 13 px', () => {
    render(
      withIntl(
        <>
          <PuceDeFiltre>Repos</PuceDeFiltre>
          <PuceDeFiltre taille="sm">Petite</PuceDeFiltre>
        </>,
      ),
    );
    const repos = screen.getByRole('button', { name: 'Repos' });
    expect(classes(repos)).toEqual(
      expect.arrayContaining(['h-9', 'rounded-full', 'border', 'border-border', 'bg-card', 'px-3.5', 'text-sm', 'font-medium', 'gap-1.5', 'whitespace-nowrap', 'flex-none']),
    );
    expect(classes(repos)).toEqual(
      expect.arrayContaining(['aria-pressed:border-foreground', 'aria-pressed:bg-foreground', 'aria-pressed:text-background']),
    );
    const petite = screen.getByRole('button', { name: 'Petite' });
    expect(petite).toHaveAttribute('data-taille', 'sm');
    expect(classes(petite)).toEqual(expect.arrayContaining(['data-[taille=sm]:h-8', 'data-[taille=sm]:px-3', 'data-[taille=sm]:text-ui']));
  });

  it('AC1 — la cible de 44 px : un `before:` centré, de la hauteur d’un contrôle de la portée, sur une puce `relative`', () => {
    render(withIntl(<PuceDeFiltre>Repos</PuceDeFiltre>));
    const puce = screen.getByRole('button', { name: 'Repos' });
    expect(classes(puce)).toEqual(
      expect.arrayContaining(['relative', 'before:absolute', 'before:inset-x-0', 'before:top-1/2', 'before:h-controle', 'before:-translate-y-1/2']),
    );
  });

  it('AC1 — le compte : `tabular-nums`, encre discrète au repos, encre douce INVERSE opaque sur la puce active (aucune encre translucide)', () => {
    render(
      withIntl(
        <PuceDeFiltre active compte={4}>
          À traiter
        </PuceDeFiltre>,
      ),
    );
    const compte = screen.getByText('4');
    expect(compte).toHaveAttribute('data-slot', 'puce-de-filtre-compte');
    expect(classes(compte)).toEqual(expect.arrayContaining(['tabular-nums', 'text-muted-foreground', 'group-aria-pressed/puce:text-encre-douce-inverse']));
    expect(compte.className).not.toMatch(/\/\d+/);
    expect(screen.getByRole('button')).toHaveClass('group/puce');
  });

  it.each(THEMES)('contrastes ($nom) : libellé actif, compte actif et compte au repos ≥ 4,5:1', ({ jetons }) => {
    const actif = contraste(rvb('background', jetons), rvb('foreground', jetons));
    const compteActif = contraste(rvb('encre-douce-inverse', jetons), rvb('foreground', jetons));
    const compteRepos = contraste(rvb('muted-foreground', jetons), rvb('card', jetons));
    expect(actif, fmt(actif)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    expect(compteActif, fmt(compteActif)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    expect(compteRepos, fmt(compteRepos)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
  });
});

describe('RangeeDePuces (TCK-2689)', () => {
  it('un groupe nommé « Filtres » par défaut, ou par l’appelant', () => {
    render(
      withIntl(
        <>
          <RangeeDePuces />
          <RangeeDePuces aria-label="Filtres des demandes" />
        </>,
      ),
    );
    expect(screen.getByRole('group', { name: 'Filtres' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filtres des demandes' })).toBeInTheDocument();
  });

  it('AC2 — défile dans SA boîte, sans barre : flex gap-2 overflow-x-auto px-4 py-2.5', () => {
    render(withIntl(<RangeeDePuces />));
    expect(classes(screen.getByRole('group'))).toEqual(
      expect.arrayContaining(['flex', 'gap-2', 'overflow-x-auto', 'px-4', 'py-2.5', '[scrollbar-width:none]', '[&::-webkit-scrollbar]:hidden']),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Contrôle segmenté (Tabs par défaut sous la portée)
// ─────────────────────────────────────────────────────────────────────────────────────────────

function Segmente({ size }: { readonly size?: 'sm' }) {
  return (
    <Tabs defaultValue="liste">
      <TabsList size={size} aria-label="Présentation">
        <TabsTrigger value="liste">Liste</TabsTrigger>
        <TabsTrigger value="carte">Carte</TabsTrigger>
        <TabsTrigger value="tableau">Tableau</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

describe('Contrôle segmenté — `Tabs` par défaut sous la portée `/app` (TCK-2689)', () => {
  /** Activation manuelle de base-ui (inchangée) : la flèche déplace le focus, Entrée choisit. */
  it('AC7 — au clavier comme avant : la flèche passe à l’item suivant, Entrée le choisit (`aria-selected`)', async () => {
    render(<Segmente />);
    const user = userEvent.setup();
    const liste = screen.getByRole('tab', { name: 'Liste' });
    const carte = screen.getByRole('tab', { name: 'Carte' });
    liste.focus();
    await user.keyboard('{ArrowRight}');
    expect(carte).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(carte).toHaveAttribute('aria-selected', 'true');
    expect(liste).toHaveAttribute('aria-selected', 'false');
  });

  it('AC3 — la piste : `p-1` (44 px au téléphone), hauteur libérée, plancher levé ; `p-0.5` en `sm`', () => {
    render(<Segmente />);
    const piste = screen.getByRole('tablist');
    expect(piste).toHaveAttribute('data-variant', 'default');
    expect(piste).toHaveAttribute('data-size', 'default');
    expect(sousPortee(piste)).toEqual(
      expect.arrayContaining([
        'portee-app:data-[variant=default]:p-1',
        'portee-app:data-[variant=default]:min-h-0',
        'portee-app:data-[variant=default]:group-data-horizontal/tabs:h-auto',
        'portee-app:data-[variant=default]:data-[size=sm]:p-0.5',
      ]),
    );
  });

  it('AC3 — l’item : h-9 px-4 ; actif `bg-card` + ombre « item actif » ; inactif `text-muted-foreground` ; sm : h-8 px-3 13 px', () => {
    render(<Segmente size="sm" />);
    expect(screen.getByRole('tablist')).toHaveAttribute('data-size', 'sm');
    const item = screen.getByRole('tab', { name: 'Liste' });
    expect(sousPortee(item)).toEqual(
      expect.arrayContaining([
        'portee-app:group-data-[variant=default]/tabs-list:h-9',
        'portee-app:group-data-[variant=default]/tabs-list:px-4',
        'portee-app:group-data-[variant=default]/tabs-list:data-active:bg-card',
        'portee-app:group-data-horizontal/tabs:group-data-[variant=default]/tabs-list:data-active:shadow-actif',
        'portee-app:group-data-[variant=default]/tabs-list:not-data-active:text-muted-foreground',
        'portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:h-8',
        'portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:px-3',
        'portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:text-ui',
      ]),
    );
  });

  /**
   * `portee-app:` est un `:where()` : il n'ajoute AUCUNE spécificité. Une règle du segmenté ne
   * l'emporte sur la règle de base qu'elle remplace (`px-1.5`, `h-[calc(100%-1px)]`,
   * `text-foreground/70`, `data-active:bg-background`) que par le sélecteur de groupe qu'elle
   * porte en plus. Sans lui, c'est l'ordre de la feuille qui trancherait.
   */
  it('chaque règle du segmenté porte le sélecteur de la variante (la spécificité qui la fait gagner)', () => {
    render(<Segmente />);
    const segmente = sousPortee(screen.getByRole('tab', { name: 'Liste' })).filter((c) => !c.includes('[variant=line]'));
    expect(segmente.length).toBeGreaterThanOrEqual(11);
    for (const c of segmente) expect(c).toContain('group-data-[variant=default]/tabs-list:');
    for (const c of sousPortee(screen.getByRole('tablist')).filter((x) => !x.includes(':w-full') && !x.includes('[variant=line]'))) {
      expect(c).toContain('data-[variant=default]:');
    }
  });

  /** Hors portée (`/super-admin`, site public) : rien ne change, au caractère près. */
  it('hors portée, la piste et l’item gardent les classes d’avant le ticket', () => {
    render(<Segmente />);
    expect(horsPortee(screen.getByRole('tablist')).join(' ')).toBe(
      'group/tabs-list inline-flex w-fit max-w-full items-center justify-center-safe rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 plancher-onglets-liste group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none bg-muted overflow-x-auto',
    );
    const item = horsPortee(screen.getByRole('tab', { name: 'Liste' }));
    expect(item).toEqual(expect.arrayContaining(['px-1.5', 'py-0.5', 'text-foreground/70', 'data-active:bg-background', 'group-data-[variant=default]/tabs-list:data-active:shadow-sm']));
    expect(item.some((c) => /(^|:)(bg-card|shadow-actif|h-9|px-4)$/.test(c))).toBe(false);
  });

  it.each(THEMES)('contrastes ($nom) : inactif `muted-foreground` sur la piste `muted` et actif sur `card` ≥ 4,5:1', ({ jetons }) => {
    const inactif = contraste(rvb('muted-foreground', jetons), rvb('muted', jetons));
    const actif = contraste(rvb('foreground', jetons), rvb('card', jetons));
    expect(inactif, fmt(inactif)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    expect(actif, fmt(actif)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Barre d'action collante
// ─────────────────────────────────────────────────────────────────────────────────────────────

function emplacement(basDeLEcran = false) {
  const el = document.createElement('div');
  el.id = EMPLACEMENT_BARRE_D_ACTION;
  if (basDeLEcran) el.setAttribute('data-bas-de-l-ecran', '');
  document.body.appendChild(el);
  return el;
}

describe('BarreDAction (TCK-2689)', () => {
  it('AC4 — l’aspect : filet, fond carte, py-3 px-4, ombre « barre collante », sous md seulement ; deux actions à 50/50', () => {
    render(
      <div data-testid="page">
        <BarreDAction>
          <Button size="xl">Refuser</Button>
          <Button size="xl">Accepter</Button>
        </BarreDAction>
      </div>,
    );
    const barre = screen.getByTestId('page').querySelector('[data-slot="barre-d-action"]')!;
    expect(barre).not.toBeNull();
    expect(classes(barre)).toEqual(
      expect.arrayContaining(['flex', 'flex-none', 'gap-2', 'border-t', 'border-border', 'bg-card', 'px-4', 'py-3', 'shadow-barre-collante', 'md:hidden', '*:min-w-0', '*:flex-1']),
    );
    expect(within(barre as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });

  it('dans la coque, la barre est rendue DANS l’emplacement — pas là où la page l’écrit', () => {
    const cible = emplacement();
    render(
      <div data-testid="page">
        <BarreDAction>
          <Button size="xl">Enregistrer</Button>
        </BarreDAction>
      </div>,
    );
    expect(screen.getByTestId('page').querySelector('[data-slot="barre-d-action"]')).toBeNull();
    expect(cible.querySelector('[data-slot="barre-d-action"]')).not.toBeNull();
    expect(within(cible).getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });

  it('AC4 — zone sûre : par `zoneSure` hors coque, par l’emplacement « bas de l’écran » dans la coque ; aucune sinon', () => {
    const { unmount } = render(<BarreDAction>A</BarreDAction>);
    const sans = document.querySelector('[data-slot="barre-d-action"]')!;
    expect(sans).not.toHaveAttribute('data-zone-sure');
    const zone = 'pb-[calc(var(--spacing)*3+env(safe-area-inset-bottom))]';
    expect(classes(sans)).toEqual(expect.arrayContaining([`data-zone-sure:${zone}`, `in-data-bas-de-l-ecran:${zone}`]));
    unmount();

    render(<BarreDAction zoneSure>B</BarreDAction>);
    expect(document.querySelector('[data-slot="barre-d-action"]')).toHaveAttribute('data-zone-sure', '');
  });

  describe('le bas du toast (`globals.css`)', () => {
    const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');

    it('`--barre-d-action-hauteur` vaut 0 hors barre, et filet + py-3 + action (73 px) sous md quand une barre occupe l’emplacement', () => {
      expect(css).toMatch(/:root \{\s*--barre-d-action-hauteur: 0px;/);
      expect(css).toMatch(
        /@media \(width < 48rem\) \{\s*:root:has\(#emplacement-barre-d-action > \[data-slot="barre-d-action"\]\) \{\s*--barre-d-action-hauteur: calc\(var\(--spacing-controle-action\) \+ var\(--spacing\) \* 6 \+ 1px\);/,
      );
      expect(css).toMatch(
        /@media \(width < 48rem\) \{(?:\s*[^{}@]+\{[^{}]*\})*\s*:root:has\(#emplacement-barre-d-action\[data-bas-de-l-ecran\] > \[data-slot="barre-d-action"\]\) \{\s*--barre-d-action-hauteur: calc\(var\(--spacing-controle-action\) \+ var\(--spacing\) \* 6 \+ 1px \+ env\(safe-area-inset-bottom\)\);/,
      );
      // L'`id` de la règle est celui de l'emplacement.
      expect(EMPLACEMENT_BARRE_D_ACTION).toBe('emplacement-barre-d-action');
    });

    it('chaque formule de `--toast-bas` ajoute la hauteur de la barre', () => {
      const formules = [...css.matchAll(/--toast-bas: (calc\([^;]+\));/g)].map((m) => m[1]);
      expect(formules).toHaveLength(4);
      for (const f of formules) expect(f).toContain('+ var(--barre-d-action-hauteur)');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Ligne de liste mobile
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('LigneDeListe (TCK-2689)', () => {
  it('AC5 — le gabarit : min-h-14 gap-3 px-4 py-2.5, filet bas ; titre 15 px 500, détail 13 px discret, tronqués', () => {
    render(<LigneDeListe titre="Awa Ndiaye" detail="Appartement F3" />);
    const titre = screen.getByText('Awa Ndiaye');
    const ligne = titre.closest('[data-slot="ligne-de-liste"]')!;
    expect(ligne.tagName).toBe('DIV');
    expect(classes(ligne)).toEqual(expect.arrayContaining(['flex', 'min-h-14', 'w-full', 'items-center', 'gap-3', 'px-4', 'py-2.5', 'border-b', 'border-border']));
    expect(classes(titre)).toEqual(expect.arrayContaining(['block', 'truncate', 'text-corps', 'font-medium']));
    expect(classes(screen.getByText('Appartement F3'))).toEqual(expect.arrayContaining(['block', 'truncate', 'text-ui', 'text-muted-foreground']));
    expect(titre.parentElement).toHaveClass('min-w-0', 'flex-1', 'leading-snug');
  });

  it('la cible est la ligne ENTIÈRE : un lien avec `href`, un bouton avec `onClick`', async () => {
    const clic = vi.fn();
    render(
      <>
        <LigneDeListe href="/app/leases/7" titre="Bail n° 7" chevron />
        <LigneDeListe onClick={clic} titre="Fuite" />
      </>,
    );
    const lien = screen.getByRole('link', { name: 'Bail n° 7' });
    expect(lien).toHaveAttribute('href', '/app/leases/7');
    expect(lien).toHaveAttribute('data-slot', 'ligne-de-liste');
    expect(lien.querySelector('[data-slot="ligne-de-liste-chevron"]')).toHaveClass('size-4', 'text-muted-foreground');
    expect(lien.querySelector('[data-slot="ligne-de-liste-chevron"]')).toHaveAttribute('aria-hidden', 'true');
    const bouton = screen.getByRole('button', { name: 'Fuite' });
    expect(bouton).toHaveAttribute('type', 'button');
    await userEvent.setup().click(bouton);
    expect(clic).toHaveBeenCalledOnce();
    expect(classes(bouton)).toEqual(expect.arrayContaining(['focus-visible:ring-3', 'focus-visible:ring-inset', 'focus-visible:ring-ring']));
  });

  it('début et fin : icône dans un disque size-9 à l’encre douce opaque ; montant tabulaire, jamais coupé', () => {
    render(
      <LigneDeListe
        debut={
          <IconeDeLigne>
            <svg />
          </IconeDeLigne>
        }
        titre="Quittance"
        fin={<MontantDeLigne>1 355 000 F</MontantDeLigne>}
      />,
    );
    const icone = document.querySelector('[data-slot="ligne-de-liste-icone"]')!;
    expect(classes(icone)).toEqual(expect.arrayContaining(['size-9', 'rounded-full', 'bg-muted', 'text-encre-douce', 'flex-none']));
    expect(icone).toHaveAttribute('aria-hidden', 'true');
    expect(classes(screen.getByText('1 355 000 F'))).toEqual(expect.arrayContaining(['tabular-nums', 'whitespace-nowrap', 'flex-none']));
  });

  it.each(THEMES)('contrastes ($nom) : détail ≥ 4,5:1 sur la carte, icône ≥ 3:1 sur son disque', ({ jetons }) => {
    const detail = contraste(rvb('muted-foreground', jetons), rvb('card', jetons));
    const icone = contraste(rvb('encre-douce', jetons), rvb('muted', jetons));
    expect(detail, fmt(detail)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    expect(icone, fmt(icone)).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
  });
});
