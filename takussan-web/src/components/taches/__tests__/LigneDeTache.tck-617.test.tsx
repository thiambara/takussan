/**
 * TCK-617 AC6, point 5 (décision du porteur, 2026-11-16) — la tâche d'un parent supprimé reste
 * listée, marquée « Bien supprimé » / « Client supprimé » ; un parent illisible garde « Un bien ».
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { TacheDeLaPage } from '@/lib/queries/taches';
import { withIntl } from '@/test/intl';

import { LigneDeTache } from '../LigneDeTache';

const tache = (o: Partial<TacheDeLaPage>): TacheDeLaPage => ({
  id: 1,
  title: 'Relancer pour le dossier',
  status: 'open',
  priority: 'medium',
  due_at: null,
  taskable: { type: 'property', id: 8, label: null, phone: null },
  assignee: null,
  ...o,
});

function ligne(t: TacheDeLaPage) {
  return render(
    withIntl(
      <ul>
        <LigneDeTache tache={t} maintenant={new Date('2026-11-16T10:00:00Z')} enCours={false} onCocher={vi.fn()} onOuvrir={vi.fn()} onReporter={vi.fn()} />
      </ul>,
    ),
  );
}

describe('LigneDeTache — parent supprimé (TCK-617)', () => {
  it('marque le bien supprimé', () => {
    ligne(tache({ parent_deleted: true }));
    expect(screen.getByText('Bien supprimé')).toBeInTheDocument();
    expect(screen.queryByText('Un bien')).not.toBeInTheDocument();
  });

  it('marque le client supprimé', () => {
    ligne(tache({ parent_deleted: true, taskable: { type: 'customer', id: 4, label: null, phone: null } }));
    expect(screen.getByText('Client supprimé')).toBeInTheDocument();
  });

  it('garde « Un bien » pour un parent vivant mais illisible', () => {
    ligne(tache({ parent_deleted: false }));
    expect(screen.getByText('Un bien')).toBeInTheDocument();
  });
});
