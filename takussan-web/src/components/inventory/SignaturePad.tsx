'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * TCK-076 — compact touch/mouse canvas capture. Inspired by DocuSign /
 * PandaDoc: tap or drag to draw, "Effacer" to reset, "Confirmer" to emit
 * the `data:image/png;base64,...` payload.
 *
 * Kept dependency-free — a full signature-pad library is overkill here
 * and brings a sizeable bundle; the interaction is ~50 LOC.
 */

export interface SignaturePadHandle {
  /** Clears the canvas and resets the confirm button. */
  clear: () => void;
}

export interface SignaturePadProps {
  /** Called when the user validates the drawn signature. */
  readonly onConfirm: (dataUrl: string) => void | Promise<void>;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly helperText?: string;
  readonly confirmLabel?: string;
  readonly clearLabel?: string;
  readonly pending?: boolean;
  readonly errorMessage?: string | null;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  {
    onConfirm,
    disabled = false,
    label: labelProp,
    helperText: helperTextProp,
    confirmLabel: confirmLabelProp,
    clearLabel: clearLabelProp,
    pending = false,
    errorMessage = null,
  },
  ref,
) {
  // Les valeurs par défaut vivaient dans la signature de la fonction, en français dur.
  // Elles viennent désormais du dictionnaire — le rendu est identique, l'origine du texte non.
  const t = useTranslations('inventory.signaturePad');
  const label = labelProp ?? t('label');
  const helperText = helperTextProp ?? t('helperText');
  const confirmLabel = confirmLabelProp ?? t('confirmLabel');
  const clearLabel = clearLabelProp ?? t('clearLabel');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const getContext = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111827';
    return ctx;
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }, [getContext]);

  useImperativeHandle(ref, () => ({ clear }), [clear]);

  // Scale the canvas for crisp lines on HiDPI displays. Re-runs when the
  // element mounts so the first stroke already uses device pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);
  }, []);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.preventDefault();
    drawing.current = true;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = getPoint(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const handleConfirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const dataUrl = canvas.toDataURL('image/png');
    await onConfirm(dataUrl);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-app-ink">{label}</p>
        {helperText ? (
          <p className="mt-0.5 text-xs text-app-ink-muted">{helperText}</p>
        ) : null}
      </div>
      <div className="rounded-xl border border-dashed border-app-surface-3 bg-white p-1">
        <canvas
          ref={canvasRef}
          data-testid="signature-canvas"
          aria-label={label}
          role="img"
          className="h-40 w-full touch-none rounded-lg bg-white"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pending || !hasInk}
          onClick={clear}
        >
          {clearLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || pending || !hasInk}
          onClick={handleConfirm}
        >
          {pending ? t('saving') : confirmLabel}
        </Button>
        {errorMessage ? (
          <span className="text-xs text-destructive">{errorMessage}</span>
        ) : null}
      </div>
    </div>
  );
});
