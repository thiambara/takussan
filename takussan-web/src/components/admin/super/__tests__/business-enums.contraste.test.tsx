import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EnumList } from '../business-enums';
import { withIntl } from '@/test/intl';
import {
  JETONS_CLAIR,
  SEUIL_AA_TEXTE,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '@/test/contraste-wcag';
import type { BusinessEnum } from '@/types/super-admin';

/**
 * TCK-1033 (piste P68.07) — le compte « N valeurs » de l'entrée sélectionnée de `/super-admin/enums`
 * portait `opacity-75` sur l'encre `primary-foreground` du bouton plein : 3,6:1 sur `--primary`,
 * sous le seuil AA de 4,5:1 (WCAG 2.2 §1.4.3). L'encre pleine rend 5,06:1.
 *
 * Jsdom n'a pas de moteur CSS : l'encre et le fond se lisent sur les classes du DOM rendu, et
 * l'opacité de l'élément et de ses ancêtres est composée sur le fond avant le calcul.
 */

const ENUMS: BusinessEnum[] = [
  { key: 'property_type', name: 'Types de biens', description: '', values: [] },
  { key: 'lease_type', name: 'Types de baux', description: '', values: [] },
];

function utilitaire(el: Element, prefixe: 'bg' | 'text'): { jeton: string; alpha: number } | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const u = Array.from(n.classList)
      .map((c) => litUtilitaireDeCouleur(c, prefixe))
      .find((x) => x !== null && x.variante === '' && x.jeton !== 'transparent');
    if (u) return u;
  }
  return null;
}

function opacite(el: Element): number {
  let alpha = 1;
  for (let n: Element | null = el; n; n = n.parentElement) {
    for (const c of Array.from(n.classList)) {
      const m = /^opacity-(\d{1,3})$/.exec(c);
      if (m) alpha *= Number(m[1]) / 100;
    }
  }
  return alpha;
}

describe('<EnumList> — contraste du compte de valeurs', () => {
  it('tient 4,5:1 sur le bouton plein de l’entrée sélectionnée', () => {
    render(withIntl(<EnumList enums={ENUMS} selectedKey="property_type" onSelect={vi.fn()} />));

    const compte = screen.getAllByText('0 valeur')[0];
    expect(compte.closest('button')?.textContent).toContain('Types de biens');

    const encre = utilitaire(compte, 'text');
    const fond = utilitaire(compte, 'bg');
    expect(encre?.jeton).toBe('primary-foreground');
    expect(fond?.jeton).toBe('primary');

    const hexFond = resoudreCouleur(fond!.jeton, JETONS_CLAIR);
    const encreRendue = composer(
      versRvb(resoudreCouleur(encre!.jeton, JETONS_CLAIR)),
      versRvb(hexFond),
      encre!.alpha * opacite(compte),
    );
    const ratio = contraste(encreRendue, hexFond);
    expect(ratio, `compte « N valeurs » à ${fmt(ratio)} sur --primary`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
  });
});
