import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { ATTRIBUT_POSITION_VERROUILLEE } from '@/hooks/useVerrouDeDefilement';
import { withIntl } from '@/test/intl';

import { FeuilleDesNotifications } from '../FeuilleDesNotifications';

/**
 * TCK-2634 (vérification, M9) — la feuille de la cloche, au téléphone, verrouille le document par
 * `useVerrouDeDefilement` (TCK-551 : l'`overflow: hidden` de base-ui laisse passer le doigt et
 * `scrollBy`) tant qu'elle est ouverte, et le rend à la fermeture. Le relevé au navigateur le
 * montrait ; aucun test ne le tenait.
 */

vi.mock('../ContenuDeLaCloche', () => ({ ContenuDeLaCloche: () => <p>contenu de la cloche</p> }));

function monter(open: boolean) {
  return withIntl(
    <FeuilleDesNotifications
      open={open}
      onOpenChange={vi.fn()}
      declencheur={<button type="button">Notifications</button>}
    />,
  );
}

afterEach(() => {
  document.body.removeAttribute('style');
  document.body.removeAttribute(ATTRIBUT_POSITION_VERROUILLEE);
});

describe('FeuilleDesNotifications — le verrou de défilement', () => {
  it('ouverte, sort le document du flux (`position: fixed`) ; fermée, le rend', async () => {
    const { rerender } = render(monter(false));
    expect(document.body.style.position).toBe('');

    rerender(monter(true));
    await screen.findByText('contenu de la cloche');
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.hasAttribute(ATTRIBUT_POSITION_VERROUILLEE)).toBe(true);

    rerender(monter(false));
    await waitFor(() => expect(document.body.style.position).toBe(''));
    expect(document.body.hasAttribute(ATTRIBUT_POSITION_VERROUILLEE)).toBe(false);
  });
});
