import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnregistrerServiceWorker } from '../EnregistrerServiceWorker';

/** TCK-598 (V18) — l'enregistrement : portée racine, et seulement quand il est actif. */
describe('EnregistrerServiceWorker', () => {
  const register = vi.fn(async () => ({}));

  afterEach(() => {
    register.mockClear();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  function avecServiceWorker() {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
  }

  it('enregistre /sw.js avec la portée / une fois la page chargée', () => {
    avecServiceWorker();
    render(<EnregistrerServiceWorker actif />);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('n\'enregistre rien quand il est inactif (hors production)', () => {
    avecServiceWorker();
    render(<EnregistrerServiceWorker actif={false} />);
    expect(register).not.toHaveBeenCalled();
  });

  it('ne casse rien sans API service worker', () => {
    expect(() => render(<EnregistrerServiceWorker actif />)).not.toThrow();
  });
});
