'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FilePlus2, Globe, Wrench } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { ErreurDeLecture } from '@/components/feedback';
import { LeasePaymentDialog } from '@/components/leases/LeasePaymentDialog';
import { PuceEtatDuMois } from '@/components/property-dashboard/GestionDuBien';
import { buttonVariants, Button } from '@/components/ui/button';
import { etatDuMois } from '@/lib/biens/etat-locatif';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';
import type { PropertyDetail } from '@/types/property';

import {
  BlocAVenir,
  BlocBailleur,
  BlocCeMois,
  BlocResponsable,
  BlocOccupant,
  Carte,
  Cle,
  LigneLien,
  TitreBloc,
  useMoisDeLEcheance,
} from './PiecesDeLaLocation';
import { useLocationDuBien, type LocationDuBien } from './useLocationDuBien';

// La feuille de relance de l'écran des impayés (TCK-2660) : chargée au premier « Relancer ».
const FeuilleDeRelance = dynamic(() => import('@/components/admin/finances/impayes/Impayes').then((m) => m.FeuilleDeRelance));

/**
 * TCK-2639 — l'onglet « Location » : qui occupe le bien, sous quel bail, si le loyer du mois est
 * rentré et ce qui l'attend (maquette `app-biens`, approche a, « Fiche — onglet Location »).
 *
 *  · Sous `xl`, une pile : l'occupant, « Ce mois » (avec « Relancer » / « Encaisser »), « À venir »,
 *    « Mandat ». Au bureau (`xl`), la carte collante « Occupation » porte l'occupant et les gestes ;
 *    la colonne montre les dernières échéances, « À venir » et le bail en cours.
 *  · Vacant : « Vacant depuis N j » (« Sans locataire » pour un bien jamais loué), « Créer un bail »
 *    (`/app/leases/new?property={id}`, TCK-2643) et « Publier l'annonce » s'il n'est pas en ligne.
 *  · Une vente sans bail renvoie à l'onglet « Annonce » ; une vente LOUÉE garde ses blocs.
 *  · « Encaisser » : à qui l'API accorde l'encaissement (`abilities.record_payment`, bailleur qui
 *    écrit compris — TCK-2645, décision 2) ; « Relancer » : le personnel, avec le même droit ; tous
 *    deux sur une échéance du mois à régler — jamais par le seul rôle.
 */
export function OngletLocation({
  property,
  personnel,
  lienVersLeBailleur,
  onOuvrirLAnnonce,
}: {
  readonly property: PropertyDetail;
  readonly personnel: boolean;
  readonly lienVersLeBailleur: boolean;
  readonly onOuvrirLAnnonce: () => void;
}) {
  const t = useTranslations('property.dashboard.fiche');
  const location = useLocationDuBien(property, personnel);
  const [aujourdhui] = useState(() => new Date());
  const occupation = location.occupation;

  if (!occupation || (occupation.state === 'not_rental' && !occupation.lease)) {
    return (
      <Carte className="p-5">
        <h2 className="text-corps leading-normal font-semibold">{t('vente.titre')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('vente.detail')}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={onOuvrirLAnnonce}>
          {t('vente.ouvrir')}
        </Button>
      </Carte>
    );
  }

  if (!location.occupe) {
    return <LocationVacante property={property} aujourdhui={aujourdhui} lienVersLeBailleur={lienVersLeBailleur} onOuvrirLAnnonce={onOuvrirLAnnonce} />;
  }

  return (
    <div>
      {/* Téléphone et tablette : la pile de la maquette mobile. */}
      <div className="space-y-3 xl:hidden" data-slot="location-pile">
        <BlocOccupant occupation={occupation} />
        <TitreBloc className="pt-2">{t('titres.ceMois')}</TitreBloc>
        <CeMoisAvecGestes property={property} location={location} aujourdhui={aujourdhui} />
        <TitreBloc className="pt-2">{t('titres.aVenir')}</TitreBloc>
        <BlocAVenir property={property} location={location} />
        <TitreBloc className="pt-2">{t('titres.mandat')}</TitreBloc>
        <BlocBailleur property={property} lien={lienVersLeBailleur} />
        <BlocResponsable property={property} />
        {/* Au téléphone, la barre du bas porte « Signaler un problème » ; entre `md` et `xl`, cette ligne. */}
        <Carte className="max-md:hidden">
          <LigneLien
            href={`/app/maintenance/new?property=${property.id}`}
            icone={<Wrench className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
            titre={t('gestes.signaler')}
          />
        </Carte>
      </div>
      {/* Bureau : les échéances, « À venir », le bail en cours ; l'occupant est dans la carte collante. */}
      <div className="hidden space-y-5 xl:block" data-slot="location-bureau">
        <CarteDesLoyers location={location} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(18.75rem,1fr))] gap-5">
          <div>
            <TitreBloc className="mb-2">{t('titres.aVenir')}</TitreBloc>
            <BlocAVenir property={property} location={location} />
          </div>
          <div>
            <TitreBloc className="mb-2">{t('titres.bailEnCours')}</TitreBloc>
            <BailEnCours location={location} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** « Ce mois » avec ses gestes, et la feuille de relance / le dialogue d'encaissement qu'ils ouvrent. */
function CeMoisAvecGestes({ property, location, aujourdhui }: { readonly property: PropertyDetail; readonly location: LocationDuBien; readonly aujourdhui: Date }) {
  const [relance, setRelance] = useState<{ readonly row: PaymentHistoryRow; readonly ouverte: boolean } | null>(null);
  const encaisser = useEncaissement(location);
  const ligne = location.ligneDuMois;
  const statut = location.occupation?.current_month?.status;
  const relancable = ligne !== null && location.peutRelancer && (statut === 'late' || statut === 'partial');
  return (
    <>
      <BlocCeMois
        property={property}
        location={location}
        etat={<PuceEtatDuMois property={property} aujourdhui={aujourdhui} alerte />}
        gestes={{
          onRelancer: relancable ? () => setRelance({ row: ligne, ouverte: true }) : null,
          onEncaisser: encaisser.ouvrir,
        }}
      />
      {relance ? <FeuilleDeRelance row={relance.row} ouverte={relance.ouverte} onFermer={() => setRelance({ ...relance, ouverte: false })} /> : null}
      {encaisser.dialogue}
    </>
  );
}

/** « Encaisser » : le dialogue de paiement reçu sur l'échéance du mois ; `ouvrir` nul sans objet. */
export function useEncaissement(location: LocationDuBien) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const ligne = location.ligneDuMois;
  const possible = location.peutEncaisser && location.resteDu && ligne !== null && location.bailId !== null;
  return {
    ouvrir: possible ? () => setOuvert(true) : null,
    dialogue:
      possible && location.bailId !== null ? (
        <LeasePaymentDialog
          leaseId={location.bailId}
          open={ouvert}
          onOpenChange={setOuvert}
          paiementInitial={ligne?.id}
          // L'état du mois est celui du serveur (`occupancy`) : la fiche se relit.
          onEncaisse={() => router.refresh()}
        />
      ) : null,
  };
}

function LocationVacante({
  property,
  aujourdhui,
  lienVersLeBailleur,
  onOuvrirLAnnonce,
}: {
  readonly property: PropertyDetail;
  readonly aujourdhui: Date;
  readonly lienVersLeBailleur: boolean;
  readonly onOuvrirLAnnonce: () => void;
}) {
  const t = useTranslations('property.dashboard.fiche');
  const tGestion = useTranslations('property.dashboard.gestion');
  const etat = etatDuMois(property, aujourdhui);
  const titre =
    etat?.cle === 'vacantDepuis' ? tGestion('etat.vacantDepuis', { jours: etat.jours }) : tGestion('ligne.sansLocataire');
  return (
    <div className="space-y-3">
      <Carte className="p-5">
        <h2 className="text-lg font-semibold" data-testid="etat-vacant">
          {titre}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('vacant.detail')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/app/leases/new?property=${property.id}`} className={cn(buttonVariants())}>
            <FilePlus2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('gestes.creerUnBail')}
          </Link>
          {property.is_online === false ? (
            <Button type="button" variant="outline" onClick={onOuvrirLAnnonce}>
              <Globe className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {tGestion('publier')}
            </Button>
          ) : null}
        </div>
      </Carte>
      <TitreBloc className="pt-2">{t('titres.mandat')}</TitreBloc>
      <BlocBailleur property={property} lien={lienVersLeBailleur} />
      <BlocResponsable property={property} />
    </div>
  );
}

const TON_DE_L_ECHEANCE: Record<'paye' | 'enRetard' | 'partiel' | 'aEcheance', StatusTone> = {
  paye: 'success',
  enRetard: 'danger',
  partiel: 'attention',
  aEcheance: 'neutral',
};

/** L'état d'une échéance de l'historique : la même phrase que la puce du mois. */
function etatDeLEcheance(row: PaymentHistoryRow): 'paye' | 'enRetard' | 'partiel' | 'aEcheance' {
  if (row.status === 'paid' || (row.remaining_amount <= 0 && row.paid_amount > 0)) return 'paye';
  if ((row.days_late ?? 0) > 0) return 'enRetard';
  if (row.paid_amount > 0) return 'partiel';
  return 'aEcheance';
}

/** Bureau : « Loyers » — les dernières échéances du bail, et le lien vers tout l'échéancier. */
function CarteDesLoyers({ location }: { readonly location: LocationDuBien }) {
  const t = useTranslations('property.dashboard.fiche.loyers');
  const tEtat = useTranslations('property.dashboard.gestion.etat');
  const tRacine = useTranslations();
  const f = useFormatteurs();
  const moisDe = useMoisDeLEcheance();
  const lignes = (location.echeances.data?.data ?? []).filter((l) => l.source === 'lease').slice(0, 4);
  const total = location.echeances.data?.meta.total ?? 0;
  return (
    <Carte>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 text-corps leading-normal font-semibold">{t('titre')}</h2>
        {location.bailId !== null && total > 0 ? (
          <Link href={`/app/leases/${location.bailId}`} className="text-sm font-medium text-primary hover:underline">
            {t('toutLEcheancier', { count: total })}
          </Link>
        ) : null}
      </div>
      {location.echeances.isError ? (
        <ErreurDeLecture
          className="m-4"
          erreur={location.echeances.error}
          message={t('echec')}
          onRetry={() => void location.echeances.refetch()}
          retryLabel={tRacine('common.actions.retry')}
        />
      ) : location.echeances.isPending ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('chargement')}</p>
      ) : lignes.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('vide')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t('titre')}</caption>
            <tbody className="divide-y divide-border">
              {lignes.map((row) => {
                const etat = etatDeLEcheance(row);
                const jour = row.period_start ?? row.due_date;
                const libelleMois = jour ? `${moisDe(jour).mois} ${f.date(jour, { year: 'numeric' })}` : (row.reference_number ?? `#${row.id}`);
                const label =
                  etat === 'enRetard'
                    ? tEtat('enRetard', { jours: row.days_late ?? 0 })
                    : etat === 'aEcheance'
                      ? row.due_date
                        ? tEtat('aEcheance', { date: f.jourMois(row.due_date) })
                        : tEtat('aEcheanceSansDate')
                      : tEtat(etat);
                const penalite = row.late_fee_outstanding ?? 0;
                const detail =
                  etat === 'paye' && row.paid_at
                    ? t('recuLe', { date: f.jourMois(row.paid_at) })
                    : row.due_date
                      ? penalite > 0
                        ? t('echeanceEtPenalite', { date: f.jourMois(row.due_date), montant: f.montantCourt(penalite, row.currency) })
                        : t('echeanceLe', { date: f.jourMois(row.due_date) })
                      : null;
                return (
                  <tr key={row.id} data-testid="ligne-d-echeance">
                    <td className="h-12 whitespace-nowrap pl-4 pr-3 font-medium">{libelleMois}</td>
                    <td className="h-12 whitespace-nowrap px-3 tabular-nums">{f.montantCourt(row.amount, row.currency)}</td>
                    <td className="h-12 px-3">
                      <StatusBadge tone={TON_DE_L_ECHEANCE[etat]} label={label} className="whitespace-nowrap" />
                    </td>
                    <td className="h-12 pl-3 pr-4 text-sm text-muted-foreground">{detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Carte>
  );
}

/** Bureau : « Bail en cours » — référence, type, durée, caution, préavis (`GET /api/leases/{id}`). */
function BailEnCours({ location }: { readonly location: LocationDuBien }) {
  const t = useTranslations('property.dashboard.fiche.bail');
  const tTypes = useTranslations('lease.types');
  const tRacine = useTranslations();
  const f = useFormatteurs();
  const resume = location.occupation?.lease ?? null;
  const bail = location.bail.data?.data ?? null;
  if (!resume) {
    return (
      <Carte className="px-4 py-3">
        <p className="text-sm text-muted-foreground">{t('illisible')}</p>
      </Carte>
    );
  }
  if (location.bail.isError) {
    return (
      <ErreurDeLecture erreur={location.bail.error} message={t('echec')} onRetry={() => void location.bail.refetch()} retryLabel={tRacine('common.actions.retry')} />
    );
  }
  const type = resume.type && tTypes.has(resume.type) ? tTypes(resume.type) : null;
  const debut = resume.start_date ? f.date(resume.start_date) : null;
  const fin = resume.end_date ? f.date(resume.end_date) : null;
  return (
    <Carte className="px-4 py-2.5">
      <dl>
        <Cle k={t('cles.reference')} v={resume.reference_number ?? '—'} />
        <Cle k={t('cles.type')} v={type ?? '—'} />
        <Cle k={t('cles.duree')} v={debut && fin ? t('periode', { debut, fin }) : debut ? t('depuis', { debut }) : '—'} />
        <Cle
          k={t('cles.caution')}
          v={bail?.deposit_amount ? f.montantCourt(bail.deposit_amount, bail.currency) : bail ? '—' : '…'}
        />
        <Cle
          k={t('cles.preavis')}
          v={bail?.notice_period_days ? t('cles.preavisJours', { count: bail.notice_period_days }) : bail ? '—' : '…'}
        />
      </dl>
    </Carte>
  );
}
