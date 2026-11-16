/**
 * TCK-2861 (AC2) — en enregistrement, le composeur rend une ONDE à côté du chronomètre, et elle se
 * met à jour. Deux sources : le niveau du micro (`AnalyserNode`) quand le navigateur a un
 * `AudioContext`, sinon une onde neutre qui avance avec le chronomètre. En écoute, l'onde reste.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { VoiceNoteRecorder } from '../VoiceNoteRecorder';

vi.mock('@/lib/queries/conversations', () => ({
  useSendVoiceNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

class FauxEnregistreur {
  static isTypeSupported = () => true;
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  stop() {
    this.onstop?.();
  }
}

/** Un `AudioContext` dont l'analyseur rend un signal de plus en plus fort à chaque relevé. */
let releves = 0;
const fermer = vi.fn(async () => undefined);
class FauxContexte {
  createAnalyser() {
    return {
      fftSize: 0,
      getByteTimeDomainData(tampon: Uint8Array) {
        releves += 1;
        tampon.fill(128 + Math.min(127, releves * 8));
      },
    };
  }
  createMediaStreamSource() {
    return { connect: () => undefined };
  }
  close = fermer;
}

beforeEach(() => {
  releves = 0;
  fermer.mockClear();
  vi.stubGlobal('MediaRecorder', FauxEnregistreur);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
  });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:note'), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function enregistrer() {
  render(withIntl(<VoiceNoteRecorder conversationId={7} rond />));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une note vocale' }));
  });
}

describe('<VoiceNoteRecorder> — l’onde (TCK-2861, AC2)', () => {
  it('sans AudioContext : une onde neutre à côté du chronomètre, qui avance avec lui', async () => {
    vi.useFakeTimers();
    await enregistrer();
    const onde = screen.getByTestId('onde-enregistrement');
    // À côté du chronomètre, dans la même pilule.
    expect(onde.parentElement).toHaveTextContent('0:00 / 1:00');
    expect(onde.children).toHaveLength(28);
    const avant = onde.getAttribute('data-jouees');

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByTestId('note-vocale-en-cours')).toHaveTextContent('0:15 / 1:00');
    expect(screen.getByTestId('onde-enregistrement').getAttribute('data-jouees')).not.toBe(avant);
  });

  it('avec AudioContext : les niveaux mesurés du micro, puis le contexte fermé à l’arrêt ; l’onde reste en écoute', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FauxContexte);
    await enregistrer();
    const hauteurs = () => [...screen.getByTestId('onde-enregistrement').children].map((b) => (b as HTMLElement).style.height);
    const avant = hauteurs();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(releves).toBeGreaterThan(0);
    expect(hauteurs()).not.toEqual(avant);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Arrêter l'enregistrement/ }));
    });
    expect(fermer).toHaveBeenCalled();
    expect(screen.getByTestId('onde-ecoute').children).toHaveLength(28);
  });
});
