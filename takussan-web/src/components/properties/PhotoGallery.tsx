'use client';
import Image from 'next/image';
import { useState } from 'react';

interface Props {
  photos: string[];
  title: string;
}

export function PhotoGallery({ photos, title }: Props) {
  const [active, setActive] = useState(0);
  const list = photos.length > 0
    ? photos
    : ['https://placehold.co/800x533/e7e5e4/a8a29e?text=Aucune+photo'];

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-stone-200">
        <Image
          src={list[active]}
          alt={`${title} — photo ${active + 1}`}
          fill
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
          priority
        />
      </div>

      {list.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((url, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative flex-none w-20 h-14 rounded-lg overflow-hidden border-2 transition-colors duration-150 ${
                i === active
                  ? 'border-slate-700'
                  : 'border-transparent hover:border-stone-300'
              }`}
            >
              <Image
                src={url}
                alt={`Miniature ${i + 1}`}
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
