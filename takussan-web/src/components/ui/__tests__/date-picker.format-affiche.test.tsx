import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import { DatePicker } from '../date-picker';

/**
 * TCK-2668 — `formatAffiche` ne change que le jour AFFICHÉ (« mar. 10 nov. » dans « Couvrir une
 * absence », maquette `app-equipe` a-2) ; sans lui, l'affichage d'avant reste, et la valeur
 * échangée est toujours `YYYY-MM-DD`.
 */
describe('DatePicker — formatAffiche', () => {
  it('affiche le jour au motif donné', () => {
    render(withIntl(<DatePicker id="du" value="2026-11-10" onValueChange={vi.fn()} formatAffiche="EEE d MMM" aria-label="Du" />));
    expect(screen.getByRole('button', { name: 'Du' })).toHaveTextContent(/^mar\. 10 nov\.$/);
  });

  it('sans motif, le format d’avant (« 10 novembre 2026 »)', () => {
    render(withIntl(<DatePicker id="du" value="2026-11-10" onValueChange={vi.fn()} aria-label="Du" />));
    expect(screen.getByRole('button', { name: 'Du' })).toHaveTextContent(/^10 novembre 2026$/);
  });
});
