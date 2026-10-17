import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAvertissementDepart } from '../useAvertissementDepart';

/** Un `beforeunload` annulable, comme celui du navigateur : `defaultPrevented` dit s'il avertit. */
function quitterLaPage(): Event {
  const evenement = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(evenement);
  return evenement;
}

/**
 * P08.06 (TCK-755) — un formulaire long modifié avertit avant qu'on quitte la page, et seulement
 * s'il est modifié (décision du porteur).
 */
describe('useAvertissementDepart', () => {
  it("n'avertit pas tant que le formulaire n'est pas modifié", () => {
    renderHook(() => useAvertissementDepart(false));
    expect(quitterLaPage().defaultPrevented).toBe(false);
  });

  it('avertit quand le formulaire est modifié', () => {
    renderHook(() => useAvertissementDepart(true));
    expect(quitterLaPage().defaultPrevented).toBe(true);
  });

  it("cesse d'avertir quand le formulaire redevient intact, puis au démontage", () => {
    const { rerender, unmount } = renderHook(({ actif }) => useAvertissementDepart(actif), {
      initialProps: { actif: true },
    });
    rerender({ actif: false });
    expect(quitterLaPage().defaultPrevented).toBe(false);

    rerender({ actif: true });
    unmount();
    expect(quitterLaPage().defaultPrevented).toBe(false);
  });
});
