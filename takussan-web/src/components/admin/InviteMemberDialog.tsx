'use client';

import { useEffect } from 'react';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { addAgencyMember, type AgencyMemberRole } from '@/lib/queries/agency-members';
import { useApiForm } from '@/hooks/useApiForm';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const schema = z.object({
  email: z.string().email('Email invalide.'),
  role: z.enum(['agent', 'agency_admin']),
});

type FormValues = z.infer<typeof schema>;

interface InviteMemberDialogProps {
  readonly agencyId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function InviteMemberDialog({
  agencyId,
  open,
  onOpenChange,
  onSuccess,
}: InviteMemberDialogProps) {
  const { token } = useAuth();

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    FormValues,
    unknown
  >({
    schema,
    defaultValues: { email: '', role: 'agent' },
    onSubmit: async (values) => {
      return addAgencyMember(
        agencyId,
        { email: values.email, role: values.role as AgencyMemberRole },
        token ?? '',
      );
    },
    onSuccess: () => {
      onSuccess?.();
      onOpenChange(false);
      form.reset();
    },
  });

  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  const {
    register,
    formState: { errors },
  } = form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un agent</DialogTitle>
          <DialogDescription>
            Saisissez l&apos;email d&apos;un utilisateur déjà inscrit. Il sera
            ajouté à votre agence avec le rôle choisi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="invite-email" className="text-xs font-semibold text-app-ink">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              autoComplete="email"
              placeholder="jane@exemple.sn"
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              {...register('email')}
            />
            {errors.email ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {errors.email.message}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="invite-role" className="text-xs font-semibold text-app-ink">
              Rôle
            </label>
            <select
              id="invite-role"
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              {...register('role')}
            >
              <option value="agent">Agent</option>
              <option value="agency_admin">Administrateur</option>
            </select>
          </div>

          {globalError ? (
            <p className="text-sm text-destructive" role="alert">
              {globalError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Inviter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
