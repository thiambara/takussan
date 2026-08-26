import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataState } from '@/components/console';
import { EmptyState } from '@/components/feedback';

const VIDE = <EmptyState title="Aucun résultat" />;

describe('<DataState>', () => {
  it('rend des SQUELETTES pendant le chargement, jamais un spinner', () => {
    const { container } = render(
      <DataState loading skeletonRows={4}>
        <p>contenu</p>
      </DataState>,
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4);
    expect(screen.queryByText('contenu')).toBeNull();
  });

  /**
   * L'ordre des états est la seule décision de ce composant, et elle se teste par ses deux
   * conséquences : une erreur périmée ne doit pas survivre à un refetch, et « aucun résultat »
   * ne doit pas s'annoncer avant qu'on ait demandé.
   */
  it("montre le squelette — pas l'erreur — quand une requête en erreur se relance", () => {
    render(
      <DataState loading error="Le serveur a échoué.">
        <p>contenu</p>
      </DataState>,
    );

    expect(screen.queryByText('Le serveur a échoué.')).toBeNull();
  });

  it("n'annonce pas l'état vide pendant le chargement", () => {
    render(
      <DataState loading isEmpty emptyState={VIDE}>
        <p>contenu</p>
      </DataState>,
    );

    expect(screen.queryByText('Aucun résultat')).toBeNull();
  });

  it("rend l'erreur avant l'état vide", () => {
    render(
      <DataState loading={false} error="Le serveur a échoué." isEmpty emptyState={VIDE}>
        <p>contenu</p>
      </DataState>,
    );

    expect(screen.getByText('Le serveur a échoué.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat')).toBeNull();
  });

  it("compose ErrorState — son role='alert' est posé une seule fois", () => {
    render(
      <DataState loading={false} error="Le serveur a échoué.">
        <p>contenu</p>
      </DataState>,
    );

    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('rend le bouton de reprise quand onRetry ET retryLabel sont fournis', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <DataState loading={false} error="Échec." onRetry={onRetry} retryLabel="Réessayer">
        <p>contenu</p>
      </DataState>,
    );

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("rend l'état vide quand la réponse a réussi et ne contient rien", () => {
    render(
      <DataState loading={false} isEmpty emptyState={VIDE}>
        <p>contenu</p>
      </DataState>,
    );

    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
    expect(screen.queryByText('contenu')).toBeNull();
  });

  it('rend ses enfants dès que les trois états sont écartés', () => {
    render(
      <DataState loading={false}>
        <p>contenu</p>
      </DataState>,
    );

    expect(screen.getByText('contenu')).toBeInTheDocument();
  });

  it("rend ses enfants quand isEmpty est vrai mais qu'aucun état vide n'est fourni", () => {
    // Le cas des tables qui rendent leur propre état vide DANS le tbody : `DataState` ne doit pas
    // les court-circuiter, sinon les en-têtes disparaissent.
    render(
      <DataState loading={false} isEmpty>
        <p>contenu</p>
      </DataState>,
    );

    expect(screen.getByText('contenu')).toBeInTheDocument();
  });
});
