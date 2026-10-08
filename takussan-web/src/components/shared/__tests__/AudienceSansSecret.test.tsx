import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const recu = vi.hoisted(() => ({ props: null as null | { beforeSend?: (e: { type: 'pageview'; url: string }) => unknown } }));

vi.mock('@vercel/analytics/next', () => ({
  Analytics: (props: typeof recu.props) => {
    recu.props = props;
    return null;
  },
}));

import { AudienceSansSecret } from '@/components/shared/AudienceSansSecret';

describe('AudienceSansSecret (TCK-602, VERIF-602 M3)', () => {
  it('monte Analytics avec un beforeSend qui retire le jeton du lien de paiement', () => {
    render(<AudienceSansSecret />);

    const jeton = 'Q'.repeat(43);
    expect(recu.props?.beforeSend).toBeTypeOf('function');
    expect(recu.props?.beforeSend?.({ type: 'pageview', url: `https://www.takussan.com/fr/pay/${jeton}` })).toEqual({
      type: 'pageview',
      url: 'https://www.takussan.com/fr/pay/[token]',
    });
  });
});
