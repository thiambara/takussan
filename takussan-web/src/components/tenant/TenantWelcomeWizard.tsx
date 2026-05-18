'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { WelcomeModal } from '@/components/welcome/WelcomeModal';
import { useTenantWelcomeOnce } from '@/hooks/useTenantWelcomeOnce';

/**
 * TCK-265 — Tenant-facing welcome wizard.
 *
 * Three-slide intro (paiements / intervention / documents) shown once
 * per active lease, the first time the tenant lands on the dashboard
 * after signature. Reuses `<WelcomeModal>` (TCK-251) and
 * `useTenantWelcomeOnce` — this file is pure composition (slide content
 * + lease-scoped key).
 */
export function TenantWelcomeWizard() {
  const t = useTranslations('tenant.welcome');
  const welcome = useTenantWelcomeOnce();

  const slides = useMemo(
    () => [
      { title: t('slides.0.title'), body: t('slides.0.body') },
      { title: t('slides.1.title'), body: t('slides.1.body') },
      { title: t('slides.2.title'), body: t('slides.2.body') },
    ],
    [t],
  );

  return (
    <WelcomeModal
      open={welcome.open}
      slides={slides}
      onComplete={welcome.onComplete}
      onSkip={welcome.onSkip}
    />
  );
}
