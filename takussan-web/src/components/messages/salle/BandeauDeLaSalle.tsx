'use client';

import type { ComponentProps, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FolderOpen } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useBooking } from '@/lib/queries/bookings';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/message';

import { useBailDeLaSalle } from './requetesDeLaSalle';
import { lecteurDuBail, objetDeLaSalle } from './salle';

type Teinte = ComponentProps<typeof StatusBadge>['tone'];

interface BandeauDeLaSalleProps {
  readonly conversation: Conversation;
  /** « Dossier » (sous `xl`, où le dossier n'a pas sa colonne) : la feuille du dossier, que la page rend. */
  readonly onDossier: () => void;
}

/**
 * TCK-2963 (maquette `fil-salle-bail` A, `BandeauBail`) — collé sous l'en-tête de la salle : l'état de
 * l'objet EN MOTS, puis trois chiffres lisibles à 360, relus pour le lecteur. Ce que l'écran affiche vient
 * de la lecture de l'objet que l'API rend à CE lecteur : le bandeau ne masque rien lui-même.
 *
 * Une lecture qui échoue n'empêche pas de parler : le bandeau disparaît, la salle reste.
 */
export function BandeauDeLaSalle({ conversation, onDossier }: BandeauDeLaSalleProps) {
  const objet = objetDeLaSalle(conversation);
  if (!objet) return null;
  return objet.nature === 'lease' ? (
    <BandeauDuBail id={objet.id} onDossier={onDossier} />
  ) : (
    <BandeauDeLaReservation id={objet.id} onDossier={onDossier} />
  );
}

function Cadre({ statut, reference, onDossier, children }: { readonly statut: ReactNode; readonly reference: ReactNode; readonly onDossier: () => void; readonly children: ReactNode }) {
  const t = useTranslations('messaging.salle.bandeau');
  return (
    <section
      data-slot="bandeau-de-la-salle"
      aria-label={t('libelle')}
      className="flex-none border-b border-border bg-card px-4 py-2.5 lg:px-5 lg:py-3"
    >
      <div className="mb-2 flex items-center gap-2">
        {statut}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{reference}</span>
        <button
          type="button"
          onClick={onDossier}
          aria-label={t('dossierAria')}
          data-testid="ouvrir-le-dossier"
          className="inline-flex h-8 flex-none items-center gap-1 rounded-lg border border-border px-2.5 text-ui font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring xl:hidden"
        >
          <FolderOpen className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          {t('dossier')}
        </button>
      </div>
      {/* Montant et date sur deux lignes : à 360, trois cases d'une centaine de pixels chacune. */}
      <dl className="flex gap-3 lg:max-w-[calc(var(--spacing)*177.8)] lg:gap-6">{children}</dl>
    </section>
  );
}

function Chiffre({
  libelle,
  valeur,
  detail,
  ton,
  large,
  testId,
}: {
  readonly libelle: string;
  readonly valeur: ReactNode;
  readonly detail?: ReactNode;
  readonly ton?: 'succes' | 'info' | 'danger';
  readonly large?: boolean;
  readonly testId?: string;
}) {
  return (
    <div className={cn('min-w-0 flex-1', large && 'flex-[1.25]')} data-testid={testId}>
      <dt className="truncate text-legende font-medium text-muted-foreground">{libelle}</dt>
      <dd
        className={cn(
          'whitespace-nowrap text-sm font-semibold leading-tight tabular-nums text-foreground lg:text-corps',
          ton === 'succes' && 'text-success',
          ton === 'info' && 'text-info',
          ton === 'danger' && 'text-destructive',
        )}
      >
        {valeur}
      </dd>
      {detail ? <dd className="truncate text-legende text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

function Attente() {
  return (
    <div className="flex-none border-b border-border bg-card px-4 py-2.5 lg:px-5 lg:py-3" aria-busy="true">
      <Skeleton className="mb-2 h-5 w-40" />
      <Skeleton className="h-9 w-full max-w-md" />
    </div>
  );
}

/** Le ton du statut d'un bail : actif ou renouvelé en vert, préavis en information, le reste neutre. */
function tonDuBail(statut: string | null | undefined): Teinte {
  if (statut === 'active' || statut === 'renewed') return 'success';
  if (statut === 'terminating') return 'info';
  return 'neutral';
}

function BandeauDuBail({ id, onDossier }: { readonly id: number; readonly onDossier: () => void }) {
  const t = useTranslations('messaging.salle');
  const f = useFormatteurs();
  const { user } = useAuth();
  const { data, isPending, isError } = useBailDeLaSalle(id);
  if (isPending) return <Attente />;
  const bail = data?.data;
  if (isError || !bail) return null;

  const lecteur = lecteurDuBail(bail, user?.id);
  const devise = bail.currency ?? 'XOF';
  const sortie = bail.status === 'terminating' && bail.early_termination_effective_date ? bail.early_termination_effective_date : null;
  const statut = sortie
    ? t('bail.preavisSortie', { date: f.jourMois(sortie) })
    : t.has(`bail.statut.${bail.status}`)
      ? t(`bail.statut.${bail.status}`)
      : bail.status;
  const reference = [
    lecteur === 'locataire' ? t('bandeau.votreBail') : bail.reference_number,
    bail.type && t.has(`bail.type.${bail.type}`) ? t(`bail.type.${bail.type}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const prochaine = bail.next_due ?? null;
  const resume = typeof bail.overdue_count === 'number';
  const enRetard = resume && bail.overdue_count! > 0;

  return (
    <Cadre statut={<StatusBadge label={statut} tone={tonDuBail(bail.status)} />} reference={reference} onDossier={onDossier}>
      <Chiffre
        large
        testId="chiffre-echeance"
        libelle={lecteur === 'locataire' ? t('bail.prochainLoyer') : t('bail.prochaineEcheance')}
        valeur={prochaine ? f.montantCourt(prochaine.amount, devise) : '—'}
        detail={prochaine ? t('bail.echeanceLe', { date: f.jourMois(prochaine.due_date) }) : t('bail.aucuneEcheance')}
      />
      <Chiffre
        testId="chiffre-solde"
        libelle={t('bail.solde')}
        valeur={!resume ? '—' : enRetard ? f.montantCourt(bail.overdue_amount ?? 0, devise) : t('bail.aJour')}
        ton={!resume ? undefined : enRetard ? 'danger' : 'succes'}
        detail={enRetard ? t('bail.enRetard', { n: bail.overdue_count! }) : resume && lecteur === 'locataire' ? t('bail.rienARegler') : undefined}
      />
      <Chiffre
        testId="chiffre-periode"
        libelle={sortie ? t('bail.sortie') : t('bail.finDePeriode')}
        valeur={sortie ? f.jourMois(sortie) : bail.end_date ? f.jourMois(bail.end_date) : '—'}
        ton={sortie ? 'info' : undefined}
        detail={bail.next_revision_date ? t('bail.revision', { date: f.jourMois(bail.next_revision_date) }) : undefined}
      />
    </Cadre>
  );
}

function tonDeLaReservation(statut: string | null | undefined): Teinte {
  if (statut === 'confirmed' || statut === 'completed') return 'success';
  if (statut === 'pending') return 'attention';
  return 'neutral';
}

function BandeauDeLaReservation({ id, onDossier }: { readonly id: number; readonly onDossier: () => void }) {
  const t = useTranslations('messaging.salle');
  const f = useFormatteurs();
  const { data, isPending, isError } = useBooking(id);
  if (isPending) return <Attente />;
  const resa = data?.data;
  if (isError || !resa) return null;

  const statut = t.has(`reservation.statut.${resa.status}`) ? t(`reservation.statut.${resa.status}`) : resa.status;
  const montant = resa.total_amount ?? resa.price_at_booking;
  return (
    <Cadre
      statut={<StatusBadge label={statut} tone={tonDeLaReservation(resa.status)} />}
      reference={[resa.reference_number, resa.property?.title].filter(Boolean).join(' · ')}
      onDossier={onDossier}
    >
      <Chiffre testId="chiffre-arrivee" libelle={t('reservation.arrivee')} valeur={resa.start_date ? f.jourMois(resa.start_date) : '—'} />
      <Chiffre testId="chiffre-depart" libelle={t('reservation.depart')} valeur={resa.end_date ? f.jourMois(resa.end_date) : '—'} />
      <Chiffre
        testId="chiffre-montant"
        libelle={t('reservation.montant')}
        valeur={montant != null ? f.montantCourt(montant, resa.currency ?? 'XOF') : '—'}
        detail={resa.status === 'pending' && resa.response_deadline ? t('reservation.reponseAvant', { date: f.jourMois(resa.response_deadline) }) : undefined}
      />
    </Cadre>
  );
}
