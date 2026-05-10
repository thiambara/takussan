'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { WelcomeModal } from '@/components/welcome/WelcomeModal';
import { useWelcomeOnce } from '@/hooks/useWelcomeOnce';

/**
 * TCK-259 — Agent-facing welcome modale.
 *
 * Three-slide intro shown once after the post-acceptance onboarding
 * wizard completes. Mirror of `<OwnerWelcomeWizard>` (TCK-257) — pure
 * composition over the generic `<WelcomeModal>` + `useWelcomeOnce`
 * (TCK-251).
 *
 * Mounting is gated server-side by `<AppShell>` so we never paint it
 * for non-agent roles. Skip is non-blocking by construction.
 */
export function AgentWelcomeWizard() {
  const t = useTranslations('agentWelcome.slides');

  const slides = useMemo(
    () => [
      { title: t('leads.title'), body: t('leads.body') },
      { title: t('properties.title'), body: t('properties.body') },
      { title: t('messages.title'), body: t('messages.body') },
    ],
    [t],
  );

  const welcome = useWelcomeOnce('agent-welcome', slides);

  return <WelcomeModal {...welcome} />;
}
