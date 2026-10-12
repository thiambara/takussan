'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCan } from '@/hooks/useCan';
import { BoostDialog } from './BoostDialog';

export interface BoostButtonProps {
  readonly propertyId: number;
  readonly propertyTitle: string;
  /** Seul un bien publié et visible se booste (l'API le refuse sinon : `boost.property_not_public`). */
  readonly isPublic: boolean;
}

/**
 * TCK-633 lot F (ADR-0061 §5) — « Booster » : présent pour qui détient `boost.spend`, sur un bien
 * public. Le dialogue n'est MONTÉ qu'ouvert : fermé, il ne demande rien au réseau.
 */
export function BoostButton({ propertyId, propertyTitle, isPublic }: BoostButtonProps) {
  const t = useTranslations('boost');
  const { can } = useCan('boost.spend');
  const [ouvert, setOuvert] = useState(false);

  if (!can || !isPublic) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Rocket aria-hidden="true" />
        {t('button')}
      </Button>
      {ouvert ? (
        <BoostDialog propertyId={propertyId} propertyTitle={propertyTitle} open={ouvert} onOpenChange={setOuvert} />
      ) : null}
    </>
  );
}
