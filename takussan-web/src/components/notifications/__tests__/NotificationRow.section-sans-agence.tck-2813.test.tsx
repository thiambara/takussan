import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { AppNotification } from '@/lib/notifications';
import { withIntl } from '@/test/intl';

import { NotificationRow } from '../NotificationRow';

/**
 * TCK-2813 — une ligne ANCIENNE de section (KYC, relevé bancaire, délégation, échéance disparue)
 * arrive de l'API sans cible : `NotificationTarget::derive()` ne connaît pas l'agence de son objet,
 * et un lien vers la section d'une agence qui n'est peut-être pas la bonne est pire que pas de lien.
 * Elle se lit (titre, corps, date), garde son geste « marquer comme lu », et n'ouvre rien.
 */

function ligneAncienne(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 41,
    type: 'system',
    code: null,
    params: null,
    target: null,
    title: 'Relevé bancaire importé',
    body: 'Le relevé CBAO de 12 lignes est prêt à rapprocher.',
    is_read: false,
    read_at: null,
    created_at: '2026-09-20T08:00:00+00:00',
    a_traiter: true,
    ...overrides,
  };
}

describe('NotificationRow — ligne ancienne de section, sans cible (TCK-2813)', () => {
  it('se lit en entier, sans lien, sans verbe, sans chevron', () => {
    const onOpen = vi.fn();
    render(
      withIntl(
        <ul>
          <NotificationRow notification={ligneAncienne()} onOpen={onOpen} onToggleRead={vi.fn()} />
        </ul>,
      ),
    );

    expect(screen.getByText('Relevé bancaire importé')).toBeInTheDocument();
    expect(screen.getByText('Le relevé CBAO de 12 lignes est prêt à rapprocher.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="notification"] svg.lucide-chevron-right')).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('garde le geste « marquer comme lu » : la ligne inerte se traite encore', () => {
    render(
      withIntl(
        <ul>
          <NotificationRow notification={ligneAncienne()} onOpen={vi.fn()} onToggleRead={vi.fn()} />
        </ul>,
      ),
    );

    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
