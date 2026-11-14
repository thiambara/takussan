import { afterEach, describe, expect, it, vi } from 'vitest';

import { avalerLeClicFantome, DELAI_DU_CLIC_FANTOME_MS } from '../clic-fantome';

describe('avalerLeClicFantome', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("ne lève rien quand le délai échoit après le démontage de l'environnement", () => {
    vi.useFakeTimers();
    avalerLeClicFantome();
    // Ce que fait la fin d'un fichier de test : les globaux du DOM disparaissent, le minuteur reste.
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    expect(() => vi.advanceTimersByTime(DELAI_DU_CLIC_FANTOME_MS)).not.toThrow();
  });

  it('avale un seul clic sur un lien de la page, puis laisse passer', () => {
    const lien = document.createElement('a');
    lien.href = '/ailleurs';
    document.body.append(lien);
    avalerLeClicFantome();
    const premier = new MouseEvent('click', { bubbles: true, cancelable: true });
    lien.dispatchEvent(premier);
    const second = new MouseEvent('click', { bubbles: true, cancelable: true });
    lien.dispatchEvent(second);
    expect(premier.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(false);
    lien.remove();
  });
});
