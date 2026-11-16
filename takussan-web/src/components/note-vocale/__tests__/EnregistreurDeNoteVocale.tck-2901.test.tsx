/**
 * TCK-2901 (ADR-0113 § 1) — l'enregistreur de note vocale, HORS de la messagerie : il rend un
 * fichier, son type et sa durée à son appelant, sans requête ; borne de 60 s ; mode « garder
 * appuyé » ; rien sans `MediaRecorder`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { EnregistreurDeNoteVocale } from '../EnregistreurDeNoteVocale';
import type { NoteVocale } from '../useEnregistreurDeNoteVocale';

class FauxEnregistreur {
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_flux: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
  }
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['voix'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const fetchEspion = vi.fn();
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MediaRecorder', FauxEnregistreur);
  vi.stubGlobal('fetch', fetchEspion);
  // La pastille de réécoute joue par `new Audio()`, que jsdom ne sait pas jouer.
  vi.stubGlobal('Audio', class { pause() {} play() { return Promise.resolve(); } });
  getUserMedia = vi.fn(async () => ({ getTracks: () => [] }));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:note'), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  fetchEspion.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function monter(mode?: 'toucher' | 'appui') {
  const onChange = vi.fn<(note: NoteVocale | null) => void>();
  render(withIntl(<EnregistreurDeNoteVocale mode={mode} onChange={onChange} />));
  return onChange;
}

describe('<EnregistreurDeNoteVocale> (TCK-2901)', () => {
  it('AC1 — rend un fichier, son type et sa durée, sans aucune requête ; la pastille la relit « Message vocal · 0:18 »', async () => {
    const onChange = monter();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(18_000);
    });
    expect(screen.getByTestId('note-vocale-chrono')).toHaveTextContent('0:18 / 1:00');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Arrêter l'enregistrement" }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const note = onChange.mock.calls[0]![0]!;
    expect(note.blob).toBeInstanceOf(Blob);
    expect(note.blob.size).toBeGreaterThan(0);
    expect(note.mimeType).toBe('audio/webm;codecs=opus');
    expect(note.duration).toBe(18);
    expect(fetchEspion).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-vocale-enregistree')).toHaveTextContent('Message vocal · 0:18');
  });

  it('supprimer la note la rend à `null` et rend le micro', async () => {
    const onChange = monter();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(3_000);
      fireEvent.click(screen.getByRole('button', { name: "Arrêter l'enregistrement" }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le message vocal' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: 'Enregistrer un message vocal' })).toBeInTheDocument();
  });

  it('AC3 — à 60 s l’enregistrement s’arrête seul', async () => {
    const onChange = monter();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(59_000);
    });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]!.duration).toBe(60);
    expect(screen.queryByRole('button', { name: "Arrêter l'enregistrement" })).not.toBeInTheDocument();
  });

  it('AC2 — garder appuyé : pointerdown démarre, pointerup arrête et rend la note', async () => {
    const onChange = monter('appui');
    const micro = screen.getByRole('button', { name: 'Gardez appuyé pour enregistrer un message vocal' });
    await act(async () => {
      fireEvent.pointerDown(micro);
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Relâchez pour terminer' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await act(async () => {
      fireEvent.pointerUp(screen.getByRole('button', { name: 'Relâchez pour terminer' }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]!.duration).toBe(5);
  });

  it('AC2 — un appui bref (0 s) ne produit aucune note', async () => {
    const onChange = monter('appui');
    const micro = screen.getByRole('button', { name: 'Gardez appuyé pour enregistrer un message vocal' });
    await act(async () => {
      fireEvent.pointerDown(micro);
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
      fireEvent.pointerUp(screen.getByRole('button', { name: 'Relâchez pour terminer' }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Gardez appuyé pour enregistrer un message vocal' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('AC2 — relâché avant que le micro s’ouvre : l’arrêt est retenu, aucune note', async () => {
    const onChange = monter('appui');
    const micro = screen.getByRole('button', { name: 'Gardez appuyé pour enregistrer un message vocal' });
    await act(async () => {
      fireEvent.pointerDown(micro);
      fireEvent.pointerUp(micro);
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Relâchez pour terminer' })).not.toBeInTheDocument();
  });

  it('un refus du micro s’affiche', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
    monter();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent("Le micro n'est pas accessible");
  });

  it('AC4 — sans MediaRecorder, ni l’enregistreur ni son bouton ne sont dans le DOM', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const { container } = render(withIntl(<EnregistreurDeNoteVocale onChange={vi.fn()} mode="appui" />));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
