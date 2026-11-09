'use client';
import { useTranslations } from 'next-intl';
import { Calendar, FileText, KeyRound, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMontant } from '@/lib/format/currency';
import { cn } from '@/lib/utils';
import type { PropertyDetail } from '@/types/property';
import type { ActionDuContrat } from './actions-de-la-fiche';

/**
 * TCK-2501 — les pièces communes aux trois surfaces d'action de la fiche (barre basse, bloc de
 * contact mobile, carte de réservation de bureau). Les CHOIX (quel canal, quelle action d'abord)
 * sont dans `actions-de-la-fiche.ts` ; ici, seulement le rendu.
 */

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). `court` : la barre basse. */
const CLE_DE_L_ACTION: Record<ActionDuContrat, { readonly long: string; readonly court: string }> = {
  visit: { long: 'requestVisit', court: 'bottomBar.visit' },
  offer: { long: 'primaryCta.offer', court: 'primaryCta.offer' },
  reserve: { long: 'primaryCta.reserve', court: 'primaryCta.reserve' },
  apply: { long: 'primaryCta.apply', court: 'primaryCta.apply' },
};

const ICONE_DE_L_ACTION = { visit: Calendar, offer: KeyRound, reserve: KeyRound, apply: FileText } as const;

interface PropertyActionButtonProps {
  readonly action: ActionDuContrat;
  readonly onRequestVisit: () => void;
  readonly onRequestBooking: () => void;
  readonly variant?: 'default' | 'outline';
  readonly court?: boolean;
  readonly className?: string;
}

export function PropertyActionButton({
  action,
  onRequestVisit,
  onRequestBooking,
  variant = 'default',
  court = false,
  className,
}: PropertyActionButtonProps) {
  const t = useTranslations('property.detail');
  const Icone = ICONE_DE_L_ACTION[action];
  const cle = CLE_DE_L_ACTION[action];
  return (
    <Button
      type="button"
      variant={variant}
      className={cn('h-11 gap-2', className)}
      onClick={action === 'visit' ? onRequestVisit : onRequestBooking}
    >
      <Icone className="size-4" aria-hidden />
      {t(court ? cle.court : cle.long)}
    </Button>
  );
}

export function PropertyCallButton({
  onClick,
  enCours,
  className,
}: {
  readonly onClick: () => void;
  readonly enCours: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('property.detail.agent');
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={enCours}
      className={cn('h-11 gap-2', className)}
      aria-label={t('callAria')}
    >
      <Phone className="size-4" aria-hidden />
      {enCours ? t('calling') : t('call')}
    </Button>
  );
}

/** LA porte « message » de la fiche — une seule par palier (TCK-2501). */
export function PropertyMessageButton({
  onClick,
  court = false,
  variant = 'ghost',
  className,
}: {
  readonly onClick: () => void;
  readonly court?: boolean;
  readonly variant?: 'ghost' | 'outline';
  readonly className?: string;
}) {
  const t = useTranslations('property.detail');
  return (
    <Button type="button" variant={variant} className={cn('h-11 gap-2', className)} onClick={onClick}>
      <MessageCircle className="size-4" aria-hidden />
      {court ? t('actions.write') : t('sendMessage')}
    </Button>
  );
}

/** Décision 3a — le dossier vient APRÈS la visite : une invitation, pas un bouton concurrent. */
export function PropertyApplyAfterVisit({
  onRequestBooking,
  className,
}: {
  readonly onRequestBooking: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('property.detail.actions');
  return (
    <p className={cn('text-center text-sm text-muted-foreground', className)}>
      {t('alreadyVisited')}{' '}
      <button
        type="button"
        onClick={onRequestBooking}
        className="inline-flex min-h-10 items-center font-medium text-foreground underline underline-offset-4"
      >
        {t('submitApplication')}
      </button>
    </p>
  );
}

/** Le prix et sa période — le même rendu en tête de fiche (mobile) et dans la carte (bureau). */
export function PropertyPrice({
  property,
  className,
  periodeClassName,
}: {
  readonly property: Pick<PropertyDetail, 'price' | 'currency' | 'contract_type' | 'rent_period'>;
  readonly className?: string;
  readonly periodeClassName?: string;
}) {
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const periode = property.contract_type === 'rent' ? tPeriods(property.rent_period ?? 'monthly') : null;
  return (
    <p className={cn('font-display font-semibold text-foreground tabular-nums', className)}>
      {formatMontant(property.price, property.currency ?? 'XOF')}
      {periode && (
        <span className={cn('font-sans text-sm font-normal text-muted-foreground', periodeClassName)}> / {periode}</span>
      )}
    </p>
  );
}
