import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { StrictMode } from 'react';

import { withIntl } from '@/test/intl';
import { WizardShell, type WizardStepDef } from '../wizard/WizardShell';

// ⚠ La fiche de tâche ne monte pas `WizardShell` sous `withIntl` — mais le composant appelle
// `useTranslations`, et `vitest.setup.ts` ne monte AUCUN `NextIntlClientProvider` (cf.
// `src/test/intl.tsx`). Sans lui, `useTranslations` lève `No intl context found` au premier
// rendu. On enveloppe donc chaque montage avec `withIntl`, comme le prescrit le `CLAUDE.md` du
// dossier — ce qui a l'avantage de faire porter les assertions sur les VRAIS libellés de
// `fr.json` plutôt que sur un mock muet.

function etapes(): WizardStepDef[] {
  return [
    { id: 'a', title: 'Le bien', subtitle: 'Deux réponses', body: <p>corps A</p> },
    { id: 'b', title: 'Où', subtitle: 'La première chose qu’on regarde', body: <p>corps B</p> },
    { id: 'c', title: 'Fin', subtitle: 'Presque fini', body: <p>corps C</p> },
  ];
}

function monter(patch: Partial<React.ComponentProps<typeof WizardShell>> = {}) {
  const onNavigate = vi.fn();
  const onFinish = vi.fn();
  render(
    withIntl(
      <WizardShell
        steps={etapes()}
        index={0}
        direction={1}
        onNavigate={onNavigate}
        onFinish={onFinish}
        finishLabel="Publier mon annonce"
        {...patch}
      />,
    ),
  );
  return { onNavigate, onFinish };
}

describe('WizardShell', () => {
  it('ne monte QUE l’étape courante', () => {
    monter();
    expect(screen.getByText('corps A')).toBeInTheDocument();
    expect(screen.queryByText('corps B')).not.toBeInTheDocument();
  });

  it('annonce la position dans le parcours', () => {
    monter({ index: 1 });
    expect(screen.getByText(/2.*3/)).toBeInTheDocument();
  });

  it('avance et recule en signalant le SENS — c’est lui qui choisit la transition', async () => {
    const user = userEvent.setup();
    const { onNavigate } = monter({ index: 1 });

    await user.click(screen.getByRole('button', { name: /continuer/i }));
    expect(onNavigate).toHaveBeenCalledWith(2, 1);

    await user.click(screen.getByRole('button', { name: /précédent|retour/i }));
    expect(onNavigate).toHaveBeenCalledWith(0, -1);
  });

  it('désactive le retour sur la première étape', () => {
    monter({ index: 0 });
    expect(screen.getByRole('button', { name: /précédent|retour/i })).toBeDisabled();
  });

  it('appelle onFinish, et non onNavigate, sur la dernière étape', async () => {
    const user = userEvent.setup();
    const { onFinish, onNavigate } = monter({ index: 2 });

    await user.click(screen.getByRole('button', { name: /publier mon annonce/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('bloque l’avance quand l’étape le demande', () => {
    const steps = etapes();
    steps[0] = { ...steps[0], canAdvance: false };
    monter({ steps, index: 0 });
    expect(screen.getByRole('button', { name: /continuer/i })).toBeDisabled();
  });

  it('AC9 — le pied est hors de la zone défilante', () => {
    monter();
    const defilante = document.querySelector('[data-wizard-scroll]');
    const pied = document.querySelector('[data-wizard-footer]');
    expect(defilante).not.toBeNull();
    expect(pied).not.toBeNull();
    expect(defilante!.contains(pied!)).toBe(false);
  });

  it('applique la classe de transition qui correspond au sens', () => {
    const { rerender } = render(
      withIntl(
        <WizardShell steps={etapes()} index={1} direction={1} onNavigate={vi.fn()}
          onFinish={vi.fn()} finishLabel="Publier" />,
      ),
    );
    expect(document.querySelector('.wizard-step-in-forward')).not.toBeNull();

    rerender(
      withIntl(
        <WizardShell steps={etapes()} index={0} direction={-1} onNavigate={vi.fn()}
          onFinish={vi.fn()} finishLabel="Publier" />,
      ),
    );
    expect(document.querySelector('.wizard-step-in-back')).not.toBeNull();
  });

  it('expose la progression aux technologies d’assistance', () => {
    monter({ index: 1 });
    const barre = screen.getByRole('progressbar');
    expect(barre).toHaveAttribute('aria-valuenow', '2');
    expect(barre).toHaveAttribute('aria-valuemax', '3');
  });

  it('déplace le focus sur le titre au changement d’étape, jamais au premier rendu', async () => {
    const { rerender } = render(
      withIntl(
        <WizardShell steps={etapes()} index={0} direction={1} onNavigate={vi.fn()}
          onFinish={vi.fn()} finishLabel="Publier" />,
      ),
    );
    // Montage initial : le focus reste où l'utilisateur est arrivé sur la page — il ne doit PAS
    // être arraché vers le titre de la première étape.
    expect(screen.getByRole('heading', { level: 2, name: 'Le bien' })).not.toHaveFocus();

    rerender(
      withIntl(
        <WizardShell steps={etapes()} index={1} direction={1} onNavigate={vi.fn()}
          onFinish={vi.fn()} finishLabel="Publier" />,
      ),
    );

    // Changement d'étape : le nouveau titre reçoit le focus (WCAG 2.4.3), sans entrer dans
    // l'ordre de tabulation (il est atteint par programme, pas par Tab).
    const titreSuivant = await screen.findByRole('heading', { level: 2, name: 'Où' });
    await waitFor(() => expect(titreSuivant).toHaveFocus());
    expect(titreSuivant).toHaveAttribute('tabindex', '-1');
  });

  it('ne vole pas le focus au premier montage sous le Strict Mode de React (TCK-464)', () => {
    // ⚠ `render()` seul ne monte PAS en Strict Mode : c'est pourquoi le test ci-dessus ne peut
    // pas attraper le défaut réel — un drapeau « premier passage » (`estMonte`) reste vrai après
    // la double invocation d'effet que React fait subir à CHAQUE montage en développement sous
    // `<StrictMode>`, et il volerait alors le focus dès le premier rendu réel. La comparaison
    // d'identité (`dernierId`) doit rester silencieuse ici.
    //
    // ⚠ `<StrictMode>` doit être la racine PASSÉE À `render()`, pas un enfant de `withIntl(...)` :
    // mesuré empiriquement, la double invocation des effets ne se déclenche QUE quand
    // `<StrictMode>` est l'élément racine du rendu — un simple `Context.Provider` (dont
    // `NextIntlClientProvider`, que `withIntl` pose) au-dessus la supprime silencieusement. D'où
    // l'imbrication inversée ci-dessous par rapport aux autres tests du fichier.
    render(
      <StrictMode>
        {withIntl(
          <WizardShell steps={etapes()} index={0} direction={1} onNavigate={vi.fn()}
            onFinish={vi.fn()} finishLabel="Publier" />,
        )}
      </StrictMode>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Le bien' })).not.toHaveFocus();
  });
});
