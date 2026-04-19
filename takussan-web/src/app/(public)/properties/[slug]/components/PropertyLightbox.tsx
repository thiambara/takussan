'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { PropertyPhoto } from '@/types/property';

interface PropertyLightboxProps {
  photos: PropertyPhoto[];
  open: boolean;
  startIndex: number;
  onClose: () => void;
  title: string;
}

export function PropertyLightbox({ photos, open, startIndex, onClose, title }: PropertyLightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [lastStart, setLastStart] = useState(startIndex);
  const [lastOpen, setLastOpen] = useState(open);

  // Reset index when the lightbox opens or the requested start index changes.
  if (open !== lastOpen || startIndex !== lastStart) {
    setLastOpen(open);
    setLastStart(startIndex);
    if (open) setIndex(startIndex);
  }

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % photos.length);
  }, [photos.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + photos.length) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent): void {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, next, prev]);

  if (photos.length === 0) return null;
  const current = photos[index];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/90 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col outline-none">
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-sm">
              {index + 1} / {photos.length}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="rounded-full p-2 hover:bg-white/10 transition-colors"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="relative flex-1">
            <Image
              src={current.original}
              alt={`${title} - photo ${index + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Photo précédente"
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronLeft className="size-6" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Photo suivante"
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronRight className="size-6" aria-hidden />
                </button>
              </>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
