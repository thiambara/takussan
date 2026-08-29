import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { compile } from 'tailwindcss';
import fs from 'node:fs/promises';
import path from 'node:path';

import { withIntl } from '@/test/intl';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  FIELD_DENSITY_HEIGHT,
  FIELD_DENSITY_HEIGHT_SIZED,
  fieldDensityScope,
} from '@/components/ui/field-density';

/**
 * TCK-468 — la variante de densité : ce que les primitives PORTENT, et ce que la feuille de
 * style en FAIT.
 *
 * ⚠ Les deux moitiés sont nécessaires et aucune ne remplace l'autre. jsdom ne calcule aucune
 * mise en page et ne charge aucun CSS : un test de rendu ne peut qu'affirmer la présence d'une
 * classe. Il ne dirait RIEN d'une classe qui ne l'emporterait pas sur la hauteur de base — et
 * c'est précisément là que la mécanique est fragile, la variante `in-*` ne gagnant que par
 * l'ordre source. La seconde moitié compile donc réellement le CSS avec le Tailwind du dépôt.
 */

// ── Ce que les primitives portent ───────────────────────────────────────────

describe('les primitives de champ portent la variante de densité', () => {
  it('Input', () => {
    render(<Input aria-label="titre" />);
    const champ = screen.getByLabelText('titre');
    // Les DEUX régimes, pas leur égalité : la hauteur de base reste 32 px pour le parc,
    // et 44 px n'arrive que sous une portée.
    expect(champ.className).toContain('h-8');
    expect(champ.className).toContain(FIELD_DENSITY_HEIGHT);
  });

  it('SelectTrigger — sous sa forme EMPILÉE, la seule qui batte `data-[size=default]:h-8`', () => {
    render(
      <Select>
        <SelectTrigger aria-label="devise">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    const declencheur = screen.getByLabelText('devise');
    expect(declencheur.className).toContain('data-[size=default]:h-8');
    expect(declencheur.className).toContain(FIELD_DENSITY_HEIGHT_SIZED);
  });

  it('DatePicker', () => {
    render(withIntl(<DatePicker value="" onValueChange={() => {}} data-testid="dp" />));
    const bouton = screen.getByTestId('dp');
    expect(bouton.className).toContain('h-8');
    expect(bouton.className).toContain(FIELD_DENSITY_HEIGHT);
  });

  it('hors portée, rien ne bouge : aucun ancêtre ne déclare l’attribut', () => {
    const { container } = render(<Input aria-label="titre" />);
    expect(container.querySelector('[data-field-density]')).toBeNull();
  });

  it('`fieldDensityScope()` rend l’attribut que la variante attend', () => {
    expect(fieldDensityScope()).toEqual({ 'data-field-density': 'comfortable' });
  });
});

// ── AC2 : `FormDatePicker` accepte la même personnalisation que les autres champs ──

describe('AC2 — `className` de DatePicker atteint la CIBLE CLIQUABLE', () => {
  it('le bouton reçoit `className`, l’enveloppe reçoit `containerClassName`', () => {
    const { container } = render(
      withIntl(
        <DatePicker
          value=""
          onValueChange={() => {}}
          data-testid="dp"
          className="marque-bouton"
          containerClassName="marque-enveloppe"
        />,
      ),
    );
    const bouton = screen.getByTestId('dp');
    expect(bouton.className).toContain('marque-bouton');

    const enveloppe = container.querySelector('.marque-enveloppe');
    expect(enveloppe).not.toBeNull();
    // La distinction est le fond du défaut : avant TCK-468, `className` finissait ICI, et le
    // bouton restait inatteignable. Un test qui se contenterait de « la classe est quelque part
    // dans l'arbre » recocherait l'AC sur le code cassé.
    expect(enveloppe!.contains(bouton)).toBe(true);
    expect(enveloppe!.className).not.toContain('marque-bouton');
  });

  it('`buttonClassName` garde la main sur `className` — les 7 sites antérieurs ne bougent pas', () => {
    render(
      withIntl(
        <DatePicker
          value=""
          onValueChange={() => {}}
          data-testid="dp"
          className="h-20"
          buttonClassName="h-9"
        />,
      ),
    );
    // `cn()` = twMerge : le dernier des deux conflits l'emporte.
    expect(screen.getByTestId('dp').className).toContain('h-9');
    expect(screen.getByTestId('dp').className).not.toContain('h-20');
  });
});

// ── Ce que la feuille de style en fait ──────────────────────────────────────

/** Compile le Tailwind DU DÉPÔT sur une liste de candidats. Mesuré : ~20 ms. */
async function feuille(candidats: readonly string[]): Promise<string> {
  const compilateur = await compile('@import "tailwindcss";', {
    base: process.cwd(),
    loadStylesheet: async () => {
      const p = path.join(process.cwd(), 'node_modules/tailwindcss/index.css');
      return { path: p, base: path.dirname(p), content: await fs.readFile(p, 'utf8') };
    },
  });
  return compilateur.build([...candidats]);
}

describe('la variante l’emporte réellement sur la hauteur de base', () => {
  it('44 px sous portée, 32 px sans — et la règle de densité vient APRÈS', async () => {
    const css = await feuille(['h-8', FIELD_DENSITY_HEIGHT]);

    const base = css.indexOf('.h-8 {');
    const densite = css.indexOf('.in-data-\\[field-density\\=comfortable\\]\\:h-11');
    expect(base).toBeGreaterThan(-1);

    // L'ancêtre passe par `:where()` — spécificité NULLE. Les deux règles sont donc à égalité
    // (0,1,0) et seul l'ORDRE SOURCE tranche : si Tailwind émettait un jour les variantes avant
    // les utilitaires nus, ou remplaçait `:where()` par une forme qui pèse, la densité
    // cesserait de s'appliquer SANS QUE RIEN NE ROUGISSE ailleurs. D'où ce test.
    expect(css).toContain(':where(*[data-field-density="comfortable"])');
    expect(densite).toBeGreaterThan(base);

    // Et les hauteurs elles-mêmes, en clair : 8 × 0.25rem = 2rem = 32 px ; 11 × 0.25rem = 44 px.
    expect(css).toMatch(/--spacing:\s*0\.25rem/);
    expect(css.slice(base, base + 120)).toMatch(/height:\s*calc\(var\(--spacing\)\s*\*\s*8\)/);
    expect(css.slice(densite, densite + 260)).toMatch(
      /height:\s*calc\(var\(--spacing\)\s*\*\s*11\)/,
    );
  });

  it('la forme EMPILÉE du Select retrouve la spécificité de sa hauteur de base', async () => {
    const css = await feuille(['data-[size=default]:h-8', FIELD_DENSITY_HEIGHT_SIZED]);

    const base = css.indexOf('.data-\\[size\\=default\\]\\:h-8');
    const densite = css.indexOf('.in-data-\\[field-density\\=comfortable\\]\\:data-\\[size\\=default\\]\\:h-11');
    expect(base).toBeGreaterThan(-1);
    expect(densite).toBeGreaterThan(base);
    // Le sélecteur d'attribut est bien REPRIS dans la règle de densité : sans lui, (0,1,0) contre
    // (0,2,0), et le Select serait le seul champ à rester à 32 px sous la portée.
    expect(css.slice(densite, densite + 300)).toContain('&[data-size="default"]');
  });
});
