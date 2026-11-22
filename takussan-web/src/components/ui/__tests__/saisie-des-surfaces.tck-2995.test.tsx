/**
 * ADR-0133, amendement du 2026-11-22 (TCK-2995, TCK-2996, TCK-2997) — les surfaces superposées en saisie.
 *
 * Le clavier ouvert, seul un téléphone le juge (ADR-0133, « Conséquences ») ; ici, ce qui le commande :
 * - une surface ouverte s'abonne à LA mesure (`<html>` porte `--vue-h`), et s'en désabonne fermée ;
 * - ses classes `saisie:` la calent sur la fenêtre visible, et rien d'autre ne change hors saisie ;
 * - le champ focalisé est ramené en vue quand la saisie s'ouvre ;
 * - la conversation ouverte au téléphone se cale par `globals.css`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { withIntl } from '@/test/intl';

const racine = document.documentElement;
const avantVue = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const avantMedia = window.matchMedia;
const avantVers = HTMLElement.prototype.scrollIntoView;

function pointeurGrossier() {
  window.matchMedia = ((requete: string) => ({
    matches: requete.includes('coarse'),
    media: requete,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: Object.assign(new EventTarget(), { height: 844, offsetTop: 0 }),
  });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
});
afterEach(() => {
  if (avantVue) Object.defineProperty(window, 'visualViewport', avantVue);
  else delete (window as { visualViewport?: unknown }).visualViewport;
  window.matchMedia = avantMedia;
  HTMLElement.prototype.scrollIntoView = avantVers;
});

function Feuille({ ouverte }: { readonly ouverte: boolean }) {
  return withIntl(
    <FeuilleDuBas open={ouverte} titre="Demander au fil" pied={<button type="button">Envoyer</button>}>
      <input aria-label="Question" placeholder="Ex. : quand visiter ?" />
    </FeuilleDuBas>,
  );
}

describe('TCK-2995 — la feuille du bas suit le clavier', () => {
  it('ouverte, elle s’abonne à la mesure ; fermée, `<html>` est rendu propre', () => {
    const { rerender } = render(<Feuille ouverte />);
    expect(racine.style.getPropertyValue('--vue-h')).toBe('844px');
    rerender(<Feuille ouverte={false} />);
    expect(racine.style.getPropertyValue('--vue-h')).toBe('');
  });

  it('en saisie, sous `md` : posée sur le clavier, bornée par la fenêtre visible, sans zone sûre au pied', () => {
    render(<Feuille ouverte />);
    const feuille = document.querySelector('[data-slot="feuille-du-bas"]') as HTMLElement;
    expect(feuille).toHaveClass(
      'max-md:saisie:bottom-[var(--clavier,0px)]',
      'max-md:saisie:max-h-[min(90dvh,calc(var(--vue-h,90dvh)-var(--spacing)*2))]',
    );
    // Hors saisie, la géométrie d'avant : 90 % de la hauteur, collée en bas.
    expect(feuille).toHaveClass('bottom-0', 'max-h-[90dvh]');
    expect(document.querySelector('[data-slot="feuille-du-bas-pied"]')).toHaveClass('max-md:saisie:pb-3');
  });

  it('le champ focalisé est ramené en vue quand la saisie s’ouvre', () => {
    pointeurGrossier();
    const vers = vi.fn();
    HTMLElement.prototype.scrollIntoView = vers;
    render(<Feuille ouverte />);
    act(() => screen.getByLabelText('Question').focus());
    expect(racine.dataset.saisie).toBe('ouvert');
    expect(vers).toHaveBeenCalledWith({ block: 'nearest' });
  });
});

describe('TCK-2995 — le panneau plein écran (sous `xl`) se cale sur la fenêtre visible', () => {
  function Panneau() {
    return withIntl(
      <PanneauDroit open titre="Nouveau client" sousTitre="1 sur 2 · qui" formulaire pied={<button type="button">Continuer</button>}>
        <input aria-label="Prénom" placeholder="Ex. : Awa" />
      </PanneauDroit>,
    );
  }

  it('s’abonne à la mesure, et porte les classes du cadre en saisie', () => {
    render(<Panneau />);
    expect(racine.style.getPropertyValue('--vue-h')).toBe('844px');
    const panneau = document.querySelector('[data-slot="panneau-droit"]') as HTMLElement;
    expect(panneau).toHaveClass(
      'max-xl:saisie:top-[var(--vue-top,0px)]',
      'max-xl:saisie:bottom-auto',
      'max-xl:saisie:h-[var(--vue-h,100dvh)]',
    );
    expect(panneau).toHaveClass('inset-y-0');
  });

  it('l’en-tête du formulaire passe à 44 px sans sa ligne d’étape ; le pied garde son action', () => {
    render(<Panneau />);
    expect(document.querySelector('[data-slot="panneau-droit-en-tete"]')).toHaveClass('h-14', 'saisie:h-11');
    expect(screen.getByText('1 sur 2 · qui')).toHaveClass('saisie:hidden');
    const pied = document.querySelector('[data-slot="panneau-droit-pied"]') as HTMLElement;
    expect(pied).toHaveClass('saisie:pb-3');
    expect(pied).not.toHaveClass('saisie:hidden');
  });
});

describe('TCK-2996 — la conversation ouverte au téléphone (`globals.css`)', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\s+/g, ' ');

  it('en saisie, le cadre se cale sur la fenêtre visible', () => {
    expect(css).toContain(
      'html[data-saisie="ouvert"] [data-cadre-de-conversation] { position: fixed; inset-inline: 0; top: var(--vue-top, 0px); height: var(--vue-h, 100dvh); min-height: 0; margin: 0; z-index: 30; }',
    );
  });

  it('l’en-tête du fil passe à 44 px ; les puces du pont et le bandeau de l’objet se replient', () => {
    expect(css).toContain('html[data-saisie="ouvert"] [data-cadre-de-conversation] [data-slot="en-tete-du-fil"] { height: 2.75rem; }');
    expect(css).toContain(
      'html[data-saisie="ouvert"] [data-cadre-de-conversation] :is([data-testid="puces-du-pont"], [data-slot="bandeau-de-la-salle"]) { display: none; }',
    );
  });

  it('les règles vivent sous `md` seulement', () => {
    const debut = css.indexOf('[data-cadre-de-conversation] {');
    const media = css.lastIndexOf('@media', debut);
    expect(css.slice(media, media + 30)).toContain('@media (width < 48rem)');
  });
});
