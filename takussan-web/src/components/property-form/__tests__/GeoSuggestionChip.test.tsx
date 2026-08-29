import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { GeoSuggestionChip } from '../wizard/GeoSuggestionChip';

/**
 * TCK-464 — la suggestion se PROPOSE, et le cas de la région absente.
 *
 * `useGeoSuggestion` rend `region: ''` quand la géo-IP connaît la ville mais pas la région. Un
 * rendu littéral « {city}, {region} » produirait alors « Dakar, » — une virgule orpheline dans
 * le nom accessible d'un bouton. Le composant choisit donc entre deux messages ; il ne concatène
 * jamais.
 */
describe('GeoSuggestionChip', () => {
  it('propose la ville ET la région quand les deux sont connues', () => {
    render(
      withIntl(
        <GeoSuggestionChip city="Saly" region="Thiès" onAccept={vi.fn()} hidden={false} />,
      ),
    );

    const bouton = screen.getByRole('button');
    expect(bouton).toHaveTextContent('Saly');
    expect(bouton).toHaveTextContent('Thiès');
  });

  it('ne laisse AUCUNE virgule orpheline quand la région est vide', () => {
    render(
      withIntl(<GeoSuggestionChip city="Dakar" region="" onAccept={vi.fn()} hidden={false} />),
    );

    const bouton = screen.getByRole('button');
    expect(bouton).toHaveTextContent('Dakar');
    expect(bouton.textContent ?? '').not.toMatch(/,/);
  });

  it('ne rend rien une fois la suggestion acceptée', () => {
    render(
      withIntl(<GeoSuggestionChip city="Dakar" region="Dakar" onAccept={vi.fn()} hidden />),
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('remonte l’acceptation au clic', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(
      withIntl(<GeoSuggestionChip city="Dakar" region="" onAccept={onAccept} hidden={false} />),
    );

    await user.click(screen.getByRole('button'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
