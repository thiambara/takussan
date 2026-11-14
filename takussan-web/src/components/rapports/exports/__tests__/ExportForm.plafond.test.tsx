import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ExportForm } from '../ExportForm';

/**
 * TCK-1306 (piste P112.01) — le plafond de lignes se dit à l'écran : 5 000 par fichier (le défaut
 * de l'API, `ExportDataService::DEFAULT_ROWS`, le formulaire n'envoyant aucune `limit`), 200 en
 * PDF (`MAX_ROWS_PDF`). Rien ne le disait, et le PDF passait de 2 000 à 200 lignes en silence.
 */
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

describe('ExportForm — plafond de lignes affiché (TCK-1306)', () => {
  it('dit le plafond d’un fichier, et celui du PDF', () => {
    render(withIntl(<ExportForm staff />));

    expect(screen.getByTestId('exports-row-cap')).toHaveTextContent(
      /au plus 5\s000 lignes, 200 en PDF/,
    );
  });
});
