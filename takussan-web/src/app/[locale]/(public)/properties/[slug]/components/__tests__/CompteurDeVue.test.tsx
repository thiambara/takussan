import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { CompteurDeVue } from '../CompteurDeVue';

/**
 * TCK-598 (AC7, ADR-0052 §1) — la vue se compte par un appel SÉPARÉ, depuis le navigateur, une fois
 * par affichage : ni le double montage du mode strict ni un nouveau rendu ne la refont.
 */
let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CompteurDeVue', () => {
  it('POST /public/properties/{slug}/view, sans identifiants ni corps', () => {
    render(<CompteurDeVue slug="studio-a-mermoz-abc123" />);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/public\/properties\/studio-a-mermoz-abc123\/view$/);
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true });
    expect((init as RequestInit).body).toBeUndefined();
    expect((init as RequestInit).headers).toBeUndefined();
  });

  it('une seule vue en mode strict, et aucune de plus au nouveau rendu', () => {
    const { rerender } = render(
      <StrictMode>
        <CompteurDeVue slug="villa-a-ngor-def456" />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <CompteurDeVue slug="villa-a-ngor-def456" />
      </StrictMode>,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('un autre slug dans le même composant : une vue de plus', () => {
    const { rerender } = render(<CompteurDeVue slug="a-aaaaaa" />);
    rerender(<CompteurDeVue slug="b-bbbbbb" />);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('une panne réseau ne remonte pas', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(() => render(<CompteurDeVue slug="c-cccccc" />)).not.toThrow();
    await Promise.resolve();
  });
});
