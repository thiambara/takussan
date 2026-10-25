import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { AuditLogEntry } from '@/types/super-admin';
import { UserActivityTimeline } from '../user-detail';

vi.mock('@/lib/queries/super-admin', () => ({
  deleteAdminUserSession: vi.fn(),
  fetchAdminUserActivity: vi.fn(),
  fetchAdminUserDetail: vi.fn(),
  fetchAdminUserSessions: vi.fn(),
  postUserSupportAction: vi.fn(),
  requestAdminUserDataExport: vi.fn(),
}));

const entree = (id: number, event: string | null, description: string | null): AuditLogEntry => ({
  id,
  log_name: 'default',
  event,
  description,
  causer_type: 'App\\Models\\User',
  causer_id: 5,
  subject_type: null,
  subject_id: null,
  properties: null,
  created_at: '2026-10-01T10:00:00Z',
});

/**
 * P06.09 (TCK-2336) — l'activité de la fiche utilisateur affichait le code brut de l'événement
 * (`role_assigned`), puis la description brute : l'événement traduit, ou la description seule pour
 * un événement sans clé.
 */
describe('fiche utilisateur — activité (P06.09)', () => {
  it('un événement connu se lit traduit, un inconnu par sa description, sans code brut', () => {
    render(withIntl(
      <UserActivityTimeline
        entries={[
          entree(1, 'role_assigned', 'role_assigned'),
          entree(2, 'super_admin_plan_updated', 'Plan « Pro » modifié'),
        ]}
        loading={false}
        userId={5}
      />,
    ));

    expect(screen.getByText('Rôle attribué')).toBeInTheDocument();
    expect(screen.getByText('Plan « Pro » modifié')).toBeInTheDocument();
    expect(screen.queryByText('role_assigned')).not.toBeInTheDocument();
    expect(screen.queryByText('super_admin_plan_updated')).not.toBeInTheDocument();
  });
});
