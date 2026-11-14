/**
 * TCK-2819 — le pied de l'assistant SOUS `lg`, aux deux entrées (`/publish` et `/app/properties/new`) :
 * le `PiedAssistant` de la maquette `app-entree-publier` (a-0 à a-5, téléphone).
 *
 * - « Continuer » est un geste de 48 px, 16 px / 600, rond (AC4), large de 172 px à côté de
 *   « Précédent », de 136 px à côté de « Plus tard », et toute la ligne au départ ;
 * - sous 390 px, à côté de « Plus tard », il cède son minimum (a-4 finissait à 361 px sur 360, AC3) ;
 * - le départ n'a pas de « Précédent » au téléphone, et pas encore de résumé ;
 * - dès `lg`, rien de tout cela ne s'applique : chaque classe du téléphone porte `max-lg:` (ou une
 *   valeur que `lg:` remplace), et le cadre plein écran de `/app` garde ses gestes.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type React from 'react';

import { withIntl } from '@/test/intl';
import { WizardShell, type WizardStepDef } from '../wizard/WizardShell';

const ETAPES: WizardStepDef[] = [
  { id: 'a', title: 'Le bien', subtitle: 'Deux réponses', body: <p>corps A</p>, part: 0, accueil: true },
  { id: 'b', title: 'Où', subtitle: 'Le lieu', body: <p>corps B</p>, part: 0 },
  { id: 'c', title: 'Photos', subtitle: 'Facultatif', body: <p>corps C</p>, part: 1, skippable: true },
  { id: 'd', title: 'Fin', subtitle: 'Le titre', body: <p>corps D</p>, part: 1 },
];

function monter(index: number, patch: Partial<React.ComponentProps<typeof WizardShell>> = {}) {
  render(
    withIntl(
      <WizardShell
        steps={ETAPES}
        index={index}
        direction={1}
        onNavigate={vi.fn()}
        onFinish={vi.fn()}
        finishLabel="Publier l’annonce"
        parts={['Le bien', 'L’annonce']}
        apercu={<p>carte</p>}
        barreApercu={<p>résumé</p>}
        {...patch}
      />,
    ),
  );
  return { pied: document.querySelector('[data-wizard-footer]') as HTMLElement };
}

const bouton = (nom: RegExp) => screen.getByRole('button', { name: nom });
const GESTE_48 = ['max-lg:h-12', 'max-lg:rounded-full', 'max-lg:border-0', 'max-lg:text-action', 'max-lg:font-semibold'];

describe.each([
  ['/app/properties/new', false],
  ['/publish', true],
])('le pied du téléphone sur %s (TCK-2819)', (_route, cadreDEntree) => {
  it('« Continuer » : 48 px, 16 px / 600, 172 px de large à côté de « Précédent » (AC4)', () => {
    monter(1, { cadreDEntree });
    expect(bouton(/^continuer$/i)).toHaveClass(...GESTE_48, 'max-lg:px-6', 'min-w-[10.75rem]');
    expect(bouton(/^précédent$/i)).toHaveClass(...GESTE_48, 'max-lg:px-2');
    expect(bouton(/^précédent$/i)).not.toHaveClass('-ml-2.5');
  });

  it('à côté de « Plus tard », 136 px — qu’il cède sous 390 px, pour que la ligne tienne à 360 (AC3)', () => {
    monter(2, { cadreDEntree });
    expect(bouton(/^continuer$/i)).toHaveClass('min-w-[8.5rem]', 'max-[389px]:min-w-0', 'max-[389px]:px-5');
    expect(bouton(/^plus tard$/i)).toHaveClass(...GESTE_48, 'max-lg:px-2');
    // Et les écarts passent de 12 à 8 : à 360, « Continuer » finissait à 346 px, dans la marge de 16.
    expect(bouton(/^continuer$/i).parentElement).toHaveClass('gap-3', 'max-[389px]:gap-2');
    expect(bouton(/^précédent$/i).parentElement).toHaveClass('gap-3', 'max-[389px]:gap-2');
  });

  it('la dernière étape : « Publier l’annonce », au même gabarit', () => {
    monter(3, { cadreDEntree });
    expect(bouton(/^publier l’annonce$/i)).toHaveClass(...GESTE_48, 'min-w-[10.75rem]');
  });

  it('le départ : « Continuer » sur toute la ligne, ni « Précédent » ni résumé au téléphone', () => {
    monter(0, { cadreDEntree });
    expect(bouton(/^continuer$/i)).toHaveClass('max-lg:w-full');
    expect(bouton(/^continuer$/i).parentElement).toHaveClass('max-lg:w-full');
    const precedent = screen.queryByRole('button', { name: /^précédent$/i });
    if (precedent) expect(precedent).toHaveClass('max-lg:hidden');
    expect(screen.queryByText('résumé')).not.toBeInTheDocument();
  });

  it('le résumé revient dès la deuxième étape', () => {
    monter(1, { cadreDEntree });
    expect(screen.getByText('résumé').parentElement).toHaveClass('lg:hidden');
  });

  it('le pied : la carte et son ombre, `pt-2.5`, une ligne de gestes espacée de 12 et suivie de 4', () => {
    const { pied } = monter(1, { cadreDEntree });
    expect(pied).toHaveClass('bg-card', 'pt-2.5', 'lg:pt-0');
    expect(pied).toHaveClass('max-lg:shadow-barre-collante');
    expect(pied.className).not.toMatch(/(^|\s)(lg:)?shadow-/);
    const ligne = bouton(/^précédent$/i).parentElement!;
    expect(ligne).toHaveClass('gap-3', 'pb-1', 'lg:gap-2', 'lg:pb-0');
  });
});

describe('dès `lg`, /app/properties/new garde son pied (TCK-2819)', () => {
  it('fond translucide, gestes d’avant : « Précédent » éteint au départ', () => {
    const { pied } = monter(0);
    expect(pied).toHaveClass('lg:bg-background/95', 'lg:backdrop-blur');
    expect(bouton(/^précédent$/i)).toBeDisabled();
    expect(bouton(/^précédent$/i)).toHaveClass('lg:-ml-2.5');
  });
});
