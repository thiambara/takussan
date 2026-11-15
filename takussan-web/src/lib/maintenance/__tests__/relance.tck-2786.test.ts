/** TCK-2786 — le délai restant avant la prochaine relance, tiré d'`available_at`. */
import { describe, expect, it } from 'vitest';

import { dureeJusqua } from '@/lib/maintenance/files';

const MAINTENANT = new Date('2026-11-13T10:30:00Z');

describe('dureeJusqua', () => {
  it('arrondit à l’unité supérieure : on ne promet jamais plus tôt que l’API', () => {
    expect(dureeJusqua('2026-11-14T08:30:00Z', MAINTENANT)).toEqual({ n: 22, unite: 'hour' });
    expect(dureeJusqua('2026-11-14T08:31:00Z', MAINTENANT)).toEqual({ n: 23, unite: 'hour' });
    expect(dureeJusqua('2026-11-13T10:30:30Z', MAINTENANT)).toEqual({ n: 1, unite: 'minute' });
    expect(dureeJusqua('2026-11-13T11:30:00Z', MAINTENANT)).toEqual({ n: 60, unite: 'minute' });
    expect(dureeJusqua('2026-11-14T10:30:00Z', MAINTENANT)).toEqual({ n: 24, unite: 'hour' });
  });

  it('rien quand c’est passé ou illisible', () => {
    expect(dureeJusqua('2026-11-13T10:30:00Z', MAINTENANT)).toBeNull();
    expect(dureeJusqua('pas une date', MAINTENANT)).toBeNull();
    expect(dureeJusqua(null, MAINTENANT)).toBeNull();
  });
});
