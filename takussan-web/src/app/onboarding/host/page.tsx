/**
 * TCK-254 — placeholder for the host-individual wizard (TCK-255).
 *
 * The universal "Publier" CTA routes here whenever an authenticated user has
 * no agency_admin / agent profile. TCK-255 will replace this stub with the
 * 5-step wizard that creates the `Agency.kind=individual` + linked profiles
 * + first draft Property in one shot. Until then we render a calm holding
 * page so the flow doesn't 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Publier mon premier bien' };

export default function HostOnboardingStubPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-background px-6 py-16">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-6" aria-hidden="true" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Publier votre premier bien
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Le parcours guidé pour créer votre agence individuelle et publier
          votre premier bien arrive très prochainement (TCK-255). En attendant,
          revenez à l&apos;accueil ou explorez les biens déjà publiés.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            Retour à l&apos;accueil
          </Link>
          <Link href="/properties" className={buttonVariants()}>
            Découvrir les biens
          </Link>
        </div>
      </div>
    </main>
  );
}
