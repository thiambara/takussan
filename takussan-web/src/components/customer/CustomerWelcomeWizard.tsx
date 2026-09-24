'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Heart, MessagesSquare, Search } from 'lucide-react';

import { WelcomeIllustration } from '@/components/welcome/WelcomeIllustration';
import { WelcomeModal } from '@/components/welcome/WelcomeModal';
import { useWelcomeOnce } from '@/hooks/useWelcomeOnce';

/**
 * TCK-253 — Customer-facing welcome wizard.
 *
 * Three-slide intro shown once after first login. Reuses the generic
 * `<WelcomeModal>` and `useWelcomeOnce` from TCK-251 — this file is
 * pure composition (slide content + welcome key). Skip is non-blocking
 * by construction (the hook posts the key on dismiss).
 */
export function CustomerWelcomeWizard() {
  const t = useTranslations('customer.welcome');

  const slides = useMemo(
    () => [
      {
        illustration: <WelcomeIllustration icon={Search} />,
        title: t('slides.0.title'),
        body: t('slides.0.body'),
      },
      {
        illustration: <WelcomeIllustration icon={Heart} />,
        title: t('slides.1.title'),
        body: t('slides.1.body'),
      },
      {
        illustration: <WelcomeIllustration icon={MessagesSquare} />,
        title: t('slides.2.title'),
        body: t('slides.2.body'),
      },
    ],
    [t],
  );

  const welcome = useWelcomeOnce('customer-welcome', slides);

  return <WelcomeModal {...welcome} />;
}
