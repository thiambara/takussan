'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ChartColumn, ShieldCheck, UserPlus } from 'lucide-react';

import { WelcomeIllustration } from '@/components/welcome/WelcomeIllustration';
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
      {
        illustration: <WelcomeIllustration icon={UserPlus} />,
        title: t('slides.invite.title'),
        body: t('slides.invite.body'),
      },
      {
        illustration: <WelcomeIllustration icon={ShieldCheck} />,
        title: t('slides.roles.title'),
        body: t('slides.roles.body'),
      },
      {
        illustration: <WelcomeIllustration icon={ChartColumn} />,
        title: t('slides.reports.title'),
        body: t('slides.reports.body'),
      },
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
