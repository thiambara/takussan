/**
 * TCK-2901 (AC5) — le lecteur partagé : « Message vocal · 0:18 », un bouton de lecture nommé, qui
 * devient « pause » pendant la lecture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { PastilleDeNoteVocale } from '../PastilleDeNoteVocale';

const instances: FauxAudio[] = [];
class FauxAudio {
  src: string;
  preload = '';
  paused = true;
  currentTime = 0;
  duration = Number.POSITIVE_INFINITY;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    instances.push(this);
  }
  play() {
    this.paused = false;
    this.onplay?.();
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.onpause?.();
  }
}

beforeEach(() => {
  instances.length = 0;
  vi.stubGlobal('Audio', FauxAudio);
});
afterEach(() => vi.unstubAllGlobals());

describe('<PastilleDeNoteVocale> (TCK-2901, AC5)', () => {
  it('une note de 18 s : « Message vocal · 0:18 », un bouton de lecture nommé', () => {
    render(withIntl(<PastilleDeNoteVocale src="https://r2.example/note.webm" duree={18} />));
    const bouton = screen.getByRole('button', { name: 'Écouter le message vocal' });
    expect(bouton).toHaveTextContent('Message vocal · 0:18');
  });

  it('lecture puis pause : le nom suit l’état, le temps écoulé remplace la durée', async () => {
    render(withIntl(<PastilleDeNoteVocale src="blob:note" duree={18} />));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Écouter le message vocal' }));
    });
    const pause = screen.getByRole('button', { name: 'Mettre le message vocal en pause' });
    act(() => {
      instances.at(-1)!.currentTime = 5.4;
      instances.at(-1)!.ontimeupdate?.();
    });
    expect(pause).toHaveTextContent('Message vocal · 0:05');
    fireEvent.click(pause);
    expect(screen.getByRole('button', { name: 'Écouter le message vocal' })).toBeInTheDocument();
  });

  it('une lecture impossible s’affiche et prévient l’appelant', () => {
    const onErreur = vi.fn();
    render(withIntl(<PastilleDeNoteVocale src="https://perimee" duree={18} onErreur={onErreur} />));
    act(() => instances.at(-1)!.onerror?.());
    expect(screen.getByRole('alert')).toHaveTextContent('Ce message vocal ne peut pas être lu.');
    expect(onErreur).toHaveBeenCalledTimes(1);
  });
});
