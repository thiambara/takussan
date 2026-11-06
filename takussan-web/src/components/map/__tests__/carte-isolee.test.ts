import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Une carte reste DANS son cadre — elle ne passe jamais au-dessus de l'en-tête, d'une lightbox,
 * d'un menu ou d'une modale.
 *
 * Leaflet pose ses calques à z-index 200 à 700 (`.leaflet-pane`) et ses contrôles à 800-1000
 * (`.leaflet-top`, `.leaflet-bottom`), mais `.leaflet-container` n'ouvre AUCUN contexte
 * d'empilement : ces index se comparaient donc à ceux de la page, où l'en-tête collant et la
 * lightbox valent `z-50`. Mesuré sur preview (2026-10-05) : la carte de la fiche d'un bien passait
 * au-dessus de l'en-tête au défilement, et au-dessus de la galerie plein écran.
 *
 * Le correctif est global (`globals.css`) et non par composant : trois composants montent une carte
 * (`PropertyMap`, `LocationPickerMap`, `PropertyLocationMapInner`), et le prochain l'aurait oublié.
 */

const RACINE = process.cwd();

function regle(css: string, selecteur: string): string | null {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[},\\s])${echappe}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
}

describe('carte Leaflet isolée', () => {
  it('globals.css ouvre un contexte d’empilement sur .leaflet-container', () => {
    const css = fs.readFileSync(path.join(RACINE, 'src/app/globals.css'), 'utf8');
    const corps = regle(css, '.leaflet-container');
    expect(corps, 'aucune règle `.leaflet-container` dans globals.css').not.toBeNull();
    expect(corps).toMatch(/isolation\s*:\s*isolate/);
  });

  it('leaflet.css ne l’isole pas lui-même — la règle du dépôt est nécessaire', () => {
    const leaflet = fs.readFileSync(path.join(RACINE, 'node_modules/leaflet/dist/leaflet.css'), 'utf8');
    expect(leaflet).not.toMatch(/isolation\s*:\s*isolate/);
  });
});

/**
 * TCK-2485 — ce que la carte pose AU-DESSUS d'elle reste enfermé avec elle.
 *
 * `.leaflet-container` isole les calques de Leaflet, mais pas ses frères : le compte de la carte de
 * `PropertyMap` (`[data-compte-carte]`, `absolute … z-[400]`) est posé À CÔTÉ du conteneur Leaflet,
 * dans une enveloppe `relative` qui n'ouvrait aucun contexte d'empilement. Son 400 se comparait donc
 * à la page : tant que la messagerie flottante ouverte valait `z-[1000]`, rien ne se voyait ; au z
 * des dialogues (50), la pastille passait sur le panneau (relevé à 1366 × 657 sur `/fr/properties`,
 * vue carte : 130,3 × 25,2 px de recouvrement). L'enveloppe l'isole.
 */
describe('la carte des biens enferme sa pastille', () => {
  it('l’enveloppe de PropertyMap ouvre un contexte d’empilement (`isolate`) autour de la pastille `z-[400]`', () => {
    const src = fs.readFileSync(path.join(RACINE, 'src/components/map/PropertyMap.tsx'), 'utf8');
    expect(src, 'la pastille du compte n’est plus en `z-[400]` : relire ce test').toMatch(/data-compte-carte[\s\S]{0,200}z-\[400\]/);
    // L'enveloppe racine du composant (le premier `return (` du composant `PropertyMap`) : `relative isolate`.
    const corps = src.slice(src.indexOf('export function PropertyMap'));
    const enveloppe = /return \(\s*(?:\/\/[^\n]*\n\s*)*<div\s+className=\{cn\(\s*'([^']*)'/.exec(corps);
    expect(enveloppe, 'enveloppe racine de PropertyMap introuvable : relire ce test').not.toBeNull();
    expect(enveloppe![1].split(/\s+/)).toContain('isolate');
  });
});
