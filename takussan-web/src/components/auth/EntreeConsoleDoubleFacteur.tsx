'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';

import { BarreDeMarque } from '@/components/brand/BarreDeMarque';
import { EnrolementDoubleFacteurExige } from '@/components/auth/EnrolementDoubleFacteurExige';
import { PreuveRecente } from '@/components/auth/GardeDoubleFacteur';
import type { CodeDoubleFacteur } from '@/lib/double-facteur';

interface EntreeConsoleDoubleFacteurProps {
  readonly code: CodeDoubleFacteur;
}

/**
 * TCK-1203 — l'entrée de la console plateforme refusée faute de second facteur (`EnsureSuperAdmin`).
 *
 * Sans 2FA sur le compte : l'enrôlement, comme `/onboarding/securite` — dont le juge ne connaît que
 * le rôle `super_admin` et renverrait un `viewer` ou un `support` ailleurs. 2FA présente mais pas
 * vue par CE jeton : le code récent, puis la console se relit.
 */
export function EntreeConsoleDoubleFacteur({ code }: EntreeConsoleDoubleFacteurProps) {
  const t = useTranslations('auth.twoFactorGate');
  const router = useRouter();

  if (code === 'two_factor_required') {
    return <EnrolementDoubleFacteurExige motif="superAdmin" destination="/super-admin" />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <BarreDeMarque largeur="max-w-lg" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-10">
        <div className="space-y-2">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-6" aria-hidden />
          </div>
          <h1 className="font-headline text-2xl font-bold tracking-tight text-balance">{t('stepUpTitle')}</h1>
          <p className="text-sm text-muted-foreground text-pretty">{t('consoleStepUpBody')}</p>
        </div>
        <PreuveRecente onValide={() => router.refresh()} onAnnuler={() => router.replace('/app')} />
      </main>
    </div>
  );
}
