'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useContactMessage } from '@/hooks/useContactMessage';
import { AnonymousLeadDialog } from '@/components/public/AnonymousLeadDialog';
import { submitContactLead } from '@/app/actions/property';

interface PropertyContactMessageDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PropertyContactMessageDialog({
  slug,
  open,
  onOpenChange,
}: PropertyContactMessageDialogProps) {
  const { user } = useAuth();
  if (user) {
    return <AuthenticatedDialog slug={slug} open={open} onOpenChange={onOpenChange} />;
  }
  return <AnonymousDialog slug={slug} open={open} onOpenChange={onOpenChange} />;
}

function AuthenticatedDialog({ slug, open, onOpenChange }: PropertyContactMessageDialogProps) {
  const router = useRouter();
  const { submit, submitting, error } = useContactMessage(slug);
  const t = useTranslations('publicContact');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      const { redirect_to } = await submit(message.trim());
      onOpenChange(false);
      setMessage('');
      router.push(redirect_to);
    } catch {
      // error already tracked by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            required
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('messagePlaceholder')}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !message.trim()}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * TCK-441 — le formulaire lui-même vit dans `AnonymousLeadDialog`, partagé avec la fiche
 * d'agent. Ne reste ici que ce qui est propre au bien : la destination de la piste.
 */
function AnonymousDialog({ slug, open, onOpenChange }: PropertyContactMessageDialogProps) {
  return (
    <AnonymousLeadDialog
      open={open}
      onOpenChange={onOpenChange}
      idPrefix="lead"
      onSubmit={(payload) => submitContactLead(slug, payload)}
    />
  );
}
