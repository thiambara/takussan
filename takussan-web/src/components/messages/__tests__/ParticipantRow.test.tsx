import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { ConversationParticipant } from '@/types/message';
import { ParticipantRow } from '../ParticipantRow';

/**
 * P220.01 (TCK-2132) — un compte créé par téléphone a `full_name: ''` : la ligne retombe sur
 * `#<user_id>` et sur `?`, comme pour un participant sans compte chargé.
 */
function participant(fullName: string): ConversationParticipant {
  return {
    id: 1,
    user_id: 42,
    role: 'member',
    last_read_at: null,
    joined_at: '2026-10-20T10:00:00+00:00',
    left_at: null,
    user: { id: 42, full_name: fullName, avatar_url: null },
  };
}

function rendre(fullName: string) {
  return render(
    withIntl(
      <ul>
        <ParticipantRow participant={participant(fullName)} isSelf={false} canManage={false} />
      </ul>,
    ),
  );
}

describe('ParticipantRow', () => {
  it('retombe sur #id et « ? » pour un nom vide', () => {
    const { container } = rendre('');
    expect(container.textContent).toContain('#42');
    expect(container.querySelector('span')?.textContent).toBe('?');
  });

  it('rend le nom et ses initiales quand il existe', () => {
    const { container } = rendre('Awa Sarr');
    expect(container.textContent).toContain('Awa Sarr');
    expect(container.querySelector('span')?.textContent).toBe('AS');
  });
});
