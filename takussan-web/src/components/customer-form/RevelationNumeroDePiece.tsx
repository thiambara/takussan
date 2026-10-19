'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { fetchCustomerSensitive } from '@/lib/queries/customers';

interface RevelationNumeroDePieceProps {
  readonly customerId: number;
  readonly masque: string;
}

/**
 * TCK-955 (ADR-0070 § 5 et 8) — le geste « Afficher » du numéro de pièce, pour l'admin. L'API
 * tranche de toute façon (`CustomerPolicy::viewSensitive`, 403 sinon) ; un refus de step-up passe
 * par la garde de TCK-589, puis l'appel est rejoué. La valeur vit dans l'état de ce composant et
 * nulle part ailleurs : ni cache React Query, ni stockage du navigateur. « Masquer » l'oublie.
 */
export function RevelationNumeroDePiece({ customerId, masque }: RevelationNumeroDePieceProps) {
  const t = useTranslations('crm.form.idNumberSensitive');
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const [valeur, setValeur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const noticeId = `customer-${customerId}-id-number-notice`;

  async function afficher() {
    if (!token) return;
    setEnCours(true);
    try {
      const res = await avecGardeDoubleFacteur(() => fetchCustomerSensitive(token, customerId), garde);
      setValeur(res.data.id_number ?? masque);
    } catch (error) {
      toast.add({ title: t('errorTitle'), description: messageErreur(error), type: 'error' });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm" data-testid="numero-de-piece">{valeur ?? masque}</span>
        {valeur === null ? (
          <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={afficher} aria-describedby={noticeId}>
            {enCours
              ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              : <Eye className="size-3.5" aria-hidden="true" />}
            {t('reveal')}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setValeur(null)}>
            <EyeOff className="size-3.5" aria-hidden="true" />
            {t('hide')}
          </Button>
        )}
      </div>
      <p id={noticeId} className="text-xs text-pretty text-muted-foreground">{t('notice')}</p>
    </div>
  );
}
