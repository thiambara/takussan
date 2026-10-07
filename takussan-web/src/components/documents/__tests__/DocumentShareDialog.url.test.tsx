import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { Document } from '@/types/document';
import { DocumentShareDialog } from '../DocumentShareDialog';

/**
 * TCK-587 §8 (AC15) — le lien distribué mène à la PAGE de réception du front.
 *
 * Il valait `${origin}/api/share/{token}` : une URL de l'origine du FRONT, où aucun gestionnaire
 * n'existe et que rien ne réécrit vers l'API — le destinataire tombait sur une page vide, et un
 * lien protégé ne s'ouvrait qu'en ajoutant `?password=` à la main.
 */
vi.mock('@/lib/queries/documents', () => ({
  useCreateShareLink: () => ({
    isPending: false,
    mutateAsync: vi.fn(async () => ({
      data: {
        id: 1,
        document_id: 4,
        token: 'jeton-abc',
        expires_at: null,
        max_downloads: null,
        downloads_count: 0,
        has_password: true,
        revoked_at: null,
        created_at: '2026-10-07T00:00:00Z',
      },
    })),
  }),
  useRevokeShareLink: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

describe('<DocumentShareDialog> — URL distribuée (TCK-587, AC15)', () => {
  it('copie l’URL de la page de réception, jamais `${origin}/api/…`', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <DocumentShareDialog
          open
          onOpenChange={vi.fn()}
          document={{ id: 4, name: 'Bail' } as Document}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: fr.documents.share.create }));

    const champ = (await screen.findByLabelText(fr.documents.share.url_aria)) as HTMLInputElement;
    expect(champ.value).toBe(`${window.location.origin}/share/jeton-abc`);
    expect(champ.value.startsWith(`${window.location.origin}/api/`)).toBe(false);

    await user.click(screen.getByRole('button', { name: fr.documents.share.copy_aria }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/share/jeton-abc`);
  });
});
