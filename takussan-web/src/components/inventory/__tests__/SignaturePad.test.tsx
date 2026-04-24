import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SignaturePad } from '../SignaturePad';

/**
 * jsdom doesn't implement `HTMLCanvasElement.toDataURL` nor
 * `setPointerCapture`, so we stub them. The tests focus on the UI
 * contract: disabled states, clear button semantics, confirm payload.
 */
function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = () =>
    ({
      lineCap: '',
      lineJoin: '',
      lineWidth: 0,
      strokeStyle: '',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
      scale: vi.fn(),
    }) as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  // @ts-expect-error – pointer capture not in jsdom
  HTMLElement.prototype.setPointerCapture = () => undefined;
  // @ts-expect-error – pointer capture not in jsdom
  HTMLElement.prototype.releasePointerCapture = () => undefined;
}

function drawStroke(canvas: HTMLElement) {
  // jsdom doesn't fire the React pointer handler unless we dispatch a real
  // PointerEvent-like payload. We also have to manually flag `.buttons` so
  // the move event is treated as a drag.
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 45, pointerId: 1, buttons: 1 });
  fireEvent.pointerUp(canvas, { clientX: 40, clientY: 45, pointerId: 1 });
}

describe('<SignaturePad>', () => {
  stubCanvas();

  it('renders a canvas with the label and a disabled confirm button by default', () => {
    render(<SignaturePad onConfirm={vi.fn()} label="Signez ici" />);
    expect(screen.getByTestId('signature-canvas')).toBeInTheDocument();
    // No stroke yet → confirm is disabled.
    expect(screen.getByRole('button', { name: /confirmer ma signature/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /effacer/i })).toBeDisabled();
  });

  it('enables confirm and clear once the user has drawn', () => {
    render(<SignaturePad onConfirm={vi.fn()} />);
    const canvas = screen.getByTestId('signature-canvas');

    drawStroke(canvas);

    expect(screen.getByRole('button', { name: /confirmer ma signature/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /effacer/i })).toBeEnabled();
  });

  it('emits a base64 data URL through onConfirm', () => {
    const onConfirm = vi.fn();
    render(<SignaturePad onConfirm={onConfirm} />);
    const canvas = screen.getByTestId('signature-canvas');

    drawStroke(canvas);
    fireEvent.click(screen.getByRole('button', { name: /confirmer ma signature/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.calls[0][0];
    expect(typeof payload).toBe('string');
    expect(payload.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('clears the canvas and resets the confirm button', () => {
    render(<SignaturePad onConfirm={vi.fn()} />);
    const canvas = screen.getByTestId('signature-canvas');

    drawStroke(canvas);
    fireEvent.click(screen.getByRole('button', { name: /effacer/i }));

    expect(screen.getByRole('button', { name: /confirmer ma signature/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /effacer/i })).toBeDisabled();
  });

  it('surfaces an error message passed in by the caller', () => {
    render(<SignaturePad onConfirm={vi.fn()} errorMessage="Signature refusée" />);
    expect(screen.getByText(/signature refusée/i)).toBeInTheDocument();
  });

  it('renders a custom confirm label', () => {
    render(
      <SignaturePad onConfirm={vi.fn()} confirmLabel="Signer en tant que locataire" />,
    );
    expect(
      screen.getByRole('button', { name: /signer en tant que locataire/i }),
    ).toBeInTheDocument();
  });
});
