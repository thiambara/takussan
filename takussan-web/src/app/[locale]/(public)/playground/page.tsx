'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProperties } from '@/hooks/useProperties';
import { useUserLocation } from '@/components/providers/UserLocationProvider';
import { PropertyRowLocal } from '@/components/playground/PropertyRowLocal';
import { BogolanPattern } from '@/components/playground/BogolanPattern';
import { PaletteSwitcher, type PaletteKey, PALETTES } from '@/components/playground/PaletteSwitcher';
import { TypographySwitcher, type TypoKey } from '@/components/playground/TypographySwitcher';
import './playground.css';

/**
 * POC — design system "Ancrage Local Contemporain".
 * - 4 rangées avec 4 variantes de carte (standard, wide, overlay, compact)
 * - 7 palettes switchables au runtime via `data-palette`
 * - 3 typographies switchables via `data-typo`
 * - Photos de fallback via picsum.photos (seed déterministe).
 */
export default function PlaygroundPage() {
  const [palette, setPalette] = useState<PaletteKey>('sahel');
  const [typo, setTypo] = useState<TypoKey>('contemporain');

  const { city: nearCity } = useUserLocation();
  const near     = useProperties({ city: nearCity, perPage: 10 });
  const rent     = useProperties({ transaction: 'rent', perPage: 10 });
  const featured = useProperties({ featured: true, perPage: 10 });
  const latest   = useProperties({ sort: 'latest', perPage: 10 });

  const paletteName = PALETTES.find((p) => p.key === palette)?.name ?? 'Sahel';

  return (
    <div className="playground-root min-h-screen" data-palette={palette} data-typo={typo}>
      {/* ─── Top bar ─────────────────────────────────────────────────── */}
      <header className="border-b border-[var(--pg-hairline)]/60 bg-[var(--pg-sand)] sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="pg-display text-[22px] font-semibold tracking-tight text-[var(--pg-ink)] leading-none shrink-0">
              Takussan
            </Link>
            <span className="pg-eyebrow hidden lg:inline-flex items-center gap-2 text-[var(--pg-ink-muted)] truncate">
              <span className="inline-block size-[6px] rounded-full bg-[var(--pg-accent)]" />
              POC · <span className="text-[var(--pg-ink)]">{paletteName}</span>
            </span>
          </div>

          <div className="flex items-center gap-3 md:gap-5 shrink-0">
            <TypographySwitcher active={typo} onChange={setTypo} />
            <PaletteSwitcher active={palette} onChange={setPalette} />

            <div className="hidden md:flex items-center gap-3 pl-3 border-l border-[var(--pg-hairline)]">
              <Link
                href="/auth/login"
                className="text-[14px] font-medium text-[var(--pg-ink)] hover:text-[var(--pg-accent)] transition-colors"
              >
                Connexion
              </Link>
              <Link
                href="/auth/login?redirect=/app"
                className="inline-flex items-center px-4 py-2 rounded-full bg-[var(--pg-ink)] text-[var(--pg-cream)] text-[14px] font-semibold hover:bg-[var(--pg-accent)] transition-colors"
              >
                Publier
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Sections de découverte ─────────────────────────────────── */}
      <main className="max-w-[1440px] mx-auto px-6 md:px-12 pt-12 pb-24 space-y-20">
        <div className="pg-section-enter" style={{ animationDelay: '40ms' }}>
          <PropertyRowLocal
            variant="standard"
            eyebrow="Près de toi"
            title={`À découvrir à ${nearCity}`}
            viewAllHref={`/properties?city=${encodeURIComponent(nearCity)}`}
            properties={near.properties}
            loading={near.loading}
            error={near.error}
          />
        </div>

        <div className="pg-section-enter" style={{ animationDelay: '120ms' }}>
          <PropertyRowLocal
            variant="wide"
            eyebrow="À louer"
            title="Pour ton prochain logement"
            viewAllHref="/properties?contract_type=rent"
            properties={rent.properties}
            loading={rent.loading}
            error={rent.error}
          />
        </div>

        {/* Rangée signature — fond cream + pattern bogolan stylisé. */}
        <section className="pg-section-enter relative" style={{ animationDelay: '200ms' }}>
          <div className="pg-pattern-host absolute inset-x-[-12px] inset-y-[-32px] md:inset-x-[-24px] md:inset-y-[-48px] -z-10 rounded-[28px] overflow-hidden">
            <div className="absolute inset-0 opacity-[0.045] text-[var(--pg-ink)]">
              <BogolanPattern className="w-full h-full" color="currentColor" />
            </div>
          </div>

          <PropertyRowLocal
            variant="overlay"
            eyebrow="Coup de cœur"
            title="Sélection de la semaine"
            viewAllHref="/properties?featured=true"
            properties={featured.properties}
            loading={featured.loading}
            error={featured.error}
          />
        </section>

        <div className="pg-section-enter" style={{ animationDelay: '280ms' }}>
          <PropertyRowLocal
            variant="compact"
            eyebrow="Nouveau"
            title="Tout juste publié"
            viewAllHref="/properties?sort=created_desc"
            properties={latest.properties}
            loading={latest.loading}
            error={latest.error}
          />
        </div>
      </main>

      {/* ─── Pied minimal ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--pg-hairline)]/60 bg-[var(--pg-sand)]">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-8 flex items-center justify-between gap-4 text-[13px] text-[var(--pg-ink-muted)]">
          <span>© Takussan — POC playground</span>
          <span className="pg-eyebrow text-[var(--pg-accent)] truncate">
            <span className="pg-eyebrow-mark" /> Palette {paletteName} · Typo {typo}
          </span>
        </div>
      </footer>
    </div>
  );
}
