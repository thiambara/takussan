'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';

import { TotpEnrollment } from '@/components/auth/TotpEnrollment';
import { useAuth } from '@/context/AuthContext';

interface EnrolementDoubleFacteurExigeProps {
  /** Pourquoi on demande : le texte l'explique, un écran muet ressemblait à une panne. */
  readonly motif: 'reconfigure' | 'superAdmin';
  readonly destination: string;
}

/** TCK-589 — `/onboarding/securite` : l'enrôlement TOTP sans « Plus tard ». */
export function EnrolementDoubleFacteurExige({ motif, destination }: EnrolementDoubleFacteurExigeProps) {
  const t = useTranslations('auth.twoFactorGate');
  const router = useRouter();
  const { refreshUser } = useAuth();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-2">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-6" aria-hidden />
        </div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-balance">
          {motif === 'reconfigure' ? t('reconfigureTitle') : t('superAdminTitle')}
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          {motif === 'reconfigure' ? t('reconfigureBody') : t('superAdminBody')}
        </p>
      </div>
      <TotpEnrollment
        mode="forced"
        onComplete={async () => {
          await refreshUser();
          router.replace(destination);
          router.refresh();
        }}
      />
    </main>
  );
}
