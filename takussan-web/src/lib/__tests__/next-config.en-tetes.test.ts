import { describe, expect, it } from 'vitest';

import nextConfig from '../../../next.config';

/**
 * TCK-950 (P44.03) — le serveur Next n'annonce pas sa pile : sans `poweredByHeader: false`, chaque
 * réponse portait `X-Powered-By: Next.js` (mesuré sur le standalone). `smoke-web.sh` le vérifie sur
 * l'image.
 */
describe('next.config.ts — en-têtes de réponse', () => {
  it('n\'émet pas X-Powered-By', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
