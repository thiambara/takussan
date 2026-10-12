import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Logo, SymboleTakussan } from '@/components/brand/Logo';

/**
 * TCK-583 · la marque « lever de toit ».
 *
 * ⚠ jsdom n'a pas de moteur CSS : « le nom est en capitales » ou « les rayons sont terracotta » n'y
 * sont pas éprouvables — ils le sont au navigateur (notes du ticket). Ce qui l'est ici, et qui porte
 * les contraintes du ticket : le nom LU reste « Takussan », le symbole est muet, ses couleurs passent
 * par les jetons, et l'icône du site — qu'aucune feuille de style n'atteint — porte exactement les
 * valeurs de ces jetons et le même tracé.
 */

const RACINE = process.cwd();
const lire = (relatif: string) => readFileSync(path.join(RACINE, relatif), 'utf8');

/** Les jetons de `:root` dans `globals.css` (le thème clair, celui de l'icône). */
function jetonsRacine(): Record<string, string> {
  const css = lire('src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const bloc = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  return Object.fromEntries([...bloc.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function icone(): Document {
  return new DOMParser().parseFromString(lire('src/app/icon.svg'), 'image/svg+xml');
}

describe('le logo', () => {
  it('se lit « Takussan » dans le lien qui le porte, et son symbole est muet', () => {
    render(
      <a href="#accueil">
        <Logo nom="Takussan" />
      </a>,
    );
    const lien = screen.getByRole('link', { name: 'Takussan' });
    const svg = lien.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    // Les capitales sont un rendu, et Chrome l'applique au NOM ACCESSIBLE (mesuré : « TAKUSSAN »).
    // jsdom ne le voit pas — d'où la règle éprouvée ici : aucun texte mis en capitales par la
    // feuille de style n'est exposé ; le nom lu vient d'un texte sans transformation.
    for (const el of lien.querySelectorAll('.uppercase')) expect(el.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(lien.querySelector('.sr-only')?.textContent).toBe('Takussan');
  });

  it('peint le symbole par les jetons, jamais par une couleur écrite', () => {
    const { container } = render(<SymboleTakussan />);
    const traits = [...container.querySelectorAll('svg > g, svg > path')];
    expect(traits.length).toBe(3);
    for (const trait of traits) {
      expect(trait.getAttribute('stroke')).toBeNull();
      expect(trait.getAttribute('class')).toMatch(/^stroke-(primary|foreground)$/);
    }
    expect(lire('src/components/brand/Logo.tsx')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  // TCK-621 — sur la barre d'encre, le toit, l'horizon et le nom passent au lin ; les rayons restent
  // terracotta. Le traitement de `icon.svg`, par les jetons.
  it('en ton clair, peint toit, horizon et nom à --background', () => {
    const { container } = render(<Logo nom="Takussan" ton="clair" />);
    const traits = [...container.querySelectorAll('svg > g, svg > path')].map((t) => t.getAttribute('class'));
    expect(traits).toEqual(['stroke-primary', 'stroke-background', 'stroke-background']);
    const nom = container.querySelector('[aria-hidden="true"].uppercase')!;
    expect(nom.classList).toContain('text-background');
    expect(nom.classList).not.toContain('text-foreground');
  });
});

describe('l’icône du site', () => {
  it('porte exactement les valeurs des jetons --foreground, --background et --primary', () => {
    const jetons = jetonsRacine();
    const doc = icone();
    const tuile = doc.querySelector('rect')!;
    const rayons = doc.querySelector('g')!;
    const traits = [...doc.querySelectorAll('svg svg > path')];

    expect(tuile.getAttribute('fill')).toBe(jetons['--foreground']);
    expect(rayons.getAttribute('stroke')).toBe(jetons['--primary']);
    expect(traits.length).toBe(2);
    for (const trait of traits) expect(trait.getAttribute('stroke')).toBe(jetons['--background']);

    // Aucune autre couleur n'y entre en douce.
    const couleurs = new Set(lire('src/app/icon.svg').match(/#[0-9a-f]{3,8}\b/gi)?.map((c) => c.toLowerCase()));
    expect([...couleurs].sort()).toEqual(
      [jetons['--foreground'], jetons['--background'], jetons['--primary']].map((c) => c.toLowerCase()).sort(),
    );
  });

  it('dessine le même symbole que la primitive, au centième près', () => {
    const { container } = render(<SymboleTakussan />);
    const traces = (racine: ParentNode) => [...racine.querySelectorAll('path')].map((p) => p.getAttribute('d'));
    const symbole = icone().querySelector('svg svg')!;
    expect(traces(symbole)).toEqual(traces(container));
    expect(symbole.getAttribute('viewBox')).toBe(container.querySelector('svg')!.getAttribute('viewBox'));
  });

  it('remplace le triangle de create-next-app : plus aucun favicon.ico par défaut', () => {
    // Relevé le 2026-09-28 : `src/app/favicon.ico` était celui du gabarit create-next-app (le
    // triangle Vercel, md5 c30c7d42…) — c'est lui que l'onglet montrait en production.
    const ico = path.join(RACINE, 'src/app/favicon.ico');
    if (!existsSync(ico)) return;
    const empreinte = createHash('md5').update(readFileSync(ico)).digest('hex');
    expect(empreinte).not.toBe('c30c7d42707a47a3f4591831641e50dc');
  });
});
