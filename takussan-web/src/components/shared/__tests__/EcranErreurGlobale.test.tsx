import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { EcranErreurGlobale } from '../EcranErreurGlobale';

/**
 * TCK-2356 (P14.07) — l'écran de `global-error.tsx`, qui remplace le layout racine quand celui-ci
 * lève. Aucun provider ne l'entoure : il charge lui-même le dictionnaire de la langue de l'URL, et
 * journalise l'erreur en une ligne JSON (console du navigateur), sans son message.
 */
const TEMOIN_MESSAGE = 'temoin-message-2356@exemple.sn';

function erreur() {
  return Object.assign(new Error(`échec pour ${TEMOIN_MESSAGE}`), { digest: '2356-digest' });
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('EcranErreurGlobale', () => {
  it('rend le texte de la frontière dans la langue de l’URL, la référence et le bouton', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState(null, '', '/en/properties');
    const retry = vi.fn();

    render(<EcranErreurGlobale error={erreur()} retry={retry} />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');
    expect(screen.getByText(/2356-digest/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('retombe sur le français hors de la surface publique', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState(null, '', '/app/overview');

    render(<EcranErreurGlobale error={erreur()} retry={() => {}} />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Une erreur est survenue');
  });

  it('journalise une ligne JSON, avec le digest et sans le message', async () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<EcranErreurGlobale error={erreur()} retry={() => {}} />);
    await screen.findByRole('heading', { level: 1 });

    expect(journal).toHaveBeenCalledTimes(1);
    const brut = String(journal.mock.calls[0][0]);
    expect(JSON.parse(brut)).toMatchObject({
      message: 'global_error',
      level_name: 'ERROR',
      channel: 'web',
      context: { exception: 'Error', digest: '2356-digest' },
    });
    expect(brut).not.toContain(TEMOIN_MESSAGE);
  });
});
