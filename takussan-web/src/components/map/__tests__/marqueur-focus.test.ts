import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TCK-754 (P07.10) — le marqueur de prix au focus clavier porte un contour blanc de 2 px décalé.
 * Il reprenait le style du survol, à 1,22:1 de l'état normal, avec `outline: none`.
 *
 * Jsdom n'a pas de moteur CSS : le test lit `globals.css`.
 */
const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Les déclarations de toute règle dont un sélecteur vise exactement `selecteur`. */
function declarations(selecteur: string): string {
  const regles = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return regles
    .filter(([, sel]) => sel.split(',').map((s) => s.trim()).includes(selecteur))
    .map(([, , corps]) => corps)
    .join(';');
}

describe('marqueur de prix au focus (TCK-754)', () => {
  it('déclare un contour blanc de 2 px, décalé de 2 px', () => {
    const focus = declarations('.takussan-price-marker__pill:focus-visible');
    const derniere = (prop: string) => [...focus.matchAll(new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'g'))].at(-1)?.[1].trim();
    expect(derniere('outline')).toBe('2px solid #ffffff');
    expect(derniere('outline-offset')).toBe('2px');
  });
});
