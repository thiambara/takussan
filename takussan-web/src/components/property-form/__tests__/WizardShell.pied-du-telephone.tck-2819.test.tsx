/**
 * TCK-2819, puis TCK-2988 — le pied de l'assistant SOUS `lg`, aux deux entrées (`/publish` et `/app/properties/new`).
 *
 * TCK-2988 (maquette « L'écran économe », validée par le porteur le 2026-11-21) remplace le `PiedAssistant` de
 * TCK-2819 au téléphone : 117 px devenus 71.
 *
 * - la progression : trois segments de 3 px au ras du pied, sans bordure au-dessus ni libellés dessous ;
 * - « Précédent » : un rond de 48 px à flèche, cerné, dont le libellé reste lu (`max-lg:sr-only`) ;
 * - « Continuer » : 48 px, 16 px / 600, rond, et le reste de la ligne (« Plus tard » garde sa largeur) ;
 * - sous 390 px, à côté de « Plus tard », « Continuer » cède son retrait et les écarts passent à 8 (a-4 à 360) ;
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
])('le pied du téléphone sur %s (TCK-2988)', (_route, cadreDEntree) => {
  it('« Continuer » : 48 px, 16 px / 600, et le reste de la ligne ; dès `lg`, 176 px au moins', () => {
    monter(1, { cadreDEntree });
    expect(bouton(/^continuer$/i)).toHaveClass(...GESTE_48, 'max-lg:px-6', 'max-lg:flex-1', 'max-lg:min-w-0');
    // 176 px : `lg:min-w-44`, ou `lg:min-w-[11rem]` du cadre d'entrée, que `twMerge` garde à sa place.
    expect(bouton(/^continuer$/i).className).toMatch(/(^|\s)lg:min-w-(44|\[11rem\])(\s|$)/);
    expect(bouton(/^continuer$/i).parentElement).toHaveClass('max-lg:flex-1');
  });

  it('« Précédent » : un rond de 48 px à flèche, cerné, dont le libellé reste lu', () => {
    monter(1, { cadreDEntree });
    const precedent = bouton(/^précédent$/i);
    expect(precedent).toHaveClass('max-lg:size-12', 'max-lg:rounded-full', 'max-lg:border-input', 'max-lg:p-0');
    expect(precedent.querySelector('svg')).toHaveClass('lg:hidden');
    expect(screen.getByText('Précédent')).toHaveClass('max-lg:sr-only');
    expect(precedent).not.toHaveClass('-ml-2.5');
  });

  it('à côté de « Plus tard » : « Continuer » cède son retrait sous 390 px, les écarts passent à 8 (a-4 à 360)', () => {
    monter(2, { cadreDEntree });
    expect(bouton(/^continuer$/i)).toHaveClass('max-lg:flex-1', 'max-[389px]:px-5');
    expect(bouton(/^plus tard$/i)).toHaveClass(...GESTE_48, 'max-lg:px-2');
    expect(bouton(/^continuer$/i).parentElement).toHaveClass('gap-3', 'max-[389px]:gap-2');
    expect(bouton(/^précédent$/i).parentElement).toHaveClass('gap-3', 'max-[389px]:gap-2');
  });

  it('la dernière étape : « Publier l’annonce », au même gabarit', () => {
    monter(3, { cadreDEntree });
    expect(bouton(/^publier l’annonce$/i)).toHaveClass(...GESTE_48, 'max-lg:flex-1');
  });

  it('le départ : « Continuer » sur toute la ligne, ni « Précédent » ni résumé au téléphone', () => {
    monter(0, { cadreDEntree });
    expect(bouton(/^continuer$/i)).toHaveClass('max-lg:flex-1');
    const precedent = screen.queryByRole('button', { name: /^précédent$/i });
    if (precedent) expect(precedent).toHaveClass('max-lg:hidden');
    expect(screen.queryByText('résumé')).not.toBeInTheDocument();
  });

  it('le résumé revient dès la deuxième étape', () => {
    monter(1, { cadreDEntree });
    expect(screen.getByText('résumé').parentElement).toHaveClass('lg:hidden');
  });

  it('le pied : la carte et son ombre, sans bordure ni retrait du haut, 10 px ou la zone de sécurité en bas', () => {
    const { pied } = monter(1, { cadreDEntree });
    expect(pied).toHaveClass('bg-card', 'max-lg:shadow-barre-collante', 'lg:border-t');
    expect(pied).toHaveClass('pb-[max(calc(var(--spacing)*2.5),env(safe-area-inset-bottom))]');
    expect(pied.className).not.toMatch(/(^|\s)(border-t|pt-[\d.]+)(\s|$)/);
    expect(pied.className).not.toMatch(/(^|\s)(lg:)?shadow-/);
    const ligne = bouton(/^précédent$/i).parentElement!;
    expect(ligne).toHaveClass('gap-3', 'pt-2.5', 'lg:gap-2', 'lg:pt-3');
  });

  it('la progression : des segments de 3 px bord à bord, sans libellés des parties au téléphone', () => {
    const { pied } = monter(1, { cadreDEntree });
    const barre = screen.getByRole('progressbar');
    expect(barre).toHaveClass('gap-0.5', 'lg:gap-1.5');
    expect(barre.className).not.toMatch(/(^|\s)px-/);
    expect(barre.firstElementChild).toHaveClass('h-[calc(var(--spacing)*0.75)]', 'lg:h-1', 'lg:rounded-full');
    const libelles = pied.querySelector('[aria-hidden="true"].grid, [aria-hidden="true"].lg\\:grid') as HTMLElement;
    expect(libelles).toHaveClass('hidden', 'lg:grid');
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
