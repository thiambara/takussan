import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { withIntl } from '@/test/intl';
import { AvertissementNumeroNonVerifie } from '../AvertissementNumeroNonVerifie';

/**
 * Correction du lot C, tour 2 (décision de la session sur D10) — une annonce en ligne dont le
 * contact n'a plus de numéro vérifié reste en ligne, mais ce numéro n'est plus servi au public.
 * « Mes biens » le dit à l'annonceur, avec le chemin vers la vérification.
 */
describe('<AvertissementNumeroNonVerifie> — TCK-633', () => {
  it('numéro non vérifié et annonces en ligne : l’avertissement et le lien vers la vérification', () => {
    render(withIntl(<AvertissementNumeroNonVerifie phoneVerifiedAt={null} annoncesEnLigne={2} />));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Votre numéro n’est pas vérifié : il n’est pas affiché sur vos annonces.',
    );
    expect(screen.getByRole('link', { name: 'Vérifier mon numéro' })).toHaveAttribute('href', '/app/profile#coordonnees');
  });

  it('numéro vérifié : rien', () => {
    const { container } = render(
      withIntl(<AvertissementNumeroNonVerifie phoneVerifiedAt="2026-10-01T00:00:00Z" annoncesEnLigne={2} />),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('aucune annonce en ligne : rien à dire', () => {
    const { container } = render(withIntl(<AvertissementNumeroNonVerifie phoneVerifiedAt={null} annoncesEnLigne={0} />));
    expect(container).toBeEmptyDOMElement();
  });
});
