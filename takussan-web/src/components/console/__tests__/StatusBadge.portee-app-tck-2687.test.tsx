/**
 * TCK-2687 — LA PASTILLE DE STATUT SOUS LA PORTÉE `/app` : la table ENTIÈRE des couples rendus,
 * et leur contraste sur les sept surfaces réelles, dans les deux thèmes.
 *
 * Le couple RENDU sous la portée est l'utilitaire `portee-app:` quand il existe, l'utilitaire nu
 * sinon (la variante vient plus tard dans la feuille, à spécificité égale — `densite-de-l-app.test.ts`
 * le vérifie sur la feuille compilée pour la même variante). Comme dans
 * `StatusBadge.contraste-tck-450.test.tsx`, l'encre et l'aplat sont LUS sur le badge rendu, puis
 * composés et mesurés : aucun ratio n'est recopié ici.
 *
 * Relevé du 2026-11-11 (harnais `contraste-wcag.ts`, pire des sept surfaces) :
 *
 *   ton         couple sous la portée                 clair     sombre
 *   neutral     muted + encre douce                    7,88      8,40
 *   success     success/11 + success                   4,54      5,07   (/12 : 4,49 en clair ✗)
 *   attention   warning/20 + foreground               11,31      8,47
 *   danger      destructive/10 + destructive (inchangé) 4,93     4,55
 *   info        info/10 + info (inchangé)              5,35      4,90
 *   primary     secondary + primary-deep               6,72      5,09
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusBadge, type StatusTone } from '@/components/console';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versHex,
  versRvb,
  type Rvb,
} from '@/test/contraste-wcag';

/** La table ATTENDUE sous la portée, entière : un test de non-dérive, recopiée à dessein. */
const TONS_APP: Readonly<Record<StatusTone, readonly [string, string]>> = {
  neutral: ['bg-muted', 'text-encre-douce'],
  success: ['bg-success/11', 'text-success'],
  attention: ['bg-warning/20', 'text-foreground'],
  danger: ['bg-destructive/10', 'text-destructive'],
  info: ['bg-info/10', 'text-info'],
  primary: ['bg-secondary', 'text-primary-deep'],
};

const TONS = Object.keys(TONS_APP) as StatusTone[];

type Jetons = Readonly<Record<string, string>>;
const plein = (j: string) => (jetons: Jetons) => resoudreCouleur(j, jetons);
const sur = (j: string, alpha: number, sous: string) => (jetons: Jetons) =>
  versHex(composer(versRvb(resoudreCouleur(j, jetons)), versRvb(resoudreCouleur(sous, jetons)), alpha));

/** Les sept surfaces de `StatusBadge.contraste-tck-450.test.tsx` (chacune y porte son site). */
const SURFACES: readonly { nom: string; hex: (j: Jetons) => string }[] = [
  { nom: '--card', hex: plein('card') },
  { nom: '--background', hex: plein('background') },
  { nom: 'bg-muted/30 sur --background', hex: sur('muted', 0.3, 'background') },
  { nom: 'bg-muted/30 sur --card', hex: sur('muted', 0.3, 'card') },
  { nom: 'bg-muted/50 sur --card', hex: sur('muted', 0.5, 'card') },
  { nom: 'bg-muted plein', hex: plein('muted') },
  { nom: 'bg-primary/5 sur --card', hex: sur('primary', 0.05, 'card') },
];

/** Le couple que la portée `/app` rend : la variante `portee-app:` l'emporte sur l'utilitaire nu. */
function coupleSousLaPortee(tone: StatusTone): { aplat: string; encre: string } {
  render(<StatusBadge tone={tone} label="X" data-testid={`b-${tone}`} />);
  const classes = Array.from(screen.getByTestId(`b-${tone}`).classList);
  const lire = (prefixe: 'bg' | 'text') => {
    const u = classes
      .map((c) => ({ c, u: litUtilitaireDeCouleur(c, prefixe) }))
      .filter(({ u }) => u !== null && (u.variante === '' || u.variante === 'portee-app'));
    const app = u.filter(({ u }) => u!.variante === 'portee-app');
    const nus = u.filter(({ u }) => u!.variante === '');
    expect(app.length, `${tone} : au plus un ${prefixe} de portée`).toBeLessThanOrEqual(1);
    expect(nus, `${tone} : un seul ${prefixe} nu`).toHaveLength(1);
    return (app[0] ?? nus[0])!.c.replace(/^portee-app:/, '');
  };
  return { aplat: lire('bg'), encre: lire('text') };
}

describe('<StatusBadge> sous la portée `/app` (TCK-2687)', () => {
  it('AC1 — la table ENTIÈRE des couples rendus sous la portée est celle attendue', () => {
    const rendu = Object.fromEntries(
      TONS.map((t) => {
        const { aplat, encre } = coupleSousLaPortee(t);
        return [t, [aplat, encre]];
      }),
    );
    expect(rendu).toEqual(Object.fromEntries(TONS.map((t) => [t, [...TONS_APP[t]]])));
  });

  it('AC1 — la hauteur de 24 px (`h-6`) n’est posée que sous la portée', () => {
    render(<StatusBadge tone="neutral" label="X" data-testid="h" />);
    const classes = Array.from(screen.getByTestId('h').classList);
    expect(classes).toContain('portee-app:h-6');
    // Hors portée, la hauteur d'avant : `h-auto` (22 px), jamais `h-6` nu.
    expect(classes).toContain('h-auto');
    expect(classes).not.toContain('h-6');
  });

  it.each([
    { nom: 'clair', jetons: JETONS_CLAIR },
    { nom: 'sombre', jetons: JETONS_SOMBRE },
  ])('AC1 — chaque ton tient 4,5:1 sur les sept surfaces — thème $nom', ({ jetons }) => {
    const echecs: string[] = [];
    for (const tone of TONS) {
      const { aplat, encre } = coupleSousLaPortee(tone);
      const a = litUtilitaireDeCouleur(aplat, 'bg')!;
      const e = litUtilitaireDeCouleur(encre, 'text')!;
      for (const s of SURFACES) {
        const plaque: Rvb = composer(versRvb(resoudreCouleur(a.jeton, jetons)), versRvb(s.hex(jetons)), a.alpha);
        const texte: Rvb = composer(versRvb(resoudreCouleur(e.jeton, jetons)), plaque, e.alpha);
        const ratio = contraste(texte, plaque);
        if (ratio < SEUIL_AA_TEXTE) echecs.push(`${tone} : ${encre} sur ${aplat} posé sur ${s.nom} → ${fmt(ratio)}`);
      }
    }
    expect(echecs, echecs.join('\n')).toEqual([]);
  });

  it('AC1 — le ton `info` garde l’encre `--info`, jamais l’accent de marque', () => {
    const { aplat, encre } = coupleSousLaPortee('info');
    expect([aplat, encre]).toEqual(['bg-info/10', 'text-info']);
  });
});
