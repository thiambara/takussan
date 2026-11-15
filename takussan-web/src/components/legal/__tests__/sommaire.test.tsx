import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TexteJuridique, sommaireJuridique } from '@/components/legal/TexteJuridique';
import { fr as cguFr, en as cguEn } from '@/content/legal/terms';
import { fr as noticeFr } from '@/content/legal/notice';

/**
 * TCK-2516 — le sommaire et les ancres des pages légales.
 *
 * ⚠ Le sommaire n'est pas une liste écrite : il se DÉRIVE des titres du texte. L'attendu ci-dessous
 * est donc recalculé du source par une expression indépendante (`^# `), et non recopié — sans quoi
 * le test garderait une liste, et un titre ajouté au texte le ferait rougir au lieu de passer.
 */
const titresDePremierNiveau = (source: string) =>
  [...source.matchAll(/^[ \t]*#[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]!);

describe('sommaireJuridique — AC1', () => {
  it('liste EXACTEMENT les titres de premier niveau des CGU, dans l’ordre', () => {
    const attendus = titresDePremierNiveau(cguFr);
    // Plancher de non-vacuité : les CGU ont 21 parties le 2026-11-09, et la 17e est celle de l'AC2.
    expect(attendus.length).toBeGreaterThanOrEqual(21);
    expect(attendus[16]).toBe('17. Suspension et fin du compte');

    expect(sommaireJuridique(cguFr).map((e) => e.titre)).toEqual(attendus);
  });

  it('ignore les sous-titres (`##`, `###`)', () => {
    const titres = sommaireJuridique(cguFr).map((e) => e.titre);
    expect(titres).not.toContain('6.1 Engagements de l’annonceur');
    expect(titres.some((t) => /^\d+\.\d+ /.test(t))).toBe(false);
  });

  it('un titre ajouté au texte entre au sommaire, sans autre écriture', () => {
    const avant = sommaireJuridique(cguFr);
    const apres = sommaireJuridique(`${cguFr}\n\n# 22. Une partie ajoutée\n\nSon texte.\n`);
    expect(apres).toHaveLength(avant.length + 1);
    expect(apres.at(-1)).toEqual({ ancre: `partie-${avant.length + 1}`, titre: '22. Une partie ajoutée' });
  });

  it('les ancres sont stables : la position de la partie, pas son texte — les mêmes en français et en anglais', () => {
    const fr = sommaireJuridique(cguFr);
    const en = sommaireJuridique(cguEn);
    expect(fr.map((e) => e.ancre)).toEqual(fr.map((_, i) => `partie-${i + 1}`));
    // Le lien partagé « #partie-17 » mène à la même partie quelle que soit la langue de la page.
    expect(en.map((e) => e.ancre)).toEqual(fr.map((e) => e.ancre));
    expect(en[16]?.titre).toMatch(/^17\. /);
  });

  it('un texte sans numéros (mentions légales) a aussi ses ancres', () => {
    const entrees = sommaireJuridique(noticeFr);
    expect(entrees.length).toBeGreaterThan(0);
    expect(entrees[0]).toEqual({ ancre: 'partie-1', titre: 'Éditeur' });
  });
});

describe('TexteJuridique — ancres rendues (AC2, AC3)', () => {
  it('« 17. Suspension et fin du compte » porte l’id partie-17', () => {
    const { container } = render(<TexteJuridique source={cguFr} />);
    const titre = container.querySelector('#partie-17');
    expect(titre?.tagName).toBe('H2');
    expect(titre?.textContent).toContain('17. Suspension et fin du compte');
  });

  it('chaque entrée du sommaire vise un titre rendu, et chaque id est unique', () => {
    const { container } = render(<TexteJuridique source={cguFr} />);
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { ancre, titre } of sommaireJuridique(cguFr)) {
      const cible = container.querySelector(`#${ancre}`);
      expect(cible?.tagName).toBe('H2');
      expect(cible?.textContent).toContain(titre);
    }
  });

  it('les sous-parties ont leur propre ancre, sous celle de leur partie', () => {
    const { container } = render(<TexteJuridique source={cguFr} />);
    expect(container.querySelector('#partie-6-1')?.textContent).toContain('6.1 Engagements de l’annonceur');
    expect(container.querySelector('#partie-17-2')?.tagName).toBe('H3');
  });

  it('chaque titre de partie est suivi d’un lien vers lui-même — un vrai `<a href>`, qui marche sans JavaScript', () => {
    const { container } = render(<TexteJuridique source={cguFr} libelleAncre="Lien vers cette partie" />);
    const lien = container.querySelector('#partie-17 + a');
    expect(lien?.getAttribute('href')).toBe('#partie-17');
    expect(lien?.getAttribute('aria-label')).toBe('Lien vers cette partie');
  });

  it('le lien d’ancre reste HORS du titre : le titre se nomme de son seul texte (revue)', () => {
    const { container } = render(<TexteJuridique source={cguFr} libelleAncre="Lien vers cette partie" />);
    const titre = screen.getByRole('heading', { level: 2, name: '17. Suspension et fin du compte' });
    expect(titre.id).toBe('partie-17');
    expect(container.querySelector('#partie-17 a')).toBeNull();
  });
});
