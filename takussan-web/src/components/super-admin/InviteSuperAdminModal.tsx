'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { inviteSuperAdmin } from '@/lib/queries/super-admin';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-264 — Cooptation invite modal.
 *
 * Surfaces three required fields (email + first/last name) and posts to
 * `/api/admin/super-admins/invite`. The post-invite flow (email → accept →
 * forced 2FA enrollment → role attach) is entirely backend-driven, so the
 * caller only has to refresh the listing on success.
 */
export interface InviteSuperAdminModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onInvited?: () => void;
}

export function InviteSuperAdminModal({ open, onOpenChange, onInvited }: InviteSuperAdminModalProps) {
  const t = useTranslations('superAdmin.inviteModal');
  const messageErreur = useMessageErreurApi();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: () => inviteSuperAdmin({ email, first_name: firstName, last_name: lastName }),
    onSuccess: () => {
      toast.add({
        title: t('toastTitle'),
        description: t('toastDescription', { email }),
        type: 'success',
      });
      setEmail('');
      setFirstName('');
      setLastName('');
      setError(null);
      onInvited?.();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setError(messageErreur(e, t('sendError')));
      } else {
        setError(t('sendError'));
      }
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="super-admin-invite-email">{t('email')}</Label>
            <Input
              id="super-admin-invite-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="super-admin-invite-first-name">{t('firstName')}</Label>
              <Input
                id="super-admin-invite-first-name"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="super-admin-invite-last-name">{t('lastName')}</Label>
              <Input
                id="super-admin-invite-last-name"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>{t('sending')}</span>
                </>
              ) : (
                <span>{t('submit')}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
