/**
 * ADR-0134 § 3 (TCK-2990) — l'en-tête et la barre d'onglets du téléphone s'effacent au défilement du document.
 *
 * Le crochet décide l'ÉTAT (publié sur `<html>`, `data-barres-effacees`) ; le mouvement est en CSS, que jsdom
 * n'applique pas : on en garde les RÈGLES écrites, comme `CoqueHauteur.test.tsx`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELAI_DE_DEPART_MS, FIN_DE_DEFILEMENT_MS, useEffacementDesBarres } from '../useEffacementDesBarres';

const racine = document.documentElement;
let y = 0;

function defiler(vers: number) {
  y = vers;
  window.dispatchEvent(new Event('scroll'));
}

/** Défile par pas de 10 px, comme un pouce : un seul grand saut ne dit rien de l'hystérésis. */
function glisser(de: number) {
  const pas = Math.sign(de) * 10;
  for (let fait = 0; Math.abs(fait) < Math.abs(de); fait += pas) act(() => defiler(y + pas));
}

const releve: { effacees: boolean; rappeler: () => void } = { effacees: false, rappeler: () => {} };
function Sonde({ actif = true, cle = '/app/payments' }: { readonly actif?: boolean; readonly cle?: string }) {
  const etat = useEffacementDesBarres(actif, cle);
  useEffect(() => {
    releve.effacees = etat.effacees;
    releve.rappeler = etat.rappeler;
  });
  return (
    <>
      <header data-slot="en-tete-mobile">
        <button type="button">Rechercher</button>
      </header>
      <nav data-slot="barre-onglets">
        <a href="#accueil">Accueil</a>
      </nav>
      <div id="emplacement-barre-d-action" />
    </>
  );
}

const effacees = () => racine.hasAttribute('data-barres-effacees');

beforeEach(() => {
  vi.useFakeTimers();
  y = 400;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  Object.defineProperty(racine, 'scrollHeight', { configurable: true, get: () => 4000 });
});
afterEach(() => {
  vi.useRealTimers();
  delete racine.dataset.barresEffacees;
});

describe('ADR-0134 § 3 — quand les barres s’effacent', () => {
  it('40 px vers le bas les effacent ; 24 px vers le haut les rappellent — pas moins', () => {
    render(<Sonde />);
    glisser(40);
    expect(effacees()).toBe(false);
    glisser(10);
    expect(effacees()).toBe(true);
    expect(releve.effacees).toBe(true);

    glisser(-20);
    expect(effacees()).toBe(true);
    glisser(-10);
    expect(effacees()).toBe(false);
  });

  it('jamais en haut de page, ni en bas', () => {
    render(<Sonde />);
    glisser(60);
    expect(effacees()).toBe(true);
    act(() => defiler(5));
    expect(effacees()).toBe(false);

    act(() => defiler(4000 - 844 - 200));
    glisser(60);
    expect(effacees()).toBe(true);
    act(() => defiler(4000 - 844));
    expect(effacees()).toBe(false);
  });

  it('rappelées, elles repartent seules 2,5 s après le dernier défilement', () => {
    render(<Sonde />);
    glisser(60);
    // Le geste fini, la pastille touchée.
    act(() => void vi.advanceTimersByTime(FIN_DE_DEFILEMENT_MS));
    act(() => releve.rappeler());
    expect(effacees()).toBe(false);
    act(() => void vi.advanceTimersByTime(DELAI_DE_DEPART_MS - 1));
    expect(effacees()).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(effacees()).toBe(true);

    // Rappelées par un défilement vers le haut : le compte part de la fin du geste.
    glisser(-30);
    expect(effacees()).toBe(false);
    act(() => void vi.advanceTimersByTime(FIN_DE_DEFILEMENT_MS + DELAI_DE_DEPART_MS));
    expect(effacees()).toBe(true);
  });

  it('un doigt posé sur une barre la retient ; relâché, le compte repart', () => {
    const { container } = render(<Sonde />);
    act(() => releve.rappeler());
    const barre = container.querySelector('[data-slot="barre-onglets"] a')!;
    act(() => void barre.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    act(() => void vi.advanceTimersByTime(DELAI_DE_DEPART_MS * 2));
    expect(effacees()).toBe(false);
    act(() => void window.dispatchEvent(new Event('pointerup')));
    act(() => void vi.advanceTimersByTime(DELAI_DE_DEPART_MS));
    expect(effacees()).toBe(true);
  });

  it('le focus qui entre dans une barre effacée la rend', () => {
    const { container } = render(<Sonde />);
    glisser(60);
    expect(effacees()).toBe(true);
    act(() => (container.querySelector('[data-slot="en-tete-mobile"] button') as HTMLElement).focus());
    expect(effacees()).toBe(false);
  });

  it('sous une barre d’action, rien ne s’efface', () => {
    const { container } = render(<Sonde />);
    container.querySelector('#emplacement-barre-d-action')!.append(document.createElement('div'));
    glisser(80);
    expect(effacees()).toBe(false);
  });

  it('inactives (bureau, tiroir ouvert), rien ne s’efface ; une navigation les rend', () => {
    const { rerender } = render(<Sonde actif={false} />);
    glisser(80);
    expect(effacees()).toBe(false);

    rerender(<Sonde />);
    glisser(60);
    expect(effacees()).toBe(true);
    rerender(<Sonde cle="/app/leases" />);
    expect(effacees()).toBe(false);
  });

  it('démonté, `<html>` ne garde rien', () => {
    const { unmount } = render(<Sonde />);
    glisser(60);
    unmount();
    expect(effacees()).toBe(false);
  });
});

describe('ADR-0134 § 3 — le mouvement, écrit dans `globals.css`', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app', 'globals.css'), 'utf8').replace(/\s+/g, ' ');
  const EFFACEES = 'html[data-barres-effacees]:not(:has(#emplacement-barre-d-action > *))';

  it('d’un seul bloc, 340 ms : l’en-tête monte, la barre descend ; le départ et le retour ont chacun leur courbe', () => {
    expect(css).toContain(
      '[data-defilement="document"] > [data-slot="en-tete-mobile"], [data-defilement="document"] [data-slot="barre-onglets"] { transform: translateY(0); transition: transform 340ms var(--courbe-des-barres-retour); }',
    );
    expect(css).toContain(
      `${EFFACEES} [data-defilement="document"] > [data-slot="en-tete-mobile"] { transform: translateY(-100%); transition: transform 340ms var(--courbe-des-barres-depart); }`,
    );
    expect(css).toContain(
      `${EFFACEES} [data-defilement="document"] [data-slot="barre-onglets"] { transform: translateY(100%); transition: transform 340ms var(--courbe-des-barres-depart); }`,
    );
    expect(css).toContain('--courbe-des-barres-retour: cubic-bezier(0.32, 0.72, 0, 1);');
    expect(css).toContain('--courbe-des-barres-depart: cubic-bezier(0.4, 0, 0.2, 1);');
  });

  it('ce qui colle en haut d’une page suit l’en-tête : `--haut-colle` passe à 0', () => {
    expect(css).toContain(`${EFFACEES} { --haut-colle: 0px; }`);
  });

  it('clavier ouvert, la barre d’onglets et la pastille s’en vont', () => {
    expect(css).toContain('html[data-saisie="ouvert"] [data-defilement="document"] [data-slot="barre-onglets"] { transform: translateY(100%);');
    expect(css).toContain('html[data-saisie="ouvert"] .pastille-des-barres { opacity: 0; pointer-events: none; }');
  });

  it('mouvement réduit : un fondu, aucun déplacement', () => {
    const i = css.indexOf('@media (width < 48rem) and (prefers-reduced-motion: reduce)');
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, i + 900)).toMatch(/transform: none; opacity: 0; visibility: hidden;/);
  });
});
