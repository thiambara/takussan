'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus, FilePlus2, Phone } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { LigneDeListe } from '@/components/ui/ligne-de-liste';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { agenceDuBien } from '@/lib/visites/agence-du-bien';
import type { PropertyDetail } from '@/types/property';

import { nomDuLocataire } from './PiecesDeLaLocation';

/** Les deux gestes de la barre : un secondaire (contour) et un principal (plein). */
type Geste = 'signaler' | 'contacter' | 'voirLeBail' | 'planifier' | 'creerUnBail' | 'publier' | 'modifierLAnnonce';

/**
 * Les gestes de la barre selon l'état du bien (AC5 : jamais plus de deux). La maquette définit le bien
 * occupé (« Signaler un problème » + « Contacter le locataire ») et le bien vacant (« Planifier une
 * visite » + « Créer un bail ») ; les autres cas suivent la même règle — le geste qui fait avancer
 * le bien en principal, ce que l'appelant ne peut pas faire n'est pas rendu :
 *  · occupé, locataire injoignable ou bail illisible : « Voir le bail » remplace « Contacter » ;
 *  · vacant, hors personnel (le bailleur) : « Publier l'annonce » (s'il n'est pas en ligne) remplace
 *    « Planifier une visite », réservée au personnel actif de l'agence du bien ;
 *  · à vendre (sans bail) : « Planifier une visite » (personnel) + « Modifier l'annonce ».
 */
export function gestesDeLaBarre(property: PropertyDetail, personnelActif: boolean): readonly Geste[] {
  const occupation = property.occupancy ?? null;
  const occupe = occupation?.state === 'occupied' || occupation?.state === 'notice';
  if (occupe) {
    const joignable = nomDuLocataire(occupation) !== null && isReachable(occupation?.tenant?.phone ?? null);
    if (joignable) return ['signaler', 'contacter'];
    return occupation?.lease ? ['signaler', 'voirLeBail'] : ['signaler'];
  }
  if (!occupation || occupation.state === 'not_rental') {
    return personnelActif ? ['planifier', 'modifierLAnnonce'] : ['modifierLAnnonce'];
  }
  if (personnelActif) return ['planifier', 'creerUnBail'];
  return property.is_online === false ? ['publier', 'creerUnBail'] : ['creerUnBail'];
}

/**
 * TCK-2639 — la barre collée du bas, au téléphone (`BarreDAction`, rendue sous `md` seulement) : deux
 * gestes au plus, le reste dans « ⋯ » (la feuille de l'en-tête du téléphone, `DeclarerEnTete actions`).
 */
export function BarreDuBien({
  property,
  onOuvrirLAnnonce,
}: {
  readonly property: PropertyDetail;
  /** « Publier l'annonce » / « Modifier l'annonce » : l'onglet Annonce, section voulue. */
  readonly onOuvrirLAnnonce: (section: 'apercu' | 'edit') => void;
}) {
  const t = useTranslations('property.dashboard.fiche');
  const tGestion = useTranslations('property.dashboard.gestion');
  const agence = agenceDuBien(property);
  const personnelActif = usePersonnelActif(agence);
  const [contacter, setContacter] = useState(false);
  const [planifier, setPlanifier] = useState(false);
  const gestes = gestesDeLaBarre(property, personnelActif);
  const occupation = property.occupancy ?? null;
  const nom = nomDuLocataire(occupation);
  const telephone = occupation?.tenant?.phone ?? null;

  const rendre = (geste: Geste, principal: boolean) => {
    const variante = principal ? 'default' : 'outline';
    switch (geste) {
      case 'signaler':
        return (
          <Link key={geste} href={`/app/maintenance/new?property=${property.id}`} className={cn(buttonVariants({ variant: variante }))}>
            {t('gestes.signaler')}
          </Link>
        );
      case 'contacter':
        return (
          <Button key={geste} type="button" variant={variante} onClick={() => setContacter(true)}>
            {t('gestes.contacter')}
          </Button>
        );
      case 'voirLeBail':
        return occupation?.lease ? (
          <Link key={geste} href={`/app/leases/${occupation.lease.id}`} className={cn(buttonVariants({ variant: variante }))}>
            {t('gestes.voirLeBail')}
          </Link>
        ) : null;
      case 'planifier':
        return (
          <Button key={geste} type="button" variant={variante} onClick={() => setPlanifier(true)}>
            <CalendarPlus className="size-4" aria-hidden="true" />
            {t('gestes.planifier')}
          </Button>
        );
      case 'creerUnBail':
        return (
          <Link key={geste} href={`/app/leases/new?property=${property.id}`} className={cn(buttonVariants({ variant: variante }))}>
            <FilePlus2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('gestes.creerUnBail')}
          </Link>
        );
      case 'publier':
        return (
          <Button key={geste} type="button" variant={variante} onClick={() => onOuvrirLAnnonce('apercu')}>
            {tGestion('publier')}
          </Button>
        );
      case 'modifierLAnnonce':
        return (
          <Button key={geste} type="button" variant={variante} onClick={() => onOuvrirLAnnonce('edit')}>
            {t('gestes.modifierLAnnonce')}
          </Button>
        );
    }
  };

  return (
    <>
      <BarreDAction data-testid="barre-du-bien">{gestes.map((geste, i) => rendre(geste, i === gestes.length - 1))}</BarreDAction>
      {gestes.includes('contacter') && nom && isReachable(telephone) ? (
        <FeuilleDuBas open={contacter} onOpenChange={setContacter} titre={t('contacter.titre', { nom })}>
          <div className="-mx-4 border-t border-border">
            <LigneDeListe
              href={telHref(telephone)}
              debut={<Phone className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
              titre={t('contacter.appeler')}
              detail={formaterTelephone(telephone)}
            />
            <LigneDeListe
              href={whatsappHref(telephone, '')}
              debut={<IconeWhatsApp className="size-5 text-success" />}
              titre={t('contacter.whatsapp')}
              detail={formaterTelephone(telephone)}
            />
          </div>
        </FeuilleDuBas>
      ) : null}
      {planifier ? (
        <PlanifierDialog
          property={{ id: property.id, libelle: property.title, photo: property.main_photo_url ?? null, detail: property.reference_number ?? null }}
          onClose={() => setPlanifier(false)}
        />
      ) : null}
    </>
  );
}
