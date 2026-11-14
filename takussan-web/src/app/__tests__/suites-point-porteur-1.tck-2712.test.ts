import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-2712 — les suites du point porteur n° 1, côté feuille : le toast au-dessus de la pastille
 * « Filtres / Liste » du site public (3), la barre d'action de 69 px (4), le dock relevé par la
 * barre (5), le texte des boutons du pouce au pointeur grossier dès `lg` (7).
 *
 * jsdom n'évalue ni `:has()` ni les requêtes média : c'est la RÈGLE écrite qui est gardée ici ; les
 * valeurs rendues sont mesurées au navigateur (notes du ticket, AC1 à AC4).
 */
const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');

/** Le corps de la première règle `selecteur { … }` trouvée APRÈS `depuis`. */
function corpsApres(depuis: number, selecteur: string): string {
  const i = css.indexOf(`${selecteur} {`, depuis);
  expect(i, `règle « ${selecteur} » absente`).toBeGreaterThan(-1);
  return css.slice(i + selecteur.length + 2, css.indexOf('}', i)).trim();
}

describe('TCK-2712 (3) — le toast se pose au-dessus de la pastille du site public', () => {
  const PASTILLE = '[data-outils-flottants-de-liste]';
  // La base du dock (où se pose la pastille, qui est au sol du dock), + la pastille (h-12), + 16 px.
  // Sans `+ var(--barre-d-action-hauteur)` : la base du dock la porte déjà (5) — l'ajouter ici la
  // compterait deux fois.
  const FORMULE = '--toast-bas: calc(var(--floating-dock-base) + var(--spacing) * 12 + var(--spacing) * 4);';

  it('carte plein écran (sans barre publique) : `:root:has(pastille)` sous lg', () => {
    const m = css.match(/@media \(width < 64rem\) \{[^@]*?(:root:has\(\[data-outils-flottants-de-liste\]\)) \{([^}]*)\}/);
    expect(m, 'règle de la pastille absente du bloc `width < 64rem`').not.toBeNull();
    expect(m![2]!.trim()).toBe(FORMULE);
  });

  it('liste (barre publique rendue) : une règle AU MOINS aussi spécifique que celle de la barre, et après elle', () => {
    const barre = ':root:has([data-barre-onglets-publique]):not(:has(.takussan-carte-plein-ecran))';
    const iBarre = css.indexOf(`${barre} {\n    --toast-bas`);
    expect(iBarre).toBeGreaterThan(-1);
    const selecteur = `${barre}:has(${PASTILLE})`;
    const iPastille = css.indexOf(`${selecteur} {`);
    expect(iPastille, 'règle « liste » de la pastille absente').toBeGreaterThan(iBarre);
    expect(corpsApres(iPastille, selecteur)).toBe(FORMULE);
  });

  it('la pastille seule déclenche la règle : son marqueur est rendu par le composant (voir OutilsFlottantsDeListe.test)', () => {
    // Le marqueur n'apparaît qu'aux deux règles ci-dessus : aucune autre surface ne relève le toast.
    expect([...css.matchAll(/:has\(\[data-outils-flottants-de-liste\]\)/g)]).toHaveLength(2);
  });
});

describe('TCK-2712 (4) — la barre d’action compte des boutons de 44 px : 69 px (la « Page de détail » gelée)', () => {
  it('`--barre-d-action-hauteur` = filet + py-3 + `--spacing-controle` (44 au pouce), zone sûre en plus au bas de l’écran', () => {
    expect(css).toMatch(
      /:root:has\(#emplacement-barre-d-action > \[data-slot="barre-d-action"\]\) \{\s*--barre-d-action-hauteur: calc\(var\(--spacing-controle\) \+ var\(--spacing\) \* 6 \+ 1px\);/,
    );
    expect(css).toMatch(
      /:root:has\(#emplacement-barre-d-action\[data-bas-de-l-ecran\] > \[data-slot="barre-d-action"\]\) \{\s*--barre-d-action-hauteur: calc\(var\(--spacing-controle\) \+ var\(--spacing\) \* 6 \+ 1px \+ env\(safe-area-inset-bottom\)\);/,
    );
    // Le DÉFAUT ne compte jamais des boutons de 48. TCK-2587 (complément du team-lead) : seule une barre
    // `taille="action"` (la fiche d'une visite) les compte — chaque règle qui lit `--spacing-controle-action`
    // vise donc `[data-taille="action"]`.
    const regles = [...css.matchAll(/([^{}]+)\{\s*--barre-d-action-hauteur: calc\(var\(--spacing-controle-action\)/g)].map((m) => m[1]!.trim());
    expect(regles.length).toBeGreaterThan(0);
    for (const selecteur of regles) expect(selecteur).toContain('[data-taille="action"]');
  });
});

describe('TCK-2712 (5) — le dock flottant monte de la hauteur de la barre d’action, comme le toast', () => {
  it('la base de `:root` (16 px, 24 dès sm) porte le terme additif de la barre (0 sans elle)', () => {
    expect(css).toMatch(/--floating-dock-base: calc\(16px \+ var\(--barre-d-action-hauteur\)\);/);
    expect(css).toMatch(
      /@media \(min-width: 640px\) \{\s*:root \{\s*--floating-dock-base: calc\(24px \+ var\(--barre-d-action-hauteur\)\);/,
    );
    expect(css).not.toMatch(/--floating-dock-base: 16px;/);
    expect(css).not.toMatch(/--floating-dock-base: 24px;/);
  });

  it('dans la coque à barre d’onglets : 16 px + la barre d’onglets + la barre d’action', () => {
    const m = css.match(/@media \(width < 48rem\) \{\s*\[data-barre-onglets\] \{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]!.trim()).toBe(
      '--floating-dock-base: calc(16px + var(--barre-onglets-hauteur) + var(--barre-d-action-hauteur));',
    );
  });
});

describe('TCK-2712 (7) — le texte d’un bouton suit le régime de densité, comme sa hauteur', () => {
  const debut = css.indexOf('/* densite-de-l-app:début');
  const fin = css.indexOf('/* densite-de-l-app:fin */');
  const bloc = css.slice(debut, fin);

  it('par défaut `text-sm` (rien ne bouge hors de /app) ; 14 px fixes au pouce ; `text-sm` au bureau', () => {
    const theme = bloc.match(/@theme \{([\s\S]*?)\n\}/)![1]!;
    expect(theme).toMatch(/--text-bouton: var\(--text-sm\);/);
    expect(theme).toMatch(/--text-bouton--line-height: var\(--text-sm--line-height\);/);
    const pouce = bloc.slice(bloc.indexOf(':root:has([data-portee-app]) {'));
    expect(pouce.slice(0, pouce.indexOf('}'))).toMatch(/--text-bouton: 0\.875rem;/);
    const bureau = bloc.match(/@media \(width >= 48rem\) and \(not \(pointer: coarse\)\) \{\s*:root:has\(\[data-portee-app\]\) \{([^}]*)\}/)![1]!;
    expect(bureau).toMatch(/--text-bouton: var\(--text-sm\);/);
  });

  it('`Button` lit le jeton (default, lg), et la classe de l’appelant le remplace', () => {
    const classes = buttonVariants().split(/\s+/);
    expect(classes).toContain('text-bouton');
    expect(classes).not.toContain('text-sm');
    expect(buttonVariants({ size: 'lg' }).split(/\s+/)).toContain('text-bouton');
    // `sm` et `xl` ont déjà leur jeton (13 et 15 px fixes sous la portée) : ils le gardent. `Button`
    // passe par `cn` (`cva` ne fusionne pas) : c'est là que leur taille remplace `text-bouton`.
    expect(cn(buttonVariants({ size: 'sm' })).split(/\s+/)).toContain('text-petit-bouton');
    expect(cn(buttonVariants({ size: 'sm' })).split(/\s+/)).not.toContain('text-bouton');
    expect(cn(buttonVariants({ size: 'xl' })).split(/\s+/)).toContain('text-corps');
    expect(cn(buttonVariants({ size: 'xl' })).split(/\s+/)).not.toContain('text-bouton');
    expect(cn(buttonVariants(), 'text-xs').split(/\s+/)).toEqual(expect.arrayContaining(['text-xs']));
    expect(cn(buttonVariants(), 'text-xs').split(/\s+/)).not.toContain('text-bouton');
    // Une couleur d'appelant n'efface pas la taille (tailwind-merge connaît le jeton).
    expect(cn(buttonVariants(), 'text-destructive').split(/\s+/)).toContain('text-bouton');
    // Les tailles que des appelants posent par-dessus (`EcranDuCompte`, `RadarClaimReception`,
    // `verify-email`) : l'ordre d'émission ne départage plus rien, `cn` retire le jeton.
    for (const taille of ['text-base', 'text-[0.9375rem]', 'text-lg']) {
      const classes = cn(buttonVariants({ size: 'lg' }), taille).split(/\s+/);
      expect(classes).toContain(taille);
      expect(classes).not.toContain('text-bouton');
    }
  });
});
