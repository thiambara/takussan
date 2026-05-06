import { describe, expect, it } from 'vitest';

import frMessages from '@/messages/fr.json';
import { formatCurrency, formatDate } from '@/lib/format';
import { localeDisplayLabel } from '@/i18n/config';
import { statusFilterLabel } from '@/components/leases/LeasesList';
import { MAINTENANCE_PRIORITY_LABEL } from '@/components/maintenance/labels';

function normalizeSpaces(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ');
}

describe('agent French i18n regressions', () => {
  it('formats French dates without English month names', () => {
    const rendered = formatDate('2026-05-06T12:00:00Z', 'fr', {
      dateStyle: 'medium',
    });

    expect(rendered).not.toMatch(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
    expect(rendered.toLowerCase()).toContain('mai');
  });

  it('formats XOF amounts with French grouping', () => {
    const rendered = normalizeSpaces(formatCurrency(150_000, 'fr'));

    expect(rendered).toBe('150 000 F CFA');
    expect(rendered).not.toContain('150,000');
  });

  it('uses localized labels for shell language choices', () => {
    expect(localeDisplayLabel('en', 'fr')).toBe('Anglais');
    expect(localeDisplayLabel('fr', 'fr')).toBe('Français');
  });

  it('keeps messaging labels French in the FR bundle', () => {
    expect(frMessages.messaging.newGroup).toBe('Nouveau groupe');
    expect(frMessages.messaging.emptyState).toBe(
      'Sélectionnez une conversation pour afficher les messages.',
    );
    expect(JSON.stringify(frMessages.messaging)).not.toContain('New group');
    expect(JSON.stringify(frMessages.messaging)).not.toContain(
      'Select a conversation to view messages.',
    );
  });

  it('does not expose technical lease and maintenance enum values', () => {
    expect(statusFilterLabel('all')).toBe('Tous les statuts');
    expect(statusFilterLabel('active')).toBe('Actif');
    expect(Object.values(MAINTENANCE_PRIORITY_LABEL)).toEqual([
      'Faible',
      'Normale',
      'Élevée',
      'Urgente',
    ]);
    expect(Object.values(MAINTENANCE_PRIORITY_LABEL)).not.toEqual(
      expect.arrayContaining(['Low', 'High', 'Normal']),
    );
  });
});
