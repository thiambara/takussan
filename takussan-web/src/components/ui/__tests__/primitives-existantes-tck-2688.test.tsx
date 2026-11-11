/**
 * TCK-2688 — PRIMITIVES EXISTANTES, LOT 2, sous la portée `/app` : panneau latéral droit (et la
 * feuille du bas qui le devient dès `md`), tableau, bandeau d'avertissement, radio et carte de
 * choix, champ de recherche, toast sombre en bas.
 *
 * Deux sortes de preuves :
 *   · le COMPORTEMENT (dialogue modal ou non, `Échap`, focus rendu, verrou, effacement de la
 *     recherche, flèches du groupe de radios) ;
 *   · l'ASPECT par les classes posées, puis les contrastes RÉSOLUS par le harnais
 *     `contraste-wcag.ts` (aucun ratio recopié). Les tailles rendues (480 px, 50,4 px, 360 px…)
 *     se mesurent au navigateur sur la vitrine — cf. le ticket.
 *
 * Le non-changement hors portée (AC7) se lit ici : une classe neuve n'existe que sous `portee-app:`,
 * qui ne s'applique qu'à un document portant `[data-portee-app]`. Les blocs « hors portée »
 * retirent ces classes et comparent le reste aux classes d'avant le ticket, au caractère près.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataTable } from '@/components/console/DataTable';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { ActionDuToast, ToastProvider, Toaster, useToast } from '@/components/ui/toast';
import { WarningBanner } from '@/components/ui/warning-banner';
import { ATTRIBUT_POSITION_VERROUILLEE } from '@/hooks/useVerrouDeDefilement';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  SEUIL_NON_TEXTUEL,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '@/test/contraste-wcag';
import { withIntl } from '@/test/intl';
import { cn } from '@/lib/utils';

const classes = (el: Element) => Array.from(el.classList);
/** Les classes hors portée : celles qui s'appliquent sur le site public, `/super-admin`, l'onboarding. */
const horsPortee = (el: Element) => classes(el).filter((c) => !c.startsWith('portee-app:'));
const sousPortee = (el: Element) => classes(el).filter((c) => c.startsWith('portee-app:'));

type Jetons = Readonly<Record<string, string>>;
const rvb = (j: string, jetons: Jetons) => versRvb(resoudreCouleur(j, jetons));

const THEMES = [
  { nom: 'clair', jetons: JETONS_CLAIR },
  { nom: 'sombre', jetons: JETONS_SOMBRE },
] as const;

/** La couleur d'un préfixe sous une variante donnée (`''` = nue, `portee-app`…). */
function couleur(el: Element, prefixe: 'bg' | 'text' | 'border', variante = '') {
  const lus = classes(el)
    .map((c) => litUtilitaireDeCouleur(c, prefixe))
    .filter((u): u is NonNullable<typeof u> => u !== null && u.variante === variante);
  expect(lus, `${variante ? `${variante}:` : ''}${prefixe} sur ${el.className}`).toHaveLength(1);
  return lus[0]!;
}

/**
 * Un écran simulé : `largeur` en px, `grossier` pour un pointeur tactile. Les requêtes des
 * primitives sont évaluées comme le ferait le navigateur (`(width >= Nrem)`, et
 * `(not (pointer: coarse))` s'il y figure).
 */
function ecran(largeur: number, grossier = false) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => {
    const seuils = [...query.matchAll(/width >= ([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
    const large = seuils.every((s) => largeur >= s);
    const pointeur = /not \(pointer: coarse\)/.test(query) ? !grossier : true;
    return {
      matches: seuils.length > 0 && large && pointeur,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

let restaurer: (() => void) | null = null;
afterEach(() => {
  restaurer?.();
  restaurer = null;
  document.body.removeAttribute('style');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Panneau latéral droit
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('<PanneauDroit> (TCK-2688)', () => {
  function monter() {
    return render(
      withIntl(
        <>
          <Button>Autre ligne</Button>
          <PanneauDroit
            titre="Fiche du membre"
            declencheur={<Button>Ouvrir</Button>}
            pied={<Button>Déclarer une absence</Button>}
          >
            <p>Corps</p>
          </PanneauDroit>
        </>,
      ),
    );
  }

  it('AC1 — dès xl : 480 px fixes, bord gauche, ombre « panneau », en-tête h-14, titre 17 px, corps p-5, pied à droite', async () => {
    restaurer = ecran(1440);
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const panneau = await screen.findByRole('dialog', { name: 'Fiche du membre' });
    expect(classes(panneau)).toEqual(
      expect.arrayContaining(['fixed', 'inset-y-0', 'right-0', 'w-full', 'xl:w-panneau', 'xl:border-l', 'xl:border-border', 'xl:shadow-panneau', 'bg-card']),
    );
    const enTete = panneau.querySelector('[data-slot="panneau-droit-en-tete"]')!;
    expect(classes(enTete)).toEqual(expect.arrayContaining(['h-14', 'border-b', 'border-border', 'pl-5', 'pr-2']));
    const titre = panneau.querySelector('[data-slot="sheet-title"]')!;
    expect(classes(titre)).toEqual(expect.arrayContaining(['text-titre-court', 'font-semibold', 'truncate']));
    expect(classes(titre)).not.toContain('text-base');
    expect(classes(panneau.querySelector('[data-slot="panneau-droit-corps"]')!)).toEqual(expect.arrayContaining(['p-5', 'overflow-y-auto']));
    expect(classes(panneau.querySelector('[data-slot="panneau-droit-pied"]')!)).toEqual(
      expect.arrayContaining(['flex', 'justify-end', 'gap-2', 'border-t', 'border-border', 'px-5', 'py-3']),
    );
    const fermer = within(panneau).getByRole('button', { name: 'Fermer' });
    expect(classes(fermer)).toContain('text-foreground');
  });

  it('dès xl : AUCUN voile, pas d’`aria-modal`, la page reste utilisable (rien d’inerte) et un clic à côté ne le ferme pas', async () => {
    restaurer = ecran(1440);
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const panneau = await screen.findByRole('dialog', { name: 'Fiche du membre' });
    expect(panneau.hasAttribute('aria-modal')).toBe(false);
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull();
    const autre = screen.getByRole('button', { name: 'Autre ligne' });
    expect(autre.closest('[aria-hidden="true"], [inert]')).toBeNull();
    // Le focus initial de base-ui part sur une image suivante : on clique à côté APRÈS lui, comme
    // l'utilisateur (sinon il reprend le focus que le clic vient de donner — course du seul test).
    await waitFor(() => expect(panneau.contains(document.activeElement)).toBe(true));
    await user.click(autre);
    expect(document.activeElement).toBe(autre);
    // …et il ne le reprend pas ensuite : le panneau non modal laisse la page au clavier.
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(autre);
    expect(screen.getByRole('dialog', { name: 'Fiche du membre' })).toBeTruthy();
    // Le défilement de la page n'est pas verrouillé : on lit et on défile la liste à côté.
    expect(document.body.style.position).toBe('');
  });

  it('dès xl : le focus entre dans le panneau, `Échap` le ferme et rend le focus au déclencheur', async () => {
    restaurer = ecran(1440);
    const user = userEvent.setup();
    monter();
    const declencheur = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(declencheur);
    const panneau = await screen.findByRole('dialog', { name: 'Fiche du membre' });
    await waitFor(() => expect(panneau.contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(declencheur));
  });

  it('sous xl (ADR-0106 § 4) : plein écran et MODAL — `aria-modal`, reste de la page inerte, document verrouillé (TCK-551) puis rendu', async () => {
    restaurer = ecran(1024);
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const panneau = await screen.findByRole('dialog', { name: 'Fiche du membre' });
    expect(panneau.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Autre ligne').closest('[aria-hidden="true"], [inert]')).not.toBeNull();
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.hasAttribute(ATTRIBUT_POSITION_VERROUILLEE)).toBe(true);
    await user.click(within(panneau).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.position).toBe('');
  });
});

describe('<PanneauDroit> qui change de régime OUVERT (hydratation, rotation, fenêtre redimensionnée)', () => {
  /** Un `matchMedia` dont la largeur se change en cours de test, avec ses écouteurs `change`. */
  function ecranMobile(largeurInitiale: number) {
    const original = window.matchMedia;
    let largeur = largeurInitiale;
    const ecouteurs = new Set<() => void>();
    window.matchMedia = ((query: string) => {
      const seuils = [...query.matchAll(/width >= ([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
      return {
        get matches() {
          return seuils.length > 0 && seuils.every((x) => largeur >= x);
        },
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: (_: string, f: () => void) => {
          ecouteurs.add(f);
        },
        removeEventListener: (_: string, f: () => void) => {
          ecouteurs.delete(f);
        },
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
    return {
      elargir(l: number) {
        largeur = l;
        act(() => ecouteurs.forEach((f) => f()));
      },
      restaurer: () => {
        window.matchMedia = original;
      },
    };
  }

  it('ouvert en plein écran (sous xl, ou avant l’hydratation), puis la fenêtre passe xl : plus modal, plus rien d’inerte, plus de verrou', async () => {
    const e = ecranMobile(1024);
    restaurer = e.restaurer;
    render(
      withIntl(
        <>
          <Button>Autre ligne</Button>
          <PanneauDroit defaultOpen titre="Fiche">
            <p>Corps</p>
          </PanneauDroit>
        </>,
      ),
    );
    const panneau = await screen.findByRole('dialog', { name: 'Fiche' });
    expect(panneau.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.position).toBe('fixed');
    e.elargir(1440);
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Fiche' }).hasAttribute('aria-modal')).toBe(false));
    expect(screen.getByRole('dialog', { name: 'Fiche' }).getAttribute('data-regime')).toBe('lateral');
    await waitFor(() => expect(screen.getByText('Autre ligne').closest('[aria-hidden="true"], [inert]')).toBeNull());
    expect(document.body.style.position).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La feuille du bas, dès md : le panneau latéral (décision du porteur du 2026-11-11)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('<FeuilleDuBas> dès md : le panneau latéral droit, modal (décision du porteur, 2026-11-11)', () => {
  it('prend la géométrie et l’habit du panneau (480 px à droite, pleine hauteur), et plus celle du dialogue centré', async () => {
    restaurer = ecran(1440);
    const user = userEvent.setup();
    render(
      withIntl(
        <FeuilleDuBas titre="Mon compte" declencheur={<Button>Ouvrir</Button>} pied={<Button>Envoyer</Button>}>
          <p>Corps</p>
        </FeuilleDuBas>,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const feuille = await screen.findByRole('dialog', { name: 'Mon compte' });
    expect(classes(feuille)).toEqual(
      expect.arrayContaining([
        'md:inset-x-auto', 'md:inset-y-0', 'md:right-0', 'md:max-h-none', 'md:w-panneau', 'md:max-w-full',
        'md:rounded-none', 'md:border-l', 'md:border-border', 'md:shadow-panneau',
        'md:data-open:slide-in-from-right', 'md:data-closed:slide-out-to-right',
      ]),
    );
    for (const centre of ['md:max-w-lg', 'md:top-1/2', 'md:left-1/2', 'md:-translate-x-1/2', 'md:-translate-y-1/2', 'md:rounded-2xl', 'md:data-open:zoom-in-95']) {
      expect(classes(feuille), centre).not.toContain(centre);
    }
    expect(classes(feuille.querySelector('[data-slot="feuille-du-bas-en-tete"]')!)).toEqual(
      expect.arrayContaining(['md:h-14', 'md:border-b', 'md:border-border', 'md:py-0', 'md:pr-2', 'md:pl-5']),
    );
    expect(classes(feuille.querySelector('[data-slot="feuille-du-bas-corps"]')!)).toContain('md:p-5');
    expect(classes(feuille.querySelector('[data-slot="feuille-du-bas-pied"]')!)).toEqual(
      expect.arrayContaining(['md:flex', 'md:justify-end', 'md:gap-2', 'md:px-5', 'md:py-3']),
    );
    // Elle RESTE modale : voile, `aria-modal`.
    expect(feuille.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('[data-slot="sheet-overlay"]')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Tableau
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('<DataTable> sous la portée (TCK-2688)', () => {
  interface Ligne {
    readonly id: number;
    readonly nom: string;
  }
  function Table({ density }: { readonly density?: 'default' | 'compact' }) {
    const [tri, setTri] = useState('name');
    return (
      <DataTable<Ligne>
        data-testid="table"
        caption="Membres"
        density={density}
        rows={[{ id: 1, nom: 'Awa' }]}
        rowKey={(l) => l.id}
        sort={{ value: tri, onChange: setTri }}
        columns={[{ id: 'nom', header: 'Nom', sortKey: 'name', sortLabel: 'Trier par nom', cell: (l) => l.nom }]}
      />
    );
  }

  it('AC2 — en-tête en casse normale, graisse 500, sans interlettrage, sur `muted/40` ; cellule `py-3` ; conteneur bordé', () => {
    render(<Table />);
    const conteneur = screen.getByTestId('table');
    expect(sousPortee(conteneur)).toEqual(['portee-app:border', 'portee-app:border-border', 'portee-app:ring-0']);
    const th = conteneur.querySelector('th')!;
    expect(sousPortee(th)).toEqual(['portee-app:font-medium', 'portee-app:normal-case', 'portee-app:tracking-normal']);
    expect(classes(th)).toEqual(expect.arrayContaining(['text-xs', 'text-muted-foreground', 'px-3', 'py-2.5']));
    expect(sousPortee(conteneur.querySelector('thead')!)).toEqual(['portee-app:bg-muted/40']);
    // Le bouton de tri portait son propre `uppercase` : il suit aussi.
    expect(sousPortee(screen.getByRole('button', { name: 'Trier par nom' }))).toEqual(['portee-app:normal-case']);
    expect(sousPortee(conteneur.querySelector('td')!)).toEqual(['portee-app:py-3']);
    expect(classes(conteneur.querySelector('td')!)).toContain('px-3');
  });

  it('la densité `compact` garde `py-1.5` partout : aucune maquette ne la dessine', () => {
    render(<Table density="compact" />);
    const td = screen.getByTestId('table').querySelector('td')!;
    expect(sousPortee(td)).toEqual([]);
    expect(classes(td)).toContain('py-1.5');
  });

  it('AC7 — hors portée, les classes d’avant au caractère près (conteneur, en-tête, cellule)', () => {
    render(<Table />);
    const conteneur = screen.getByTestId('table');
    expect(horsPortee(conteneur).join(' ')).toBe('overflow-hidden rounded-xl bg-card ring-1 ring-border');
    expect(horsPortee(conteneur.querySelector('thead')!).join(' ')).toBe('[&_tr]:border-b bg-muted/60');
    expect(horsPortee(conteneur.querySelector('th')!)).toEqual(
      expect.arrayContaining(['px-3', 'py-2.5', 'h-auto', 'text-xs', 'font-semibold', 'uppercase', 'tracking-wide', 'text-muted-foreground']),
    );
    expect(horsPortee(conteneur.querySelector('td')!)).toEqual(expect.arrayContaining(['px-3', 'py-2.5', 'align-top', 'whitespace-normal']));
  });

  it('le tri au clavier fonctionne comme avant : `Entrée` sur l’en-tête bascule `aria-sort`', async () => {
    const user = userEvent.setup();
    render(<Table />);
    const th = screen.getByTestId('table').querySelector('th')!;
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    screen.getByRole('button', { name: 'Trier par nom' }).focus();
    await user.keyboard('{Enter}');
    expect(th.getAttribute('aria-sort')).toBe('descending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Bandeau d'avertissement
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('<WarningBanner> sous la portée (TCK-2688)', () => {
  it('AC3 — bord 1 px `warning/30`, `p-4`, encre PRINCIPALE ; l’icône seule reste ocre ; le titre en 600 au-dessus du texte', () => {
    render(
      <WarningBanner data-testid="b" icon={<svg data-testid="i" />} titre="Pièce expirée">
        Déposez une pièce valide.
      </WarningBanner>,
    );
    const bandeau = screen.getByTestId('b');
    expect(sousPortee(bandeau)).toEqual(['portee-app:border', 'portee-app:border-warning/30', 'portee-app:p-4', 'portee-app:text-foreground', 'portee-app:ring-0']);
    expect(sousPortee(screen.getByTestId('i').parentElement!)).toEqual(
      expect.arrayContaining(['portee-app:text-warning', 'portee-app:[&_svg]:size-5']),
    );
    const titre = screen.getByText('Pièce expirée');
    expect(titre.tagName).toBe('P');
    expect(classes(titre)).toEqual(expect.arrayContaining(['font-semibold', 'portee-app:text-corps']));
    expect(titre.nextElementSibling?.textContent).toBe('Déposez une pièce valide.');
  });

  it.each(THEMES)('AC3 — texte ≥ 4,5:1 et icône ≥ 3:1 sur `warning/10` aplati sur la carte — thème $nom', ({ jetons }) => {
    render(
      <WarningBanner data-testid="b" icon={<svg data-testid="i" />}>
        Texte
      </WarningBanner>,
    );
    const bandeau = screen.getByTestId('b');
    const fondU = couleur(bandeau, 'bg');
    const fond = composer(rvb(fondU.jeton, jetons), rvb('card', jetons), fondU.alpha);
    const encre = couleur(bandeau, 'text', 'portee-app');
    const icone = couleur(screen.getByTestId('i').parentElement!, 'text', 'portee-app');
    const texte = contraste(rvb(encre.jeton, jetons), fond);
    expect(texte, `texte ${fmt(texte)}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    if (jetons === JETONS_CLAIR) expect(texte, 'la maquette : plus de 13:1 en clair').toBeGreaterThan(13);
    expect(contraste(rvb(icone.jeton, jetons), fond)).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
  });

  it('AC7 — hors portée, les classes d’avant ; sans `titre`, le contenu tel quel', () => {
    render(<WarningBanner data-testid="b">Texte nu</WarningBanner>);
    const bandeau = screen.getByTestId('b');
    expect(horsPortee(bandeau).join(' ')).toBe('flex items-start gap-3 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning ring-1 ring-warning/20');
    expect(bandeau.querySelector('p')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Radio et carte de choix
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('<Radio> et <RadioGroup> (TCK-2688)', () => {
  function Groupe() {
    return (
      <RadioGroup defaultValue="mois" aria-label="Périodicité">
        {['mois', 'trimestre', 'an'].map((v) => (
          <label key={v}>
            <Radio value={v} data-testid={`r-${v}`} />
            {v}
          </label>
        ))}
      </RadioGroup>
    );
  }

  it('AC4 — 20 px (`size-5`), bord 1 px `controle-vide` (`--input` en clair : rgb(145, 134, 114)), coché `--primary` et point `size-2.5`', () => {
    render(<Groupe />);
    const radio = screen.getByTestId('r-trimestre');
    expect(classes(radio)).toEqual(expect.arrayContaining(['size-5', 'rounded-full', 'border', 'border-controle-vide', 'bg-card', 'data-checked:border-primary']));
    expect(resoudreCouleur(couleur(radio, 'border').jeton, JETONS_CLAIR)).toBe('#918672');
    const coche = screen.getByTestId('r-mois');
    const point = coche.querySelector('[data-slot="radio-indicator"]')!;
    expect(classes(point)).toEqual(expect.arrayContaining(['size-2.5', 'rounded-full', 'bg-primary']));
  });

  it('un seul arrêt de tabulation, les flèches déplacent le choix, le clic sur le libellé coche', async () => {
    const user = userEvent.setup();
    render(<Groupe />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);
    radios[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { checked: true })).toBe(radios[1]);
    await user.click(screen.getByText('an'));
    expect(screen.getByRole('radio', { checked: true })).toBe(radios[2]);
  });

  it.each(THEMES)('bord vide ≥ 3:1 sur carte et fond (WCAG 1.4.11) — thème $nom', ({ jetons }) => {
    render(<Groupe />);
    const bord = rvb(couleur(screen.getByTestId('r-an'), 'border').jeton, jetons);
    for (const surface of ['card', 'background', 'muted'] as const) {
      expect(contraste(bord, rvb(surface, jetons)), surface).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
    }
  });
});

describe('<ChoiceCard> sous la portée (TCK-2688)', () => {
  function Deux({ choix }: { readonly choix: string }) {
    return (
      <div role="radiogroup" aria-label="Vous êtes">
        <ChoiceCard name="n" value="a" checked={choix === 'a'} onSelect={() => {}} title="Bailleur" description="Un bien confié" />
        <ChoiceCard name="n" value="b" checked={choix === 'b'} onSelect={() => {}} title="Agence" />
      </div>
    );
  }
  const carte = (titre: string) => screen.getByText(titre).closest('label')!;

  it('AC4 — carte `min-h-16 rounded-xl px-3.5 py-3` centrée ; active : anneau de 3 px `primary/12` sur fond de carte ; titre 15 px 600, sous-titre 13 px', () => {
    render(<Deux choix="a" />);
    const active = carte('Bailleur');
    expect(sousPortee(active)).toEqual(
      expect.arrayContaining(['portee-app:min-h-16', 'portee-app:items-center', 'portee-app:px-3.5', 'portee-app:py-3', 'portee-app:bg-card', 'portee-app:ring-3', 'portee-app:ring-primary/12']),
    );
    expect(sousPortee(carte('Agence'))).not.toContain('portee-app:ring-3');
    const titre = screen.getByText('Bailleur');
    expect(sousPortee(titre)).toEqual(['portee-app:text-corps', 'portee-app:font-semibold']);
    expect(sousPortee(screen.getByText('Un bien confié'))).toEqual(['portee-app:text-ui', 'portee-app:leading-snug']);
    const rond = active.querySelector('span[aria-hidden]')!;
    expect(sousPortee(rond)).toEqual(['portee-app:mt-0', 'portee-app:size-5', 'portee-app:border']);
    expect(sousPortee(carte('Agence').querySelector('span[aria-hidden]')!)).toContain('portee-app:border-controle-vide');
    expect(sousPortee(rond.firstElementChild!)).toEqual(['portee-app:size-2.5']);
  });

  it('le focus clavier se peint toujours sur la carte, active comprise (`has-[input:focus-visible]`)', () => {
    render(<Deux choix="a" />);
    expect(classes(carte('Bailleur'))).toEqual(
      expect.arrayContaining(['has-[input:focus-visible]:border-ring', 'has-[input:focus-visible]:ring-3', 'has-[input:focus-visible]:ring-ring']),
    );
  });

  it('AC7 — hors portée (les deux cartes de l’onboarding) : les classes d’avant', () => {
    render(<Deux choix="a" />);
    expect(horsPortee(carte('Bailleur')).join(' ')).toBe(
      'group relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-[background-color,border-color] duration-150 ease-out border-primary bg-primary/[0.06] has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Champ de recherche
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('<DebouncedSearchInput> sous la portée (TCK-2688)', () => {
  function Hote({ initiale = '', surCommit = vi.fn() }: { readonly initiale?: string; readonly surCommit?: (v: string) => void }) {
    const [valeur, setValeur] = useState(initiale);
    return (
      <DebouncedSearchInput
        value={valeur}
        onCommit={(v) => {
          surCommit(v);
          setValeur(v);
        }}
        aria-label="Rechercher"
        placeholder="Rechercher"
        debounceMs={60_000}
      />
    );
  }

  it('AC5 — icône au jeton de 18 px, texte décalé de 12 + 18 + 8 px (sur l’échelle), croix native masquée', () => {
    render(withIntl(<Hote initiale="Dakar" />));
    const champ = screen.getByRole('searchbox', { name: 'Rechercher' });
    expect(sousPortee(champ)).toEqual(['portee-app:pl-[calc(var(--spacing)*5+var(--spacing-icone))]', 'portee-app:[&::-webkit-search-cancel-button]:appearance-none']);
    const loupe = champ.parentElement!.querySelector('svg.lucide-search')!;
    expect(classes(loupe)).toEqual(expect.arrayContaining(['left-3', 'portee-app:size-icone', 'text-muted-foreground']));
  });

  it('« Effacer la recherche » : vide le champ, part tout de suite, rend le focus au champ', async () => {
    const user = userEvent.setup();
    const surCommit = vi.fn();
    render(withIntl(<Hote initiale="Dakar" surCommit={surCommit} />));
    const effacer = screen.getByRole('button', { name: 'Effacer la recherche' });
    // Hors portée, le bouton n'est pas rendu visible : le champ natif garde sa croix.
    expect(classes(effacer)).toEqual(expect.arrayContaining(['hidden', 'portee-app:inline-flex']));
    await user.click(effacer);
    const champ = screen.getByRole('searchbox', { name: 'Rechercher' });
    expect(champ).toHaveProperty('value', '');
    expect(surCommit).toHaveBeenCalledWith('');
    expect(document.activeElement).toBe(champ);
    expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).toBeNull();
  });

  // `commit.cancel()` d'« effacer » n'a pas de test : le clic sur la croix fait d'abord perdre le focus
  // au champ, dont le `blur` vide déjà la temporisation (`flush`) — l'annulation est une défense.
  it('une frappe en attente : l’indicateur, pas la croix, et rien n’est parti', async () => {
    const user = userEvent.setup();
    const surCommit = vi.fn();
    render(withIntl(<Hote surCommit={surCommit} />));
    const champ = screen.getByRole('searchbox', { name: 'Rechercher' });
    await user.type(champ, 'Thiès');
    expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(surCommit).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Toast sombre en bas (décision D8 du porteur, ADR-0106 § 2)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('Toast sombre en bas, partout (TCK-2688)', () => {
  function Leveur({ type, avecAction = false }: { readonly type: string; readonly avecAction?: boolean }) {
    const toast = useToast();
    return (
      <button
        type="button"
        onClick={() =>
          toast.add({
            title: `titre-${type}`,
            description: 'détail',
            type,
            data: avecAction ? { action: <ActionDuToast>Annuler</ActionDuToast> } : undefined,
          })
        }
      >
        lever
      </button>
    );
  }
  async function lever(type: string, avecAction = false) {
    const user = userEvent.setup();
    render(
      withIntl(
        <ToastProvider>
          <Leveur type={type} avecAction={avecAction} />
          <Toaster />
        </ToastProvider>,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'lever' }));
    const titre = await screen.findByText(`titre-${type}`);
    return titre.closest<HTMLElement>('.rounded-xl')!;
  }

  it('AC6 — en bas (`--toast-bas`), pleine largeur à 16 px au téléphone, 360 px fixes à droite dès sm ; plus rien en haut', async () => {
    await lever('success');
    const zone = document.querySelector('[data-slot="toaster"]')!;
    expect(classes(zone)).toEqual(expect.arrayContaining(['fixed', 'inset-x-4', 'bottom-(--toast-bas)', 'sm:left-auto', 'sm:right-6', 'sm:w-toast', 'z-[1200]']));
    expect(classes(zone).filter((c) => /(^|:)top-/.test(c))).toEqual([]);
  });

  it('AC6 — une SURFACE sombre (`.dark` posé sur le toast) : `rounded-xl min-h-12 px-4 shadow-lg`, fond `--background` opaque, encre `--foreground`', async () => {
    const racine = await lever('info');
    expect(classes(racine)).toEqual(
      expect.arrayContaining(['dark', 'bg-background', 'text-foreground', 'rounded-xl', 'min-h-12', 'px-4', 'shadow-lg', 'items-center']),
    );
    // Rendu sous `.dark` : le fond vaut l'encre du thème clair, rgb(31, 24, 18) de la maquette.
    expect(versRvb(resoudreCouleur('background', JETONS_SOMBRE))).toEqual([31, 24, 18]);
    expect(resoudreCouleur('background', JETONS_SOMBRE)).toBe(resoudreCouleur('foreground', JETONS_CLAIR));
  });

  it('la coche du succès est à l’encre du toast, comme la maquette (`app-demandes` a-3) ; les autres tons en couleur', async () => {
    const succes = await lever('success');
    expect(couleur(succes.querySelector('svg')!, 'text').jeton).toBe('foreground');
  });

  it.each(['success', 'warning', 'error', 'info'] as const)(
    'ton « %s » : icône ≥ 3:1, titre et détail ≥ 4,5:1 sur le fond sombre',
    async (type) => {
      const racine = await lever(type);
      const fond = rvb('background', JETONS_SOMBRE);
      const icone = racine.querySelector('svg')!;
      const encreIcone = couleur(icone, 'text');
      const r = contraste(rvb(encreIcone.jeton, JETONS_SOMBRE), fond);
      expect(r, `icône ${type} (${encreIcone.jeton}) : ${fmt(r)}`).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
      expect(contraste(rvb('foreground', JETONS_SOMBRE), fond)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
      const detail = screen.getByText('détail');
      expect(contraste(rvb(couleur(detail, 'text').jeton, JETONS_SOMBRE), fond)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    },
  );

  it('l’action texte (« Annuler ») : un bouton nommé, encre principale à 80 % ≥ 4,5:1 sur le fond sombre', async () => {
    const racine = await lever('success', true);
    const action = within(racine).getByRole('button', { name: 'Annuler' });
    const u = couleur(action, 'text');
    const fond = rvb('background', JETONS_SOMBRE);
    const r = contraste(composer(rvb(u.jeton, JETONS_SOMBRE), fond, u.alpha), fond);
    expect(r, fmt(r)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    expect(action.getAttribute('type')).toBe('button');
  });

  describe('le jeton `--toast-bas` de globals.css', () => {
    const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');
    const bloc = css.slice(css.indexOf('TCK-2688 (décision D8'), css.indexOf('@theme inline'));

    // TCK-2689 — chaque formule porte le terme additif de la barre d'action (0 sans elle).
    it('16 px du bord par défaut, 24 dès sm (sur l’échelle : 21,6 dès lg, la maquette à 1440)', () => {
      expect(bloc).toMatch(/:root \{\s*--barre-d-action-hauteur: 0px;\s*--toast-bas: calc\(var\(--spacing\) \* 4 \+ var\(--barre-d-action-hauteur\)\);/);
      expect(bloc).toMatch(/@media \(width >= 40rem\) \{\s*:root \{\s*--toast-bas: calc\(var\(--spacing\) \* 6 \+ var\(--barre-d-action-hauteur\)\);/);
    });

    it('16 px AU-DESSUS de la barre d’onglets de /app sous md, et de celle du site public sous lg', () => {
      expect(bloc).toMatch(
        /@media \(width < 48rem\) \{(?:\s*[^{}@]+\{[^{}]*\})*\s*:root:has\(\[data-barre-onglets\]\) \{\s*--toast-bas: calc\(var\(--spacing\) \* 4 \+ var\(--barre-onglets-hauteur\) \+ var\(--barre-d-action-hauteur\)\);/,
      );
      expect(bloc).toMatch(
        /@media \(width < 64rem\) \{\s*:root:has\(\[data-barre-onglets-publique\]\):not\(:has\(\.takussan-carte-plein-ecran\)\) \{\s*--toast-bas: calc\(var\(--spacing\) \* 4 \+ var\(--barre-publique-hauteur\) \+ var\(--barre-d-action-hauteur\)\);/,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Les deux largeurs fixes
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('Les largeurs `panneau` et `toast` (TCK-2688)', () => {
  const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');

  it('sont en `rem` FIXES dans le bloc des primitives, jamais redéfinies par la densité du bureau', () => {
    const primitives = css.slice(css.indexOf('/* primitives-de-l-app:début'), css.indexOf('/* primitives-de-l-app:fin */'));
    expect(primitives).toMatch(/--spacing-panneau:\s*30rem;/);
    expect(primitives).toMatch(/--spacing-toast:\s*22\.5rem;/);
    expect(css.match(/--spacing-panneau:/g)).toHaveLength(1);
    expect(css.match(/--spacing-toast:/g)).toHaveLength(1);
  });

  it('`cn` les connaît : la largeur d’un appelant les remplace', () => {
    expect(cn('w-panneau', 'w-full')).toBe('w-full');
    expect(cn('sm:w-toast', 'sm:w-80')).toBe('sm:w-80');
  });
});
