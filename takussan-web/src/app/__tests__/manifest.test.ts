// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '../manifest';

/** TCK-598 (V18, AC14) — le manifeste, et des icônes qui existent à la taille annoncée. */
describe('/manifest.webmanifest', () => {
  const m = manifest();

  it('déclare une application autonome aux couleurs de la charte, ouverte à la racine', () => {
    expect(m.name).toContain('Takussan');
    expect(m.short_name).toBe('Takussan');
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.background_color).toBe('#fcf9f3');
    expect(m.theme_color).toBe('#a85332');
  });

  it('porte 192, 512 et une maskable, et chaque fichier est un PNG de la taille annoncée', () => {
    const icones = m.icons ?? [];
    expect(icones.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);

    for (const icone of icones) {
      const fichier = readFileSync(path.join(process.cwd(), 'public', icone.src));
      // En-tête PNG, puis largeur et hauteur du bloc IHDR (octets 16 à 23, gros-boutiste).
      expect(fichier.subarray(1, 4).toString()).toBe('PNG');
      const [l, h] = [fichier.readUInt32BE(16), fichier.readUInt32BE(20)];
      expect(`${l}x${h}`).toBe(icone.sizes);
    }
  });

  it('les cinq SVG du gabarit create-next-app ont quitté public/', () => {
    for (const nom of ['file', 'globe', 'next', 'vercel', 'window']) {
      expect(() => readFileSync(path.join(process.cwd(), 'public', `${nom}.svg`))).toThrow();
    }
  });
});
