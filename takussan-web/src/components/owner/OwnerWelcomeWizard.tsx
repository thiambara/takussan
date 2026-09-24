'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { House, MessagesSquare, Wallet } from 'lucide-react';

import { WelcomeIllustration } from '@/components/welcome/WelcomeIllustration';
import { WelcomeModal } from '@/components/welcome/WelcomeModal';
import { useWelcomeOnce } from '@/hooks/useWelcomeOnce';

/**
 * TCK-257 — Owner-facing welcome modale.
 *
 * Three-slide intro shown once after the post-acceptance onboarding
 * wizard completes. Mirrors `<CustomerWelcomeWizard>` (TCK-253) and
 * `<TenantWelcomeWizard>` (TCK-265) — pure composition over the
 * generic `<WelcomeModal>` + `useWelcomeOnce` (TCK-251).
 *
 * Mounting is gated server-side by `<AppShell>` so we never paint it
 * for non-owner roles. Skip is non-blocking by construction.
 */
export function OwnerWelcomeWizard() {
  const t = useTranslations('ownerWelcome.slides');

  const slides = useMemo(
    () => [
      {
        illustration: <WelcomeIllustration icon={House} />,
        title: t('properties.title'),
        body: t('properties.body'),
      },
      {
        illustration: <WelcomeIllustration icon={Wallet} />,
        title: t('payments.title'),
        body: t('payments.body'),
      },
      {
        illustration: <WelcomeIllustration icon={MessagesSquare} />,
        title: t('messages.title'),
        body: t('messages.body'),
      },
    ],
    [t],
  );

  const welcome = useWelcomeOnce('owner-welcome', slides);

  return <WelcomeModal {...welcome} />;
}
