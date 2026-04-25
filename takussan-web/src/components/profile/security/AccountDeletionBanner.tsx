'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cancelAccountDeletionAction } from '@/app/actions/account-deletion';

interface Props {
  daysRemaining: number;
  onCancelled?: () => void;
}

/**
 * TCK-080 — global red banner shown on every authenticated page once a
 * deletion request is active. Day-precise countdown + inline cancel CTA.
 */
export function AccountDeletionBanner({ daysRemaining, onCancelled }: Props) {
  const t = useTranslations('account.deletion.banner');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const message =
    daysRemaining <= 0
      ? t('messageToday')
      : daysRemaining === 1
        ? t('messageSingular')
        : t('message', { days: daysRemaining });

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelAccountDeletionAction();
      if (result.ok) {
        onCancelled?.();
        router.refresh();
      }
    });
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-red-800"
    >
      <div className="flex flex-col">
        <span className="font-semibold">{t('title')}</span>
        <span className="text-sm">{message}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCancel}
        disabled={pending}
        className="border-red-300 text-red-800 hover:bg-red-100"
      >
        {t('cancel')}
      </Button>
    </div>
  );
}
