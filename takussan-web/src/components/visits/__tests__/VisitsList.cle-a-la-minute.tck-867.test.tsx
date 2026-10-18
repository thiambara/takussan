import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { VisitsList } from '../VisitsList';

/**
 * TCK-867 (P02.10) — l'instant « maintenant » des onglets de visites est arrondi à la minute. Il
 * entre dans les paramètres de `useVisits`, donc dans la clé de cache : à la milliseconde, chaque
 * montage de la liste produisait cinq clés neuves, et le cache n'était jamais réutilisé.
 */
const appels = vi.hoisted(() => ({ params: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/queries/visits', () => ({
  useVisits: (params: Record<string, unknown>) => {
    appels.params.push(params);
    return { data: undefined, isLoading: false, isError: false };
  },
}));

function instantsDuMontage(): string[] {
  appels.params = [];
  render(withIntl(<VisitsList />));
  const instants = appels.params.flatMap((p) =>
    [p.scheduled_at_min, p.scheduled_at_max].filter((v): v is string => typeof v === 'string'),
  );
  cleanup();
  return instants;
}

describe('<VisitsList> — instant de référence', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deux montages dans la même minute envoient le même instant, à la minute', () => {
    vi.setSystemTime(new Date('2026-10-18T10:15:07.123Z'));
    const premier = instantsDuMontage();
    vi.setSystemTime(new Date('2026-10-18T10:15:48.901Z'));
    const second = instantsDuMontage();

    expect(premier.length).toBeGreaterThan(0);
    expect(new Set([...premier, ...second])).toEqual(new Set(['2026-10-18T10:15:00.000Z']));
  });
});
