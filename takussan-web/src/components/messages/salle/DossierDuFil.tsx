'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, FileText, FolderOpen } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useBooking } from '@/lib/queries/bookings';
import { useConversationContext } from '@/lib/queries/conversations';
import { useDocuments, useDocumentsGeneres, type DocumentGenere } from '@/lib/queries/documents';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/message';

import { ID_COLONNE_DE_CONTEXTE } from '../EnTeteDuFil';
import { useBailDeLaSalle, type BailDeLaSalle } from './requetesDeLaSalle';
import { membresActuels, objetDeLaSalle, qualiteDansLaReservation, qualiteDansLeBail, type QualiteDuMembre } from './salle';
// TCK-2972 — les engagements du fil.
import { EngagementsDuFil } from '../engagements/EngagementsDuFil';
// TCK-2973 — la fiabilité des participants, pour le seul personnel.
import { FiabiliteDuFil, personnesDuFil } from '../engagements/FiabiliteDuFil';
import { ParticipantsEtCanauxDuFil } from '../pont/ElementsDuPont';
import { participantsDuPont } from '../pont/pont';

/**
 * TCK-2963 (maquette `fil-salle-bail` A, `ContenuDossier` et `PanneauDossier`) — le DOSSIER du fil : ce qu'on
 * vérifie sans quitter la conversation — documents, dates clés, montants convenus, membres de la salle avec
 * leur qualité — et le lien vers la fiche de l'objet. Colonne de droite au bureau (dès `xl`), panneau
 * superposé entre `lg` et `xl`, feuille au téléphone.
 *
 * Deux règles du ticket, tenues par construction :
 * - **aucune coordonnée** : les membres viennent de la SALLE (nom seul, `ConversationResource`) et leur
 *   qualité des identifiants des parties ; la lecture du bail ne demande ni `landlord` ni `agent` (qui
 *   portent un téléphone pour le personnel, TCK-2906), et le locataire n'y est demandé que par son compte ;
 * - **rien de masqué ici** : la commission d'agence ne s'écrit que si la lecture du bail rend
 *   `commission_amount`, que l'API retire pour qui n'est pas du personnel de l'agence (`LeaseResource`).
 *   Le taux (`commission_rate`, retiré de même hors du personnel depuis le 2026-11-18) n'est jamais lu.
 *
 * « Engagements ouverts » : lot 3, hors de ce ticket.
 */
interface DossierDuFilProps {
  readonly conversation: Conversation;
  /** `colonne` (bureau, dès `xl`), `superpose` (entre `lg` et `xl`), `feuille` (le contenu seul, dans `FeuilleDuBas`). */
  readonly forme: 'colonne' | 'superpose' | 'feuille';
}

export function DossierDuFil({ conversation, forme }: DossierDuFilProps) {
  const t = useTranslations('messaging.salle.dossier');
  const contenu = <ContenuDuDossier conversation={conversation} />;
  if (forme === 'feuille') return contenu;
  return (
    <aside
      id={ID_COLONNE_DE_CONTEXTE}
      data-testid="dossier-du-fil"
      aria-label={t('titre')}
      className={cn(
        'flex flex-none flex-col overflow-y-auto border-l border-border bg-background',
        forme === 'superpose' ? 'h-full w-[calc(var(--spacing)*88.9)]' : 'w-[min(calc(var(--spacing)*88.9),27%)] max-xl:hidden',
      )}
    >
      <div className="flex h-12 flex-none items-center gap-2 border-b border-border px-4">
        <FolderOpen className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{t('titre')}</h2>
      </div>
      <div className="p-4">{contenu}</div>
    </aside>
  );
}

function ContenuDuDossier({ conversation }: { readonly conversation: Conversation }) {
  const objet = objetDeLaSalle(conversation);
  const { data: contexte } = useConversationContext(objet ? conversation.id : null);
  if (!objet) return null;
  return (
    <>
      {objet.nature === 'lease' ? (
        <DossierDuBail id={objet.id} conversation={conversation} />
      ) : (
        <DossierDeLaReservation id={objet.id} conversation={conversation} />
      )}
      {/* TCK-2973 — la fiabilité des participants d'une salle : rien sans `commitments_records` (personnel seul). */}
      <FiabiliteDuFil contexte={contexte?.data} personnes={personnesDuFil(conversation)} />
      {/* TCK-2984 — le pont d'une salle : qui est joint par quoi, « Joindre par WhatsApp » ; rien sans bloc `pont`. */}
      <ParticipantsEtCanauxDuFil
        conversationId={conversation.id}
        participants={participantsDuPont(contexte?.data)}
        fiche={contexte?.data?.pont_fiche}
      />
      {/* TCK-2972 — « Engagements de ce fil », au bureau comme dans la feuille du téléphone. */}
      <EngagementsDuFil conversationId={conversation.id} />
    </>
  );
}

function Section({ titre, action, children, testId }: { readonly titre: string; readonly action?: ReactNode; readonly children: ReactNode; readonly testId?: string }) {
  return (
    <section className="mt-5 first:mt-0" data-testid={testId}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">{titre}</h3>
        {action}
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-card px-3.5">{children}</div>
    </section>
  );
}

function Ligne({ cle, valeur }: { readonly cle: ReactNode; readonly valeur: ReactNode }) {
  return (
    <p className="flex items-baseline justify-between gap-3 py-2 text-ui">
      <span className="shrink-0 text-muted-foreground">{cle}</span>
      <span className="min-w-0 text-right font-medium tabular-nums text-foreground">{valeur}</span>
    </p>
  );
}

function Attente() {
  const t = useTranslations('messaging.salle.dossier');
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only">{t('chargement')}</span>
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

/** Les membres de la salle : leur nom (celui que la salle rend) et leur qualité — rien d'autre. */
function Membres({ conversation, qualite }: { readonly conversation: Conversation; readonly qualite: (userId: number) => QualiteDuMembre }) {
  const t = useTranslations('messaging.salle.dossier');
  const { user } = useAuth();
  const membres = membresActuels(conversation);
  if (membres.length === 0) return null;
  return (
    <Section titre={t('membres')} testId="membres-de-la-salle">
      {membres.map((p) => {
        const q = t(`qualite.${qualite(p.user_id)}`);
        return <Ligne key={p.user_id} cle={p.user?.full_name ?? '—'} valeur={p.user_id === user?.id ? t('vous', { qualite: q }) : q} />;
      })}
    </Section>
  );
}

function LienVersLaFiche({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex min-h-10 items-center gap-1 text-ui font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
    >
      {children}
      <ChevronRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/** Au plus cinq pièces dans le dossier : le reste vit dans l'onglet « Documents » de la fiche du bail. */
const PIECES_DU_DOSSIER = 5;
const CATEGORIES_CONNUES = new Set(['lease_contract', 'inventory_move_in', 'inventory_move_out', 'receipt_rent']);

function DocumentsDuBail({ id }: { readonly id: number }) {
  const t = useTranslations('messaging.salle.dossier');
  const f = useFormatteurs();
  const deposes = useDocuments({ documentable_type: 'lease', documentable_id: id, per_page: PIECES_DU_DOSSIER });
  const generes = useDocumentsGeneres({ type: 'lease', id });
  if (deposes.isPending || generes.isPending) return null;
  const listeGeneres: readonly DocumentGenere[] = generes.data?.data ?? [];
  const listeDeposes = deposes.data?.data ?? [];
  const total = listeGeneres.length + (deposes.data?.meta?.total ?? listeDeposes.length);
  const versLOnglet = `/app/leases/${id}?onglet=documents`;
  const lignes = [
    ...listeGeneres.map((doc) => ({
      cle: doc.download_path,
      titre: t(`generes.${CATEGORIES_CONNUES.has(doc.category) ? doc.category : 'autre'}`),
      detail: doc.date ? t('genereLe', { date: f.jourMois(doc.date) }) : null,
    })),
    ...listeDeposes.map((doc) => ({ cle: `d-${doc.id}`, titre: doc.name, detail: doc.created_at ? t('deposeLe', { date: f.jourMois(doc.created_at) }) : null })),
  ].slice(0, PIECES_DU_DOSSIER);

  return (
    <Section
      titre={t('documents')}
      testId="documents-de-la-salle"
      action={
        total > 0 ? (
          <Link href={versLOnglet} className="flex-none text-xs font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
            {t('toutVoir', { n: total })}
          </Link>
        ) : undefined
      }
    >
      {lignes.length === 0 ? (
        <p className="py-2 text-ui text-muted-foreground">{t('aucunDocument')}</p>
      ) : (
        lignes.map((l) => (
          <Link key={l.cle} href={versLOnglet} className="flex items-center gap-2.5 py-2 text-ui outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <FileText className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block truncate font-medium text-foreground">{l.titre}</span>
              {l.detail ? <span className="block truncate text-xs text-muted-foreground">{l.detail}</span> : null}
            </span>
          </Link>
        ))
      )}
    </Section>
  );
}

function DossierDuBail({ id, conversation }: { readonly id: number; readonly conversation: Conversation }) {
  const t = useTranslations('messaging.salle.dossier');
  const f = useFormatteurs();
  const { data, isPending, isError } = useBailDeLaSalle(id);
  if (isPending) return <Attente />;
  const bail: BailDeLaSalle | undefined = data?.data;
  if (isError || !bail) return <p className="text-ui text-muted-foreground">{t('erreur')}</p>;

  const devise = bail.currency ?? 'XOF';
  const montant = (v: number | null | undefined) => f.montantCourt(v, devise);
  // Le personnel de l'agence du bail est le seul lecteur à qui l'API rend `commission_amount` : la
  // commission d'agence du bail, figée à son activation (§ commission_entries) — pas un honoraire
  // mensuel. Aucun « net reversé » ne s'en déduit : le reversement retient un taux sur chaque
  // encaissement (`PayoutService`), et l'API ne rend ce net à aucun lecteur.
  const honoraires = typeof bail.commission_amount === 'number' ? bail.commission_amount : null;

  return (
    <div data-testid="dossier-du-bail">
      <DocumentsDuBail id={id} />
      <Section titre={t('datesCles')}>
        {bail.payment_day ? <Ligne cle={t('echeance')} valeur={t('leJourDuMois', { jour: bail.payment_day })} /> : null}
        <Ligne cle={t('periode')} valeur={t('periodeValeur', { debut: f.jourMois(bail.start_date), fin: f.jourMois(bail.end_date) })} />
        {bail.next_revision_date ? <Ligne cle={t('revisionPossible')} valeur={f.jourMois(bail.next_revision_date)} /> : null}
        {bail.notice_period_days ? <Ligne cle={t('preavis')} valeur={t('preavisJours', { n: bail.notice_period_days })} /> : null}
      </Section>
      <Section titre={t('montants')} testId="montants-de-la-salle">
        {bail.monthly_rent != null ? <Ligne cle={t('loyer')} valeur={montant(bail.monthly_rent)} /> : null}
        {bail.monthly_charges ? <Ligne cle={t('charges')} valeur={montant(bail.monthly_charges)} /> : null}
        {bail.deposit_amount != null ? <Ligne cle={t('caution')} valeur={montant(bail.deposit_amount)} /> : null}
        {bail.late_fee_percent ? <Ligne cle={t('penalite')} valeur={f.pourcentage(bail.late_fee_percent / 100)} /> : null}
        {honoraires !== null ? <Ligne cle={t('honoraires')} valeur={montant(honoraires)} /> : null}
      </Section>
      <Membres conversation={conversation} qualite={(userId) => qualiteDansLeBail(bail, userId)} />
      <LienVersLaFiche href={`/app/leases/${bail.id}`}>{t('ouvrirLeBail')}</LienVersLaFiche>
    </div>
  );
}

function DossierDeLaReservation({ id, conversation }: { readonly id: number; readonly conversation: Conversation }) {
  const t = useTranslations('messaging.salle');
  const f = useFormatteurs();
  const { data, isPending, isError } = useBooking(id);
  if (isPending) return <Attente />;
  const resa = data?.data;
  if (isError || !resa) return <p className="text-ui text-muted-foreground">{t('dossier.erreur')}</p>;

  const devise = resa.currency ?? 'XOF';
  const montant = resa.total_amount ?? resa.price_at_booking;
  return (
    <div data-testid="dossier-de-la-reservation">
      <Section titre={t('dossier.datesCles')}>
        <Ligne cle={t('reservation.demandeeLe')} valeur={f.jourMois(resa.booking_date ?? resa.created_at)} />
        {resa.start_date ? <Ligne cle={t('reservation.arrivee')} valeur={f.jourMois(resa.start_date)} /> : null}
        {resa.end_date ? <Ligne cle={t('reservation.depart')} valeur={f.jourMois(resa.end_date)} /> : null}
      </Section>
      {montant != null || resa.deposit_amount != null ? (
        <Section titre={t('dossier.montants')}>
          {montant != null ? <Ligne cle={t('reservation.montant')} valeur={f.montantCourt(montant, devise)} /> : null}
          {resa.deposit_amount != null ? <Ligne cle={t('reservation.acompte')} valeur={f.montantCourt(resa.deposit_amount, devise)} /> : null}
        </Section>
      ) : null}
      <Membres conversation={conversation} qualite={(userId) => qualiteDansLaReservation(resa, userId)} />
      <LienVersLaFiche href={`/app/bookings/${resa.id}`}>{t('dossier.ouvrirLaReservation')}</LienVersLaFiche>
    </div>
  );
}
