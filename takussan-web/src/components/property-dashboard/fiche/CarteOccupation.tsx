'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FilePlus2, Wallet } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { etatDuMois } from '@/lib/biens/etat-locatif';
import { formaterTelephone } from '@/lib/phone';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PropertyDetail } from '@/types/property';

import { initialesDe } from '@/lib/identite';

import { useEncaissement } from './OngletLocation';
import { Appels, AvatarDe, Carte, Cle, nomDuLocataire, useMoisDeLEcheance } from './PiecesDeLaLocation';
import { useLocationDuBien } from './useLocationDuBien';

/**
 * TCK-2639 — la carte collante « Occupation » du bureau (`xl`, maquette bureau a : 360 px à droite) :
 * le locataire et son numéro, l'état du loyer du mois, le montant dû, le prochain loyer, le bailleur,
 * puis « Encaisser », « Voir le bail » et « Signaler un problème ». Elle reste à l'écran sur tous les
 * onglets (AC6) : elle vit hors des onglets, dans la colonne de droite de la fiche.
 *
 * Bien vacant : « Vacant depuis N j » et « Créer un bail ». Bien hors location sans bail : rien.
 */
export function CarteOccupation({
  property,
  personnel,
  lienVersLeBailleur,
}: {
  readonly property: PropertyDetail;
  readonly personnel: boolean;
  readonly lienVersLeBailleur: boolean;
}) {
  const t = useTranslations('propertyDashboard.fiche');
  const tGestion = useTranslations('propertyDashboard.gestion');
  const f = useFormatteurs();
  const moisDe = useMoisDeLEcheance();
  const location = useLocationDuBien(property, personnel);
  const encaisser = useEncaissement(location);
  const [aujourdhui] = useState(() => new Date());
  const occupation = location.occupation;
  if (!occupation || (occupation.state === 'not_rental' && !occupation.lease)) return null;

  const bailleur = property.owner?.name ?? null;
  const lienBailleur = lienVersLeBailleur && property.owner_profile_id ? `/app/owners/${property.owner_profile_id}` : null;
  const etat = etatDuMois(property, aujourdhui);
  const mois = occupation.current_month;

  const libelleEtat = (() => {
    switch (etat?.cle) {
      case 'paye':
      case 'partiel':
        return <span className={etat.cle === 'partiel' ? 'text-warning' : 'text-success'}>{tGestion(`etat.${etat.cle}`)}</span>;
      case 'enRetard':
        return <span className="text-destructive">{tGestion('etat.enRetard', { jours: etat.jours })}</span>;
      case 'aEcheance':
        return etat.date ? tGestion('etat.aEcheance', { date: f.jourMois(etat.date, aujourdhui) }) : tGestion('etat.aEcheanceSansDate');
      case 'preavis':
        return etat.date ? tGestion('etat.preavis', { date: f.jourMois(etat.date, aujourdhui) }) : tGestion('etat.preavisSansDate');
      default:
        return '—';
    }
  })();

  return (
    <Carte>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-corps leading-normal font-semibold">{t('titres.occupation')}</h2>
      </div>
      {location.occupe ? (
        <>
          <OccupantDeLaCarte occupation={occupation} />
          <dl className="border-t border-border px-4 py-2.5">
            {mois?.due_date ? <Cle k={t('carte.loyerDe', { mois: moisDe(mois.due_date).mois.toLocaleLowerCase(f.locale) })} v={libelleEtat} /> : null}
            {/* `amount_due` est le calcul de l'historique : la pénalité y est déjà quand elle se paie en ligne. */}
            {mois?.amount_due !== null && mois?.amount_due !== undefined && location.resteDu ? (
              <Cle k={t('carte.montantDu')} v={f.montantCourt(mois.amount_due, occupation.rent?.currency ?? property.currency)} fort />
            ) : null}
            {location.prochainLoyer ? <Cle k={t('carte.prochainLoyer')} v={f.jourMois(location.prochainLoyer, aujourdhui)} /> : null}
            <Cle
              k={t('bailleur.titre')}
              v={
                lienBailleur ? (
                  <Link href={lienBailleur} className="text-primary hover:underline">
                    {bailleur ?? t('bailleur.inconnu')}
                  </Link>
                ) : (
                  (bailleur ?? t('bailleur.inconnu'))
                )
              }
            />
          </dl>
          <div className="space-y-2 border-t border-border p-4">
            {encaisser.ouvrir ? (
              <Button type="button" className="h-10 w-full" onClick={encaisser.ouvrir}>
                <Wallet className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('ceMois.encaisser')}
              </Button>
            ) : location.gestesEnLecture ? (
              // Sa place, tant que le bail et l'échéancier se lisent : la carte ne grandit pas à leur arrivée.
              <div className="invisible h-10" aria-hidden="true" data-slot="encaisser-en-lecture" />
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {location.bailId !== null ? (
                <Link href={`/app/leases/${location.bailId}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
                  {t('gestes.voirLeBail')}
                </Link>
              ) : null}
              <Link
                href={`/app/maintenance/new?property=${property.id}`}
                className={cn(buttonVariants({ variant: 'outline' }), 'h-10', location.bailId === null && 'col-span-2')}
              >
                {t('gestes.signaler')}
              </Link>
            </div>
          </div>
          {encaisser.dialogue}
        </>
      ) : (
        <>
          <div className="px-4 py-3">
            <p className="text-base font-semibold">
              {etat?.cle === 'vacantDepuis' ? tGestion('etat.vacantDepuis', { jours: etat.jours }) : tGestion('ligne.sansLocataire')}
            </p>
            <dl className="mt-1">
              <Cle k={t('bailleur.titre')} v={bailleur ?? t('bailleur.inconnu')} />
            </dl>
          </div>
          <div className="border-t border-border p-4">
            <Link href={`/app/leases/new?property=${property.id}`} className={cn(buttonVariants(), 'h-10 w-full')}>
              <FilePlus2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {t('gestes.creerUnBail')}
            </Link>
          </div>
        </>
      )}
    </Carte>
  );
}

function OccupantDeLaCarte({ occupation }: { readonly occupation: NonNullable<PropertyDetail['occupancy']> }) {
  const t = useTranslations('propertyDashboard.fiche');
  const nom = nomDuLocataire(occupation);
  const telephone = occupation.tenant?.phone ?? null;
  return (
    <div className="flex items-center gap-3 p-4">
      <AvatarDe initiales={occupation.tenant ? initialesDe(occupation.tenant) : null} />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-base font-semibold">{nom ?? t('occupant.locataire')}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {telephone ? t('carte.locataireTelephone', { telephone: formaterTelephone(telephone) }) : t('occupant.locataire')}
        </p>
      </div>
      {nom ? <Appels telephone={telephone} nom={nom} petit /> : null}
    </div>
  );
}
