/**
 * TCK-2632 — le micro du composeur de la messagerie : masqué au repos quand le champ porte quelque
 * chose (l'envoi prend sa place), jamais démonté pendant une note ; actif de l'enregistrement
 * jusqu'au rejet de la note, pour que le composeur s'efface devant elle.
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

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FauxEnregistreur);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
  });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:note'), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

describe('<VoiceNoteRecorder> dans le composeur (TCK-2632)', () => {
  it('au repos et masqué : rien, l’envoi a pris sa place', () => {
    render(withIntl(<VoiceNoteRecorder conversationId={7} auRepos="masque" rond />));
    expect(screen.queryByRole('button', { name: 'Enregistrer une note vocale' })).not.toBeInTheDocument();
  });

  it('le micro rond de la maquette ; actif de l’enregistrement au rejet de la note', async () => {
    const onActif = vi.fn();
    const { rerender } = render(withIntl(<VoiceNoteRecorder conversationId={7} rond onActif={onActif} />));
    const micro = screen.getByRole('button', { name: 'Enregistrer une note vocale' });
    expect(micro).toHaveClass('rounded-full', 'size-11');

    await act(async () => {
      fireEvent.click(micro);
    });
    expect(onActif).toHaveBeenLastCalledWith(true);

    // Masqué au repos ne cache pas une note en cours : elle reste à l'écran.
    rerender(withIntl(<VoiceNoteRecorder conversationId={7} rond auRepos="masque" onActif={onActif} />));
    const arreter = screen.getByRole('button', { name: /Arrêter l'enregistrement/ });
    await act(async () => {
      fireEvent.click(arreter);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la note' }));
    expect(onActif).toHaveBeenLastCalledWith(false);
  });

  /**
   * Maquette a/5 (« Composeur » en enregistrement, puis en écoute) : la borne au-dessus, « jeter »
   * à gauche, le temps sur la borne (« 0:00 / 1:00 »), « arrêter » puis « envoyer » en rond.
   */
  it('en enregistrement : la borne, le temps sur 1:00, « arrêter » ; puis l’écoute et « envoyer »', async () => {
    render(withIntl(<VoiceNoteRecorder conversationId={7} rond />));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une note vocale' }));
    });
    expect(screen.getByText('Note vocale · 60 secondes au plus')).toBeInTheDocument();
    expect(screen.getByTestId('note-vocale-en-cours')).toHaveTextContent('0:00 / 1:00');
    expect(screen.getByRole('button', { name: 'Supprimer la note' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Arrêter l'enregistrement/ }));
    });
    expect(screen.queryByText('Note vocale · 60 secondes au plus')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Écouter la note avant l'envoi" })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Envoyer la note vocale' })).toHaveClass('rounded-full', 'bg-primary');
  });

  it('« jeter » pendant l’enregistrement : la note arrêtée n’est pas gardée', async () => {
    const onActif = vi.fn();
    render(withIntl(<VoiceNoteRecorder conversationId={7} rond onActif={onActif} />));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une note vocale' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer la note' }));
    });
    expect(onActif).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('button', { name: 'Envoyer la note vocale' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer une note vocale' })).toBeInTheDocument();
  });
});
