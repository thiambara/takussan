'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  cancelAccountDeletionAction,
  getAccountDeletionRequestAction,
} from '@/app/actions/account-deletion';
import { AccountDeletionDialog } from './AccountDeletionDialog';
import type { AccountDeletionRequest } from '@/lib/account-deletion';

interface Props {
  twoFactorEnabled: boolean;
}

/**
 * TCK-080 — settings section for the RGPD deletion lifecycle.
 *
 *  - No pending request: red CTA opens the 2-step dialog.
 *  - Pending request: shows the scheduled date + a cancel button (the
 *    full-page banner is rendered separately in the layout).
 */
export function AccountDeletionSection({ twoFactorEnabled }: Props) {
  const t = useTranslations('account.deletion.section');
  const tDialog = useTranslations('account.deletion.dialog');
  const tBanner = useTranslations('account.deletion.banner');
  const router = useRouter();

  const [request, setRequest] = useState<AccountDeletionRequest | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getAccountDeletionRequestAction();
      if (cancelled) return;
      setRequest(result.ok ? result.data : null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleScheduled(req: AccountDeletionRequest) {
    setRequest(req);
    setOpen(false);
    router.refresh();
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelAccountDeletionAction();
      if (result.ok) {
        setRequest(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-red-700">{t('title')}</h3>
          <p className="mt-1 text-sm text-app-ink-muted">{t('description')}</p>
        </div>
      </div>

      {request === undefined ? null : request === null ? (
        <div className="mt-4">
          <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
            {t('cta')}
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">{tBanner('title')}</p>
          <p className="text-sm">
            {tDialog('successBody', { days: String(request.days_remaining) })}
          </p>
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={pending}
              className="border-red-300 text-red-800 hover:bg-red-100"
            >
              {tBanner('cancel')}
            </Button>
          </div>
        </div>
      )}

      <AccountDeletionDialog
        open={open}
        onOpenChange={setOpen}
        twoFactorEnabled={twoFactorEnabled}
        onScheduled={handleScheduled}
      />
    </div>
  );
}
