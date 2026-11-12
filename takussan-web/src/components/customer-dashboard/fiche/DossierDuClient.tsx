'use client';

import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, FileText, FolderOpen, Home, IdCard, KeyRound, ListChecks, UserPlus, Users } from 'lucide-react';

import { CustomerLinkedRecords } from '@/components/crm/CustomerLinkedRecords';
import { CustomerMatches } from '@/components/crm/CustomerMatches';
import { CustomerTasksPanel } from '@/components/crm/CustomerTasksPanel';
import { InviterACreerSonCompte } from '@/components/crm/InviterACreerSonCompte';
import { CustomerDocumentsPanel } from '@/components/customer-dashboard/CustomerDocumentsPanel';
import { RevelationNumeroDePiece } from '@/components/customer-form/RevelationNumeroDePiece';
import { Surtitre } from '@/components/leads/boite/pieces';
import { useAuth } from '@/context/AuthContext';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import { valeurBornee, useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import type { Locale } from '@/i18n/config';
import {
  ancreDeLaSection,
  lignesDuDossier,
  nombreDeCorrespondances,
  nombreDeTachesOuvertes,
  PARAMETRE_DE_SECTION,
  SECTIONS_DU_DOSSIER,
  type SectionDuDossier,
} from '@/lib/crm/fiche-du-client';
import { formatDateTime } from '@/lib/format';
import { AGENT_CRM_QUERY_KEY, fetchMatchingProperties } from '@/lib/queries/agent-crm';
import { fetchCustomerTasks } from '@/lib/queries/pipeline';
import { cn } from '@/lib/utils';
import type { CustomerDetail, CustomerRelationship } from '@/types/customer';

/**
 * TCK-2589 (lot D) — le DOSSIER de la fiche client (maquette `app-clients-fiche` a, « Dossier ») :
 * les anciens onglets (tâches, réservations, baux, biens correspondants, documents, relations), plus
 * la pièce d'identité et le compte client, en lignes repliées en fin de fiche. Une ligne n'est
 * présente que si elle a quelque chose à montrer (`lignesDuDossier`, AC5). Une seule est ouverte à la
 * fois, dans l'URL (`?section=`), et se rouvre au retour, amenée à l'écran.
 *
 * Le contenu d'une ligne n'est monté qu'ouverte : ses requêtes ne partent qu'à l'ouverture, comme
 * celles d'un onglet inactif d'avant. Seuls les comptes de la ligne (tâches ouvertes, biens
 * correspondants) se lisent d'emblée, sur les requêtes que le résumé lit déjà (même clé de cache).
 */
export interface DossierDuClientProps {
  readonly customer: CustomerDetail;
  readonly relationships: readonly CustomerRelationship[];
  readonly peutInviter: boolean;
  /** TCK-955 — « Afficher » le numéro de pièce : l'admin seul (l'API tranche de toute façon). */
  readonly peutReveler: boolean;
}

/** TCK-586 — un type de relation que le front ne connaît pas se dit par un libellé neutre. */
const TYPES_DE_RELATION_CONNUS = new Set(['owner_tenant', 'agent_client']);

const ICONES: Record<SectionDuDossier, ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>> = {
  biens: Home,
  taches: ListChecks,
  documents: FolderOpen,
  relations: Users,
  reservations: KeyRound,
  baux: FileText,
  piece: IdCard,
  compte: UserPlus,
};

/** La section ouverte, lue dans l'URL ; seule une ligne présente s'ouvre. */
export function useSectionDuDossier(presentes: readonly SectionDuDossier[]) {
  const { params, remplacer } = useVueDansLUrl();
  const lue = valeurBornee(params, PARAMETRE_DE_SECTION, SECTIONS_DU_DOSSIER);
  const ouverte = lue !== null && presentes.includes(lue) ? lue : null;
  return {
    ouverte,
    basculer: (s: SectionDuDossier) => remplacer({ [PARAMETRE_DE_SECTION]: ouverte === s ? null : s }),
    ouvrir: (s: SectionDuDossier) => remplacer({ [PARAMETRE_DE_SECTION]: s }),
  };
}

function LigneDuDossier({
  section,
  libelle,
  detail,
  valeur,
  valeurLien,
  ouverte,
  onBasculer,
  amener,
  children,
}: {
  readonly section: SectionDuDossier;
  readonly libelle: string;
  readonly detail?: string | null;
  readonly valeur?: string | null;
  readonly valeurLien?: boolean;
  readonly ouverte: boolean;
  readonly onBasculer: () => void;
  /** Ouverte par l'URL au chargement : amenée à l'écran, une fois. */
  readonly amener: boolean;
  readonly children: ReactNode;
}) {
  const id = useId();
  const ligne = useRef<HTMLDivElement>(null);
  const Icone = ICONES[section];
  useEffect(() => {
    if (amener) ligne.current?.scrollIntoView?.({ block: 'start' });
    // Au chargement seulement : une ligne ouverte au toucher est déjà sous le doigt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ligne} id={ancreDeLaSection(section)} data-slot="ligne-du-dossier" data-section={section} className="scroll-mt-20">
      <button
        type="button"
        aria-expanded={ouverte}
        aria-controls={`${id}-contenu`}
        onClick={onBasculer}
        className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Icone className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-snug">
          <span className="block text-corps font-medium">{libelle}</span>
          {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
        </span>
        {valeur ? (
          <span className={cn('flex-none text-sm tabular-nums', valeurLien ? 'font-medium text-primary' : 'text-encre-douce')}>{valeur}</span>
        ) : null}
        <ChevronDown className={cn('size-4 flex-none text-muted-foreground transition-transform', ouverte && 'rotate-180')} aria-hidden="true" />
      </button>
      {ouverte ? (
        <div id={`${id}-contenu`} className="border-t border-border p-3.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function Relations({ relationships }: { readonly relationships: readonly CustomerRelationship[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('crm.customerDetail.relationships');
  return (
    <ul className="space-y-2">
      {relationships.map((rel) => (
        <li key={rel.id} className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-semibold text-foreground">{t(`type.${TYPES_DE_RELATION_CONNUS.has(rel.relationship_type) ? rel.relationship_type : 'other'}`)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {t('since', { date: formatDateTime(rel.start_date, locale) })}
            {rel.end_date ? t('until', { date: formatDateTime(rel.end_date, locale) }) : ''}
            {rel.is_primary ? t('primaryContact') : ''}
            {t('statusSuffix', { status: rel.status })}
          </p>
          {rel.notes ? <p className="mt-2 whitespace-pre-line text-pretty text-foreground">{rel.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function DossierDuClient({ customer, relationships, peutInviter, peutReveler }: DossierDuClientProps) {
  const t = useTranslations('crm.fiche.dossier');
  const tRelation = useTranslations('crm.customerDetail.relationships');
  const tPiece = useTranslations('crm.idTypes');
  const { token } = useAuth();
  const presentes = lignesDuDossier(customer, { relations: relationships.length, peutInviter });
  const { ouverte, basculer } = useSectionDuDossier(presentes);
  // Ouverte au chargement, par l'URL : la seule ligne à amener à l'écran.
  const [ouverteAuChargement] = useState(ouverte);

  // Les mêmes requêtes que le résumé (même clé) : aucune lecture de plus pour les deux comptes.
  const taches = useQuery({
    queryKey: PIPELINE_QUERY_KEY.customerTasks(customer.id),
    queryFn: () => fetchCustomerTasks(token ?? '', customer.id),
    enabled: !!token,
  });
  const correspondances = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.matchingProperties(customer.id),
    queryFn: () => fetchMatchingProperties(token ?? '', customer.id),
    enabled: !!token && presentes.includes('biens'),
    retry: false,
  });

  if (presentes.length === 0) return null;
  const documents = customer.documents ?? [];
  const nombreDeTaches = nombreDeTachesOuvertes(taches.data);
  const nombreDeBiens = nombreDeCorrespondances(correspondances.data);
  const premiereRelation = relationships[0];

  const lignes: Record<SectionDuDossier, { libelle: string; detail?: string | null; valeur?: string | null; valeurLien?: boolean; contenu: ReactNode }> = {
    biens: {
      libelle: t('biens'),
      detail: t('biensDetail'),
      valeur: nombreDeBiens === null ? null : String(nombreDeBiens),
      contenu: <CustomerMatches customerId={customer.id} firstName={customer.first_name} phone={customer.phone} />,
    },
    taches: {
      libelle: t('taches'),
      detail: nombreDeTaches === null ? null : t('tachesDetail', { count: nombreDeTaches }),
      valeur: nombreDeTaches === null ? null : String(nombreDeTaches),
      contenu: <CustomerTasksPanel customerId={customer.id} />,
    },
    documents: {
      libelle: t('documents'),
      detail: documents.slice(0, 2).map((d) => d.name).join(', '),
      valeur: String(documents.length),
      contenu: <CustomerDocumentsPanel customerId={customer.id} documents={documents} />,
    },
    relations: {
      libelle: t('relations'),
      detail: premiereRelation ? tRelation(`type.${TYPES_DE_RELATION_CONNUS.has(premiereRelation.relationship_type) ? premiereRelation.relationship_type : 'other'}`) : null,
      valeur: String(relationships.length),
      contenu: <Relations relationships={relationships} />,
    },
    reservations: {
      libelle: t('reservations'),
      valeur: String(customer.bookings_count ?? 0),
      contenu: <CustomerLinkedRecords customerId={customer.id} kind="bookings" />,
    },
    baux: {
      libelle: t('baux'),
      valeur: String(customer.leases_count ?? 0),
      contenu: <CustomerLinkedRecords customerId={customer.id} kind="leases" />,
    },
    piece: {
      libelle: t('piece'),
      detail: peutReveler ? t('pieceDetail') : customer.id_type && tPiece.has(customer.id_type) ? tPiece(customer.id_type) : null,
      valeur: customer.id_number_masked,
      contenu: customer.id_number_masked ? (
        <div className="text-sm">
          {customer.id_type && tPiece.has(customer.id_type) ? <p className="text-encre-douce">{tPiece(customer.id_type)}</p> : null}
          {peutReveler ? (
            <RevelationNumeroDePiece customerId={customer.id} masque={customer.id_number_masked} />
          ) : (
            <p className="mt-1 font-mono" data-testid="numero-de-piece">{customer.id_number_masked}</p>
          )}
        </div>
      ) : null,
    },
    compte: {
      libelle: t('compte'),
      detail: t('compteDetail'),
      valeur: t('inviter'),
      valeurLien: true,
      contenu: <InviterACreerSonCompte customerId={customer.id} />,
    },
  };

  return (
    <section data-slot="dossier-du-client" aria-label={t('titre')}>
      <Surtitre className="mb-2">{t('titre')}</Surtitre>
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {presentes.map((s) => (
          <LigneDuDossier
            key={s}
            section={s}
            libelle={lignes[s].libelle}
            detail={lignes[s].detail}
            valeur={lignes[s].valeur}
            valeurLien={lignes[s].valeurLien}
            ouverte={ouverte === s}
            onBasculer={() => basculer(s)}
            amener={ouverteAuChargement === s}
          >
            {lignes[s].contenu}
          </LigneDuDossier>
        ))}
      </div>
    </section>
  );
}
