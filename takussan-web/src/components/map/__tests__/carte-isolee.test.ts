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
