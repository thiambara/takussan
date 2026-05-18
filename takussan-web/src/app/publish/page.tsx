'use client';

/**
 * TCK-254 — `/publish` is the universal landing for the header "Publier" CTA.
 *
 * It is intentionally lightweight: a client page that resolves
 * `usePublishIntent()` and immediately replaces the URL with the right
 * target. The visual is a calm loading state aligned with `docs/design-
 * guidelines.md` (Lin background, calligraphic display font, single
 * primary action — here the loader is the action).
 *
 * It also tears down any persisted `publishIntent` flag once the routing
 * decision has been made, so subsequent navigation doesn't trigger a
 * spurious re-route after auth.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { usePublishIntent } from '@/hooks/usePublishIntent';
import { clearPublishIntent } from '@/lib/publish-intent';

export default function PublishPage() {
  const router = useRouter();
  const decision = usePublishIntent();

  useEffect(() => {
    if (!decision.target) return;
    // Clear the persisted intent before navigating so a subsequent visit
    // (after the user lands somewhere else and hits Publier again) starts
    // from a clean slate.
    clearPublishIntent();
    router.replace(decision.target);
  }, [decision.target, router]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Préparation de votre annonce…
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Nous vous emmenons au bon endroit pour publier votre bien.
        </p>
      </div>
    </main>
  );
}
