'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { CustomerForm } from '@/components/customer-form';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import type { CustomerDetail } from '@/types/customer';

/**
 * TCK-2589 (lot D) — « Modifier » de la fiche client : le formulaire d'édition, qui vivait dans
 * l'onglet « Aperçu », s'ouvre en feuille (le panneau latéral de 480 px dès `md`, `FeuilleDuBas`).
 * Ouverture en état local (décision 10a). Enregistrée : la feuille se ferme et la page se relit.
 */
export interface ModifierLaFicheProps {
  readonly customer: CustomerDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly peutReveler: boolean;
}

export function ModifierLaFiche({ customer, open, onOpenChange, peutReveler }: ModifierLaFicheProps) {
  const t = useTranslations('crm.fiche.modifier');
  const router = useRouter();
  return (
    <FeuilleDuBas open={open} onOpenChange={onOpenChange} titre={t('titre')}>
      {open ? (
        <CustomerForm
          mode="edit"
          customer={customer}
          compact
          canRevealIdNumber={peutReveler}
          onSuccess={() => {
            onOpenChange(false);
            router.refresh();
          }}
        />
      ) : null}
    </FeuilleDuBas>
  );
}
