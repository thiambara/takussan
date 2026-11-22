/**
 * TCK-2601 — ce que `/publish` sait du brouillon local avant de décider : rien encore (`null`), une
 * annonce à reprendre sans compte (`true`), rien (`false`), ou une annonce déjà versée au brouillon
 * serveur (`'verse'`, r1 : la page mène à sa reprise).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { moteurEnMemoire, ouvrirBrouillonLocal } from '../brouillon-local';
import { useBrouillonLocalPresent } from '../useBrouillonLocalPresent';

async function lire(preparer: (b: ReturnType<typeof ouvrirBrouillonLocal>) => Promise<void>) {
  const moteur = moteurEnMemoire();
  await preparer(ouvrirBrouillonLocal({ moteur }));
  const { result } = renderHook(() => useBrouillonLocalPresent(() => ouvrirBrouillonLocal({ moteur })));
  expect(result.current).toBeNull();
  await waitFor(() => expect(result.current).not.toBeNull());
  return result.current;
}

describe('useBrouillonLocalPresent', () => {
  it('aucun brouillon : false', async () => {
    expect(await lire(async () => undefined)).toBe(false);
  });

  it('une annonce gardée : true', async () => {
    expect(await lire((b) => b.ecrireValeurs(2, { type: 'studio' }))).toBe(true);
  });

  it('r1 — une annonce versée au brouillon serveur : « verse », même avec ses valeurs et ses photos', async () => {
    expect(
      await lire(async (b) => {
        await b.ecrireValeurs(5, { type: 'studio' });
        await b.marquerVerse('property-create-wizard:publication');
      }),
    ).toBe('verse');
  });
});
