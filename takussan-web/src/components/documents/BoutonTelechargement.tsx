'use client';

import type { ComponentProps, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTelechargementApi } from '@/hooks/useTelechargementApi';
import { cn } from '@/lib/utils';

/**
 * TCK-593 (Partie 1) — bouton de téléchargement d'un document protégé de l'API (contrat de bail,
 * reçu d'acompte, quittance). Le mécanisme vit dans `useTelechargementApi` ; ce composant ne fait
 * qu'en montrer l'état : libellé « Téléchargement… » pendant la requête, message traduit en cas
 * d'échec.
 */
export interface BoutonTelechargementProps {
  /** Chemin de l'API, `/api` compris. */
  readonly chemin: string;
  readonly nomFichier: string;
  readonly children: ReactNode;
  readonly variant?: ComponentProps<typeof Button>['variant'];
  readonly size?: ComponentProps<typeof Button>['size'];
  readonly className?: string;
}

export function BoutonTelechargement({
  chemin,
  nomFichier,
  children,
  variant = 'outline',
  size,
  className,
}: BoutonTelechargementProps) {
  const t = useTranslations('documents.download');
  const { telecharger, enCours, echec } = useTelechargementApi();

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(className)}
        onClick={() => void telecharger(chemin, nomFichier)}
        disabled={enCours}
        aria-busy={enCours}
      >
        <Download data-icon="inline-start" aria-hidden="true" />
        {enCours ? t('inProgress') : children}
      </Button>
      {echec && (
        <span role="alert" className="text-xs text-destructive">
          {t(`errors.${echec}`)}
        </span>
      )}
    </span>
  );
}
