/**
 * ADR-0133 (TCK-2988) — le mode saisie de l'assistant, au téléphone (maquette « L'écran économe ») :
 *
 * - en saisie, le pied (segments, rond ←, « Continuer » de 48 px) cède la place à une barre de 52 px :
 *   ↑ ↓, « Le bien · 2/4 », « Continuer » ; hors saisie, elle n'est pas rendue, et dès `lg` elle ne paraît pas ;
 * - ↑ ↓ passent d'un champ éditable à l'autre sans prendre le focus (`pointerdown` empêché) ;
 * - le bandeau se replie, une cale permet d'amener en tête même le dernier champ ;
 * - hors du cadre d'entrée (`/app/properties/new`), l'assistant se cale lui-même sur la fenêtre visible.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';

import { withIntl } from '@/test/intl';

// La mesure elle-même a ses tests (`src/lib/__tests__/fenetre.tck-2988.test.tsx`) : ici, on la règle.
const fenetre = vi.hoisted(() => ({ saisie: true }));
vi.mock('@/lib/fenetre', async (original) => ({
  ...(await original<typeof import('@/lib/fenetre')>()),
  useFenetre: () => ({ saisie: fenetre.saisie, clavier: 0, cache: 0, vueH: 664, vueTop: 0 }),
}));

import { WizardShell, type WizardStepDef } from '../wizard/WizardShell';

const ETAPES: WizardStepDef[] = [
  { id: 'a', title: 'Le bien', subtitle: 'Deux réponses', body: <p>corps A</p>, part: 0 },
  {
    id: 'b',
    title: 'Où',
    subtitle: 'Le lieu',
    part: 0,
    body: (
      <div>
        <input aria-label="ville" />
        <button type="button">un bouton</button>
        <input aria-label="lecture" readOnly />
        <input aria-label="quartier" />
        <textarea aria-label="description" />
      </div>
    ),
  },
  { id: 'c', title: 'Photos', subtitle: 'Facultatif', body: <p>corps C</p>, part: 1 },
  { id: 'd', title: 'Fin', subtitle: 'Le titre', body: <p>corps D</p>, part: 1 },
];

// jsdom ne met rien en page : chaque élément « se voit ».
const getClientRects = HTMLElement.prototype.getClientRects;
beforeEach(() => {
  fenetre.saisie = true;
  HTMLElement.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList;
  };
});
afterEach(() => {
  HTMLElement.prototype.getClientRects = getClientRects;
});

function monter(patch: Partial<React.ComponentProps<typeof WizardShell>> = {}) {
  const onNavigate = vi.fn();
  render(
    withIntl(
      <WizardShell
        steps={ETAPES}
        index={1}
        direction={1}
        onNavigate={onNavigate}
        onFinish={vi.fn()}
        finishLabel="Publier l’annonce"
        parts={['Le bien', 'L’annonce']}
        bandeau={<p>une note</p>}
        {...patch}
      />,
    ),
  );
  return { onNavigate, barre: document.querySelector('[data-barre-de-saisie]') as HTMLElement };
}

const champ = (nom: string) => screen.getByLabelText(nom);

describe('ADR-0133 — la barre de saisie', () => {
  it('n’existe qu’en saisie, au téléphone ; le pied, lui, s’efface en saisie', () => {
    const { barre } = monter();
    expect(barre).toHaveClass('hidden', 'max-lg:saisie:flex', 'h-13');
    expect(document.querySelector('[data-wizard-footer]')).toHaveClass('max-lg:saisie:hidden');
  });

  it('hors saisie, elle n’est pas rendue : un seul « Continuer » dans la page', () => {
    fenetre.saisie = false;
    const { barre } = monter();
    expect(barre).toBeNull();
    expect(screen.getAllByRole('button', { name: /^continuer$/i })).toHaveLength(1);
  });

  it('dit la partie et le rang, et « Continuer » avance', () => {
    const { barre, onNavigate } = monter();
    expect(barre).toHaveTextContent('Le bien · 2/4');
    fireEvent.click(barre.querySelector('button[data-slot="button"]')!);
    expect(onNavigate).toHaveBeenCalledWith(2, 1);
  });

  it('↑ ↓ passent d’un champ éditable à l’autre (ni bouton, ni lecture seule), sans prendre le focus', () => {
    const { barre } = monter();
    const [haut, bas] = barre.querySelectorAll('button');
    expect(haut).toHaveAccessibleName('Champ précédent');
    expect(bas).toHaveAccessibleName('Champ suivant');
    expect(fireEvent.pointerDown(bas!)).toBe(false); // `preventDefault` : le focus reste dans le champ.

    champ('ville').focus();
    fireEvent.click(bas!);
    expect(champ('quartier')).toHaveFocus();
    fireEvent.click(bas!);
    expect(champ('description')).toHaveFocus();
    fireEvent.click(haut!);
    expect(champ('quartier')).toHaveFocus();
    // Au-delà du dernier, le clavier se ferme.
    champ('description').focus();
    fireEvent.click(bas!);
    expect(document.body).toHaveFocus();
  });
});

describe('ADR-0133 — ce qui se replie, ce qui se cale', () => {
  it('le bandeau se replie ; une cale de la hauteur visible suit le corps, en saisie seulement', () => {
    monter();
    expect(screen.getByText('une note').parentElement).toHaveClass('max-lg:saisie:hidden');
    const cale = document.querySelector('[data-cale-de-saisie]');
    expect(cale?.parentElement).toHaveAttribute('data-wizard-scroll');
    expect(cale).toHaveClass('hidden', 'max-lg:saisie:block', 'h-[var(--vue-h,100dvh)]');
  });

  it('hors du cadre d’entrée, l’assistant se cale sur la fenêtre visible ; dans le cadre, c’est la coque', () => {
    monter();
    const racine = document.querySelector('[data-barre-de-saisie]')!.closest('.flex.h-full')!;
    expect(racine).toHaveClass('max-lg:saisie:fixed', 'max-lg:saisie:top-[var(--vue-top,0px)]', 'max-lg:saisie:h-[var(--vue-h,100dvh)]');
  });

  it('dans le cadre d’entrée, l’assistant ne se cale pas lui-même', () => {
    monter({ cadreDEntree: true });
    const racine = document.querySelector('[data-barre-de-saisie]')!.closest('.flex.h-full')!;
    expect(racine).not.toHaveClass('max-lg:saisie:fixed');
  });
});
