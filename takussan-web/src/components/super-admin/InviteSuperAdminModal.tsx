'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
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
import type { PlatformLevel } from '@/lib/platform-abilities';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-264 — Cooptation invite modal.
 *
 * Surfaces three required fields (email + first/last name) and posts to
 * `/api/admin/super-admins/invite`. The post-invite flow (email → accept →
 * forced 2FA enrollment → role attach) is entirely backend-driven, so the
 * caller only has to refresh the listing on success.
 */
/** Du moins au plus étendu : l'ordre de lecture est l'ordre des privilèges. */
const NIVEAUX: readonly PlatformLevel[] = ['viewer', 'support', 'super_admin'];

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
  // TCK-600 (ADR-0047) — le moindre niveau par défaut : donner plus se choisit.
  const [level, setLevel] = useState<PlatformLevel>('viewer');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const tLevels = useTranslations('superAdmin.operatorLevels');

  const mutation = useMutation({
    mutationFn: () => inviteSuperAdmin({ email, first_name: firstName, last_name: lastName, level }),
    onSuccess: () => {
      toast.add({
        title: t('toastTitle'),
        description: t('toastDescription', { email }),
        type: 'success',
      });
      setEmail('');
      setFirstName('');
      setLastName('');
      setLevel('viewer');
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

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">{tLevels('legend')}</legend>
            {NIVEAUX.map((niveau) => (
              <label key={niveau} className="flex items-start gap-2 rounded-lg p-2 ring-1 ring-border has-[:checked]:ring-primary">
                <input
                  type="radio"
                  name="super-admin-invite-level"
                  value={niveau}
                  checked={level === niveau}
                  onChange={() => setLevel(niveau)}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block text-sm font-semibold text-foreground">{tLevels(`${niveau}.label`)}</span>
                  <span className="block text-xs text-muted-foreground">{tLevels(`${niveau}.hint`)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {error ? <ErrorState message={error} /> : null}

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
