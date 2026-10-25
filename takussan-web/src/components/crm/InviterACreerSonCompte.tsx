'use client';

import { useMutation } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { inviteCustomerToAccount } from '@/lib/queries/customers';

interface InviterACreerSonCompteProps {
  readonly customerId: number;
}

/**
 * P15.01 (TCK-2351) — « inviter le locataire à créer son compte », depuis une fiche sans compte.
 *
 * Une fiche saisie par l'agence n'avait jamais de compte : sur son bail, « Demander la signature »
 * rendait 422, et l'espace du locataire restait vide. L'API envoie un lien à usage unique à la
 * coordonnée de la fiche, et relie le compte à l'acceptation. L'écran ne juge rien : il affiche le
 * refus de l'API tel qu'elle le dit (fiche déjà liée, aucune coordonnée, invitation en attente).
 */
export function InviterACreerSonCompte({ customerId }: InviterACreerSonCompteProps) {
  const t = useTranslations('crm.customerDetail.inviteAccount');
  const { token } = useAuth();
  const messageErreur = useMessageErreurApi();

  const mutation = useMutation({
    mutationFn: () => inviteCustomerToAccount(token ?? '', customerId),
  });

  if (mutation.isSuccess) {
    return (
      <p role="status" className="max-w-prose text-sm text-muted-foreground">
        {t('sent')}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        <UserPlus aria-hidden="true" />
        {mutation.isPending ? t('sending') : t('action')}
      </Button>
      {mutation.error ? (
        <p role="alert" className="max-w-prose text-sm text-destructive">
          {messageErreur(mutation.error, t('failed'))}
        </p>
      ) : null}
    </div>
  );
}
