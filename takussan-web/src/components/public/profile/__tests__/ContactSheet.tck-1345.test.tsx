import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { ContactSheet } from '../ContactSheet';

vi.mock('@/app/actions/property', () => ({ submitAgentContactLead: vi.fn() }));

/**
 * TCK-1345 (P125.06) — le `tel:` d'une fiche publique compose l'E.164 : `agencies.phone` rangé
 * `77 123 45 67` publiait `tel:771234567`, qui n'aboutit pas hors du Sénégal.
 */
describe('ContactSheet — TCK-1345', () => {
  it.each([
    ['77 123 45 67', 'tel:+221771234567'],
    ['+221 33 000 00 00', 'tel:+221330000000'],
  ])('%s → %s', (brut, attendu) => {
    const { container } = render(withIntl(<ToastProvider><ContactSheet name="Immo Dakar" phone={brut} /></ToastProvider>));
    const liens = [...container.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href'));
    expect(liens.length).toBeGreaterThan(0);
    expect(new Set(liens)).toEqual(new Set([attendu]));
  });
});
