'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useReportProperty } from '@/hooks/useReportProperty';
import type { ReportPayload } from '@/types/visit';

interface PropertyReportButtonProps {
  slug: string;
}

const REASON_KEYS: Array<{ value: ReportPayload['reason']; cle: string }> = [
  { value: 'spam', cle: 'spam' },
  { value: 'misleading', cle: 'misleading' },
  { value: 'fraud', cle: 'fraud' },
  { value: 'inappropriate_content', cle: 'inappropriate' },
  { value: 'other', cle: 'other' },
];

export function PropertyReportButton({ slug }: PropertyReportButtonProps) {
  const t = useTranslations('property.report');
  const REASONS = REASON_KEYS.map((r) => ({ value: r.value, label: t(`reasons.${r.cle}`) }));
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [reason, setReason] = useState<ReportPayload['reason']>('spam');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const { submit, submitting, error } = useReportProperty(slug);

  function handleClick(): void {
    if (!user) {
      setShowAuthGate(true);
      return;
    }
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await submit({ reason, details: details.trim() || undefined });
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setDetails('');
        setReason('spam');
      }, 1500);
    } catch {
      // error already tracked by hook
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors"
      >
        <Flag className="size-3.5" aria-hidden />
        {t('trigger')}
      </button>

      {/* Auth gate dialog */}
      <Dialog open={showAuthGate} onOpenChange={setShowAuthGate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('loginTitle')}</DialogTitle>
            <DialogDescription>{t('loginBody')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowAuthGate(false)}>
              {t('cancel')}
            </Button>
            <Link
              href={`/auth/login?redirect=/properties/${slug}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 h-8 text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              {t('signIn')}
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report form dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogBodyFull')}</DialogDescription>
          </DialogHeader>
          {sent ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              {t('sent')}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span className="text-stone-700">{t('reasonLabel')}</span>
                <Select
                  value={reason}
                  onValueChange={(v) => setReason((v as ReportPayload['reason']) ?? 'spam')}
                  items={REASONS}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-stone-700">{t('detailsLabel')}</span>
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={t('detailsPlaceholder')}
                  rows={3}
                  maxLength={1000}
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('sending') : t('submit')}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
