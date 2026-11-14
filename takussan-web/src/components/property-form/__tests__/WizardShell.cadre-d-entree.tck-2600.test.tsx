/**
 * TCK-2600 (fidélité) — le cadre d'entrée de `WizardShell` : le `GabaritBureau` de la maquette
 * `app-entree-publier` (a-0 à a-5), dès `lg`, pour `/publish` seulement.
 *
 * - SANS `cadreDEntree` (`/app/properties/new`), le DOM et les classes sont ceux d'avant : le panneau
 *   et l'étape enfants directs de la zone défilante, l'aperçu en colonne latérale hors de cette zone,
 *   le pied sans grille ni note, les gestes et le titre sans classe du cadre ;
 * - AVEC, la question et l'aperçu partagent une grille 560 / 400 centrée sur 1 112, l'aperçu reste en
 *   vue DANS la zone défilante, le pied suit la même grille et porte la note sous l'aperçu ;
 * - l'étape d'accueil n'a pas de surtitre, et son titre est celui de a-0 (36 px, 1,08).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type React from 'react';

import { withIntl } from '@/test/intl';
import { WizardShell, type WizardStepDef } from '../wizard/WizardShell';

function etapes(accueil = false): WizardStepDef[] {
  return [
    { id: 'a', title: 'Le bien', subtitle: 'Deux réponses', body: <p>corps A</p>, part: 0, accueil },
    { id: 'b', title: 'Où', subtitle: 'La première chose qu’on regarde', body: <p>corps B</p>, part: 0 },
    { id: 'c', title: 'Fin', subtitle: 'Presque fini', body: <p>corps C</p>, part: 1, skippable: true },
  ];
}

function monter(patch: Partial<React.ComponentProps<typeof WizardShell>> = {}) {
  render(
    withIntl(
      <WizardShell
        steps={etapes()}
        index={1}
        direction={1}
        onNavigate={vi.fn()}
        onFinish={vi.fn()}
        finishLabel="Publier"
        parts={['Le bien', 'L’annonce']}
        apercu={<p>carte</p>}
        refDuPanneau={{ current: null }}
        {...patch}
      />,
    ),
  );
  return {
    defilante: document.querySelector('[data-wizard-scroll]') as HTMLElement,
    panneau: document.querySelector('[data-wizard-panneau]') as HTMLElement,
    pied: document.querySelector('[data-wizard-footer]') as HTMLElement,
    titre: screen.getByRole('heading', { level: 1 }),
  };
}

const bouton = (nom: RegExp) => screen.getByRole('button', { name: nom });

describe('WizardShell sans cadre d’entrée — /app/properties/new inchangé (TCK-2600)', () => {
  it('le panneau et l’étape sont enfants directs de la zone défilante, l’aperçu à côté d’elle', () => {
    const { defilante, panneau, titre } = monter();

    expect(panneau.parentElement).toBe(defilante);
    expect(panneau).not.toHaveAttribute('data-cadre-d-entree');
    // La colonne du panneau de compte (TCK-2601) : portée par le nœud, comme le faisait sa section.
    expect(panneau).toHaveClass('hidden', 'mx-auto', 'max-w-3xl', 'px-4', 'pt-6', 'pb-10', 'lg:pt-9', 'xl:px-14');
    expect(titre.closest('[data-wizard-scroll] > div')).toBe(panneau.nextElementSibling);
    expect(panneau.nextElementSibling).toHaveClass('mx-auto', 'max-w-3xl', 'px-4', 'pt-6', 'pb-10', 'lg:pt-9', 'xl:px-14');
    expect(panneau.nextElementSibling).not.toHaveClass('lg:max-w-none');

    const apercu = screen.getByRole('complementary', { name: /aperçu de l’annonce/i });
    expect(defilante.contains(apercu)).toBe(false);
    expect(apercu).toHaveClass('w-88', 'border-l', 'xl:w-100');
    expect(document.querySelector('[class*="grid-cols-[minmax(0,35rem)_25rem]"]')).toBeNull();
  });

  it('le titre, le surtitre, le pied et ses gestes n’ont aucune classe du cadre', () => {
    const { pied, titre } = monter({ steps: etapes(true), index: 0 });

    // Le drapeau `accueil` n'a d'effet que dans le cadre : le surtitre reste.
    expect(screen.getByText('Partie 1 sur 2 · Le bien')).not.toHaveClass('lg:text-xs');
    expect(titre.className).not.toMatch(/lg:text-|lg:font-semibold|lg:leading-/);
    expect(pied).not.toHaveClass('lg:bg-card');
    expect(pied.firstElementChild).toHaveAttribute('role', 'progressbar');
    expect(bouton(/^précédent$/i)).toBeDisabled();
    expect(bouton(/^continuer$/i).parentElement).not.toHaveClass('lg:gap-0');
    expect(bouton(/^précédent$/i).className).not.toMatch(/lg:h-11|lg:-ml-5|lg:rounded-full/);
    expect(bouton(/^continuer$/i).className).not.toMatch(/lg:h-11|lg:min-w-\[11rem\]/);
  });
});

describe('WizardShell dans le cadre d’entrée — le GabaritBureau de la maquette (TCK-2600)', () => {
  it('la question et l’aperçu partagent la grille 560 / 400 ; l’aperçu reste en vue dans la zone défilante', () => {
    const { defilante, panneau, titre } = monter({ cadreDEntree: true });

    const grille = defilante.firstElementChild as HTMLElement;
    // Témoin du sélecteur dont l'absence est vérifiée hors du cadre (ci-dessus, et sur /app).
    expect(document.querySelector('[class*="grid-cols-[minmax(0,35rem)_25rem]"]')).toBe(grille);
    expect(grille).toHaveClass('lg:grid', 'lg:max-w-[69.5rem]', 'lg:grid-cols-[minmax(0,35rem)_25rem]', 'lg:justify-between', 'lg:px-8', 'lg:pt-10', 'lg:pb-12');
    const colonne = grille.firstElementChild as HTMLElement;
    expect(colonne).toHaveClass('min-w-0');
    expect(panneau.parentElement).toBe(colonne);
    expect(panneau).toHaveAttribute('data-cadre-d-entree', '');
    expect(panneau).not.toHaveClass('px-4');
    expect(colonne.contains(titre)).toBe(true);
    expect(panneau.nextElementSibling).toHaveClass('lg:mx-0', 'lg:max-w-none', 'lg:p-0', 'xl:px-0');

    const apercu = screen.getByRole('complementary', { name: /aperçu de l’annonce/i });
    expect(apercu.parentElement).toBe(grille);
    expect(apercu).toHaveTextContent('carte');
    expect(apercu.firstElementChild).toHaveClass('sticky');
    // Une seule colonne d'aperçu : la latérale de `/app` n'est pas rendue en plus.
    expect(screen.getAllByRole('complementary', { name: /aperçu de l’annonce/i })).toHaveLength(1);
  });

  it('le titre (32 px, 600, 1,1) et le sous-titre (15 px, serré) de a-1 à a-5 ; le surtitre en 12 px', () => {
    const { titre } = monter({ cadreDEntree: true });

    expect(titre).toHaveClass('lg:text-affiche-32', 'lg:leading-[1.1]', 'lg:font-semibold', 'lg:tracking-titre');
    expect(screen.getByText('La première chose qu’on regarde')).toHaveClass('lg:mt-1.5', 'lg:text-corps', 'lg:leading-snug');
    expect(screen.getByText('Partie 1 sur 2 · Le bien')).toHaveClass('lg:text-xs');
  });

  it('a-0, l’accueil : pas de surtitre, titre de 32 px (36 px de la maquette rabattus sur le jeton) à 1,08, sous-titre de 17 px', () => {
    const { titre } = monter({ cadreDEntree: true, steps: etapes(true), index: 0 });

    expect(screen.queryByText('Partie 1 sur 2 · Le bien')).not.toBeInTheDocument();
    expect(titre).toHaveClass('lg:text-affiche-32', 'lg:leading-[1.08]');
    expect(screen.getByText('Deux réponses')).toHaveClass('lg:mt-3', 'lg:text-titre-court');
  });

  it('le pied suit la même grille : progression et gestes sous la question, la note sous l’aperçu', () => {
    const { pied } = monter({ cadreDEntree: true, noteDuPied: 'La ville suffit pour continuer.' });

    expect(pied).toHaveClass('lg:bg-card');
    const grille = pied.firstElementChild as HTMLElement;
    expect(grille).toHaveClass('lg:grid', 'lg:grid-cols-[minmax(0,35rem)_25rem]', 'lg:items-center', 'lg:pt-3');
    expect((grille.firstElementChild as HTMLElement).contains(screen.getByRole('progressbar'))).toBe(true);
    const note = grille.lastElementChild as HTMLElement;
    expect(note).toHaveTextContent('La ville suffit pour continuer.');
    expect(note).toHaveClass('hidden', 'lg:block', 'text-ui');

    // Les gestes des écrans d'entrée : 44 px, 15 px, 600, ronds ; « Précédent » fantôme décalé de 20.
    // Le `BoutonE` de la maquette : écart de 8, interligne 1,5, sans filet. Son fantôme à 80 % reste en
    // encre pleine (TCK-658 : une encre de texte ne s'atténue pas par l'opacité).
    expect(bouton(/^précédent$/i)).toHaveClass('lg:h-11', 'lg:rounded-full', 'lg:text-corps', 'lg:leading-normal', 'lg:-ml-5');
    expect(bouton(/^précédent$/i).className).not.toMatch(/text-foreground\/\d/);
    expect(bouton(/^continuer$/i)).toHaveClass('lg:h-11', 'lg:gap-2', 'lg:border-0', 'lg:rounded-full', 'lg:text-corps', 'lg:min-w-[11rem]');
  });

  it('un « Plus tard » porte les mêmes gestes', () => {
    monter({ cadreDEntree: true, index: 2, steps: [...etapes(), { id: 'd', title: 'Après', subtitle: '…', body: null, part: 1 }] });
    expect(bouton(/plus tard/i)).toHaveClass('lg:h-11', 'lg:rounded-full');
    // Maquette a-4 : « Plus tard » touche « Continuer ».
    expect(bouton(/plus tard/i).parentElement).toHaveClass('lg:gap-0');
  });

  it('a-0 : le départ n’a pas de « Précédent » ; hors du cadre, il reste, éteint', () => {
    monter({ cadreDEntree: true, index: 0 });
    expect(screen.queryByRole('button', { name: /^précédent$/i })).not.toBeInTheDocument();
    expect(bouton(/^continuer$/i)).toBeEnabled();
  });
});
