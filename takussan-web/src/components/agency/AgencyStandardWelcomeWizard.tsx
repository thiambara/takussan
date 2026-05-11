'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { WelcomeModal } from '@/components/welcome/WelcomeModal';
import { useAgencyStandardWelcomeOnce } from '@/hooks/useAgencyStandardWelcomeOnce';

/**
 * TCK-269 — Agency-admin welcome wizard fired once per admin after the
 * agency upgrade (`individual → standard`) has been approved.
 *
 * Three slides: invite team / configure roles / access reports. Pure
 * composition over `<WelcomeModal>` (TCK-251) and
 * `useAgencyStandardWelcomeOnce` — mounted by `<AppShell>` behind an
 * `isAgencyAdmin` gate so we never paint it for other roles.
 */
export function AgencyStandardWelcomeWizard() {
  const t = useTranslations('agency.standardWelcome');
  const welcome = useAgencyStandardWelcomeOnce();

  const slides = useMemo(
    () => [
      { title: t('slides.invite.title'), body: t('slides.invite.body') },
      { title: t('slides.roles.title'), body: t('slides.roles.body') },
      { title: t('slides.reports.title'), body: t('slides.reports.body') },
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
