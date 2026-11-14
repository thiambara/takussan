'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { moisCourant } from '@/lib/finances/mois';
import { useOwnerStatement } from '@/lib/queries/payments';

import { InvoiceDetailDialog } from '../InvoiceDetailDialog';
import { InvoicesTable } from '../InvoicesTable';
import { PaymentsHistoryTable } from '../PaymentsHistoryTable';
import { PayoutDetailDialog } from '../PayoutDetailDialog';
import { PayoutsTable } from '../PayoutsTable';
import { estAnnee, ongletDeLAdresse, periodeDeLAdresse, tauxUnique } from './adresse';
import { FiltresDesOperations } from './FiltresDesOperations';
import { OngletsDesLoyers } from './OngletsDesLoyers';
import { RevenusDuBailleur } from './RevenusDuBailleur';
import { SelecteurDuReleve } from './SelecteurDuReleve';
import { useTelechargerLeReleve } from './useTelechargerLeReleve';

/**
 * TCK-2651 (ADR-0100 § 2 et § 3, maquette `app-paiements`, approche A) — « Loyers », la page d'argent du
 * BAILLEUR sous `/app/payments` : ce qui reste à lui verser d'abord, puis chaque bien, puis les
 * opérations, sans identifiant technique. Elle remplace pour lui `PaymentsTabs`, l'écran
 * d'encaissement de l'agence, sans rien perdre (audit famille 4, § 5) :
 *
 * - « Revenus » : le relevé de la période (`GET /api/owner-statements?period=`, celui du LECTEUR, sans
 *   `landlord_id`), au mois ou à l'année (l'attestation annuelle), PDF et CSV, le rectificatif d'un
 *   relevé envoyé (TCK-2321) ;
 * - « Versements », « Factures » : les tables du personnel, sans identifiant technique, et leur détail ;
 * - « Opérations » : le registre, filtrable par statut, bien, locataire et dates, ses seules opérations
 *   (`filter[landlord_id]`) — un bailleur qui est aussi locataire n'y lit pas son propre loyer.
 *
 * La période et l'onglet vivent dans l'adresse (`?period=`, `?tab=`) : partageables, et un ancien lien
 * de notification (`?tab=payouts`) mène à l'onglet qui le remplace.
 */
export function LoyersDuBailleur() {
  const t = useTranslations('payments.bailleur');
  const f = useFormatteurs();
  const recherche = useSearchParams();
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
  const courant = moisCourant();
  const periode = periodeDeLAdresse(recherche, courant);
  const onglet = ongletDeLAdresse(recherche);
  const annee = periode.slice(0, 4);

  const lecture = useOwnerStatement(periode);
  const releve = lecture.data?.data;
  const telechargement = useTelechargerLeReleve(t('documents.echec'));
  const [factureId, setFactureId] = useState<number | null>(null);
  const [versementId, setVersementId] = useState<number | null>(null);

  const biens = releve?.properties ?? [];
  const taux = releve ? tauxUnique(releve.lines) : null;
  const sousTitre = releve
    ? [
        t('sousTitre', { n: biens.length, agence: releve.agency.name }),
        taux !== null ? t('mandat', { taux: f.nombre(taux, { maximumFractionDigits: 2 }) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  const enCours = telechargement.enCours;

  return (
    <div className="space-y-5" data-slot="loyers-du-bailleur">
      {/* Téléphone : « Loyers » et la pastille du mois dans l'en-tête de la coque (maquette `MobileBailleur`). */}
      <DeclarerEnTete titre={t('titre')} action={<SelecteurDuReleve periode={periode} courant={courant} variante="telephone" />} />
      <PageHeader
        className="max-md:sr-only"
        title={t('titre')}
        description={sousTitre}
        actions={
          // Au téléphone, l'en-tête n'est lu que par un lecteur d'écran : ses boutons n'y sont pas
          // atteignables au clavier sans être vus. Le sélecteur et les documents y ont leur place visible.
          <div className="hidden md:contents">
            <SelecteurDuReleve periode={periode} courant={courant} variante="bureau" />
            <Button type="button" variant="outline" disabled={enCours !== null} onClick={() => void telechargement.telecharger(periode, 'pdf')}>
              <Download aria-hidden="true" />
              {estAnnee(periode) ? t('documents.attestationPdf') : t('documents.relevePdf')}
            </Button>
            <Button type="button" variant="outline" disabled={enCours !== null} onClick={() => void telechargement.telecharger(periode, 'csv')} aria-label={t('documents.csvAria')}>
              {t('documents.csv')}
            </Button>
            {estAnnee(periode) ? null : (
              <Button type="button" variant="outline" disabled={enCours !== null} onClick={() => void telechargement.telecharger(annee, 'pdf')}>
                {t('documents.attestationBouton')}
              </Button>
            )}
          </div>
        }
      />
      {telechargement.erreur ? (
        <p role="alert" className="hidden text-ui text-destructive md:block">
          {telechargement.erreur}
        </p>
      ) : null}

      <OngletsDesLoyers actif={onglet} />

      {onglet === 'revenus' ? (
        <RevenusDuBailleur
          releve={releve}
          chargement={lecture.isLoading}
          erreur={lecture.isError ? messageErreur(lecture.error, t('erreur')) : null}
          periode={periode}
          bailleurId={user?.id ?? null}
          telechargement={telechargement}
        />
      ) : null}

      {onglet === 'versements' ? <PayoutsTable onSelect={setVersementId} sansIdentifiants /> : null}

      {onglet === 'factures' ? <InvoicesTable onSelect={setFactureId} sansIdentifiants /> : null}

      {onglet === 'operations' && user ? (
        <div className="space-y-4">
          <FiltresDesOperations
            biens={biens.map((b) => ({ id: b.property_id, titre: b.title ?? t('parBien.bienSansTitre') }))}
            locataires={[...new Set(biens.map((b) => b.tenant_name).filter((n): n is string => !!n))]}
          />
          <PaymentsHistoryTable bailleur={{ id: user.id }} />
        </div>
      ) : null}

      <InvoiceDetailDialog invoiceId={factureId} onClose={() => setFactureId(null)} sansIdentifiants />
      <PayoutDetailDialog payoutId={versementId} onClose={() => setVersementId(null)} sansIdentifiants />
    </div>
  );
}
