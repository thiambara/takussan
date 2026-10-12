'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCan } from '@/hooks/useCan';
import { BoostDialog } from './BoostDialog';
import { PARAMETRE_BOOSTER } from './parametre-booster';

export interface BoostButtonProps {
  readonly propertyId: number;
  readonly propertyTitle: string;
  /** Seul un bien publié et visible se booste (l'API le refuse sinon : `boost.property_not_public`). */
  readonly isPublic: boolean;
  /**
   * La fiche est ouverte avec `?booster=1` : le dialogue s'ouvre seul. C'est ce que demande le
   * « Booster » du message de confirmation de publication (`LienBoosterApresPublication`).
   */
  readonly ouvrirDemande?: boolean;
}

/** Retire `?booster=1` de l'adresse, sans navigation : un rechargement ne rouvrira pas le dialogue. */
function oublierLaDemande() {
  const adresse = new URL(window.location.href);
  if (!adresse.searchParams.has(PARAMETRE_BOOSTER)) return;
  adresse.searchParams.delete(PARAMETRE_BOOSTER);
  window.history.replaceState(window.history.state, '', `${adresse.pathname}${adresse.search}${adresse.hash}`);
}

/**
 * TCK-633 lot F (ADR-0061 §5) — « Booster » : présent pour qui détient `boost.spend`, sur un bien
 * public. Le dialogue n'est MONTÉ qu'ouvert : fermé, il ne demande rien au réseau.
 */
export function BoostButton({ propertyId, propertyTitle, isPublic, ouvrirDemande = false }: BoostButtonProps) {
  const t = useTranslations('boost');
  const { can } = useCan('boost.spend');
  const [ouvert, setOuvert] = useState(ouvrirDemande);
  // La demande peut arriver APRÈS le montage : le lien du message mène à la fiche déjà ouverte,
  // par une navigation douce qui garde ce composant. On l'ajuste pendant le rendu, sur le front
  // montant de la prop, et non dans un effet.
  const [demandeVue, setDemandeVue] = useState(ouvrirDemande);
  if (ouvrirDemande !== demandeVue) {
    setDemandeVue(ouvrirDemande);
    if (ouvrirDemande) setOuvert(true);
  }

  if (!can || !isPublic) return null;

  const changer = (o: boolean) => {
    setOuvert(o);
    if (!o) oublierLaDemande();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Rocket aria-hidden="true" />
        {t('button')}
      </Button>
      {ouvert ? (
        <BoostDialog propertyId={propertyId} propertyTitle={propertyTitle} open={ouvert} onOpenChange={changer} />
      ) : null}
    </>
  );
}
