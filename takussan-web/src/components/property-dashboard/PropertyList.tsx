'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, Home, Loader2, X } from 'lucide-react';

import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { useFloatingDockSlot } from '@/components/floating-dock';
import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parametresSansFiltre } from '@/lib/biens/mode-de-liste';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';
import {
  bulkArchivePropertiesAction,
  bulkAssignPropertiesAction,
  bulkUnpublishPropertiesAction,
} from '@/app/actions/dashboard-properties';
import type { BulkResult } from '@/types/agent-crm';

import { CarteAnnonce } from './CarteAnnonce';
import {
  CarteGestion,
  CelluleAgent,
  CelluleOccupant,
  MontantDuBien,
  PuceEtatDuMois,
  VignetteDuBien,
  lieuDuBien,
} from './GestionDuBien';
import { PropertyRowActions } from './PropertyRowActions';
import { useGestesDuBien } from './useGestesDuBien';

/**
 * La liste des biens du tableau de bord, en deux présentations (TCK-2638) : `gestion` (carte compacte au
 * téléphone, tableau Bien · Bailleur · Locataire · Loyer · Ce mois · Agent au bureau) et `annonces`
 * (cartes à grande photo, une colonne au téléphone, deux dès `lg`, trois dès `xl`). La sélection, les
 * actions groupées (barre collée en bas) et les deux états vides sont les mêmes dans les deux.
 */

interface PropertyListProps {
  readonly page: PaginatedResponse<PropertyListItem>;
  readonly currentUserId?: number;
  readonly agentOptions?: readonly { id: number; name: string }[];
  /**
   * TCK-2638 — `gestion` : l'occupation, le loyer et l'état du mois (carte compacte, tableau
   * Bien · Bailleur · Locataire · Loyer · Ce mois · Agent). `annonces` (défaut) : les cartes à grande
   * photo du mode Annonces (lot B), « En ligne » lu sur `is_online`.
   */
  readonly presentation?: 'gestion' | 'annonces';
}


export function PropertyList({
  page,
  currentUserId,
  agentOptions = [],
  presentation = 'annonces',
}: PropertyListProps) {
  const t = useTranslations('property.dashboard.list');
  const tGestion = useTranslations('property.dashboard.gestion');
  const tAnnonces = useTranslations('property.dashboard.annonces');
  // L'état du mois compte des jours : une seule date pour toute la liste, prise au premier rendu.
  const [aujourdhui] = useState(() => new Date());
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: properties } = page;
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAgentId, setBulkAgentId] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkFailures, setBulkFailures] = useState<BulkResult['failed']>([]);
  const tBulk = useTranslations('agentCrm.bulk');
  const visibleIds = useMemo(
    () => properties?.map((property) => property.id) ?? [],
    [properties],
  );

  // Les paramètres qui ne filtrent pas — ni ceux de l'AUTRE mode, gardés pour le retour (TCK-2638) — ne
  // font pas d'un portefeuille vide un « filtre sans résultat ».
  const sansFiltre = parametresSansFiltre(presentation);
  const hasActiveFilters = Array.from(searchParams.keys()).some((k) => !sansFiltre.has(k));

  if (!properties || properties.length === 0) {
    const vide = hasActiveFilters ? (
      // TCK-2638 — réinitialiser garde le mode : c'est une vue, pas un filtre.
      <PortfolioFilteredEmpty
        onReset={() => router.replace(searchParams.get('mode') ? `?mode=${searchParams.get('mode')}` : '?')}
      />
    ) : (
      <PortfolioEmpty />
    );
    // TCK-2638 — la page est pleine largeur au téléphone, dans les deux modes : l'état vide pose sa marge.
    return <div className="px-4 md:px-0">{vide}</div>;
  }

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
  };

  const toggleOne = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  };

  /**
   * TCK-591 §7 (AC28) — le bilan d'un lot : combien ont changé, lesquels sont refusés et POURQUOI.
   * Seuls les refus restent sélectionnés (on peut les corriger et relancer) ; la liste se rafraîchit
   * dès qu'un bien a changé, succès partiel compris.
   *
   * TCK-603 — « Changer l'agent responsable » passe par le même lot (`bulk-assign`) : il remplaçait
   * un `Promise.all` d'appels unitaires qui s'arrêtait au premier refus sans dire lesquels avaient
   * changé. Un bien déjà suivi par l'agent est compté à part (`unchanged`), pas refusé.
   */
  const runBatch = (
    action: (ids: number[]) => Promise<{ ok: boolean; message?: string; data?: BulkResult }>,
    kind: 'archive' | 'unpublish' | 'assign',
  ) => {
    if (selectedIds.length === 0) return;
    setBulkError(null);
    setBulkMessage(null);
    setBulkFailures([]);
    startTransition(async () => {
      const result = await action(selectedIds);
      if (!result.ok || !result.data) {
        setBulkError(result.message ?? t('bulkError'));
        return;
      }
      const { updated, failed, unchanged = 0 } = result.data;
      setSelectedIds(failed.map((f) => f.id));
      setBulkFailures(failed);
      if (failed.length === 0) setBulkAgentId('');
      setBulkMessage(tBulk(`summary.${kind}`, { updated, unchanged, failed: failed.length }));
      if (updated > 0) router.refresh();
    });
  };

  const titleOf = (id: number) => properties.find((p) => p.id === id)?.title ?? `#${id}`;
  const KNOWN_REASONS = new Set(['not_found', 'forbidden', 'unchanged', 'invalid_target', 'invalid_status', 'already_archived']);
  const failureLines = bulkFailures.map((f) => ({
    id: f.id,
    text: tBulk('failure', {
      title: titleOf(f.id),
      reason: tBulk(`reason.${KNOWN_REASONS.has(f.reason) ? f.reason : 'other'}`),
    }),
  }));

  const selectedCount = selectedIds.length;

  /**
   * La colonne de sélection garde son en-tête à la case à cocher « tout sélectionner » : c'est un
   * CONTRÔLE, pas un libellé, donc ni `headerSrOnly` ni titre inventé.
   */
  const colonneSelection: DataTableColumn<PropertyListItem> = {
    id: 'select',
    header: (
      <input
        type="checkbox"
        aria-label={t('selectAll')}
        checked={allVisibleSelected}
        onChange={toggleAll}
        className="size-4 rounded border-border"
      />
    ),
    className: 'w-10 align-middle',
    cell: (property) => (
      <input
        type="checkbox"
        aria-label={t('selectOne', { title: property.title })}
        checked={selectedIds.includes(property.id)}
        onChange={() => toggleOne(property.id)}
        className="size-4 rounded border-border"
      />
    ),
  };

  // Le bilan reste lisible quand le lot a tout traité et que la sélection s'est vidée.
  const barreGroupee =
    selectedCount > 0 || bulkMessage ? (
      <BulkActionBar
        selectedCount={selectedCount}
        pending={pending}
        bulkError={bulkError}
        bulkMessage={bulkMessage}
        bulkAgentId={bulkAgentId}
        setBulkAgentId={setBulkAgentId}
        agentOptions={agentOptions}
        currentUserId={currentUserId}
        failureLines={failureLines}
        onArchive={() => runBatch(bulkArchivePropertiesAction, 'archive')}
        onUnpublish={() => runBatch(bulkUnpublishPropertiesAction, 'unpublish')}
        onAssign={() =>
          runBatch((ids) => bulkAssignPropertiesAction(ids, Number(bulkAgentId)), 'assign')
        }
        onClear={() => {
          setSelectedIds([]);
          setBulkAgentId('');
          setBulkError(null);
          setBulkMessage(null);
          setBulkFailures([]);
        }}
      />
    ) : null;

  /**
   * TCK-2638 — le tableau Gestion de la maquette : Bien · Bailleur · Locataire et fin de bail ·
   * Loyer / mois · Ce mois · Agent · « ⋯ ». Les largeurs sont celles de la maquette sur l'échelle
   * (la colonne « Bien » prend le reste et tronque) : à 1280, le « ⋯ » tient entier (AC6).
   */
  const colonnesGestion: readonly DataTableColumn<PropertyListItem>[] = [
    colonneSelection,
    {
      id: 'property',
      header: tGestion('colonnes.bien'),
      className: 'w-full max-w-0 align-middle',
      cell: (property) => {
        const lieu = lieuDuBien(property);
        return (
          <span className="flex items-center gap-3">
            <VignetteDuBien property={property} taille="ligne" />
            <span className="min-w-0 leading-tight">
              <Link
                href={`/app/properties/${property.id}`}
                className="block truncate font-medium text-foreground hover:text-primary"
              >
                {property.title}
              </Link>
              <span className="block truncate text-xs text-muted-foreground">
                {[lieu, property.reference_number].filter(Boolean).join(' · ')}
              </span>
            </span>
          </span>
        );
      },
    },
    {
      id: 'landlord',
      header: tGestion('colonnes.bailleur'),
      className: 'w-33 max-w-33 align-middle',
      cell: (property) => <span className="block truncate">{property.owner?.name ?? '—'}</span>,
    },
    {
      id: 'tenant',
      header: tGestion('colonnes.locataire'),
      className: 'w-38 max-w-38 align-middle',
      cell: (property) => <CelluleOccupant property={property} aujourdhui={aujourdhui} />,
    },
    {
      id: 'rent',
      header: tGestion('colonnes.loyer'),
      align: 'end',
      className: 'w-26 align-middle',
      cell: (property) => <MontantDuBien property={property} periode="si-autre" className="font-medium" />,
    },
    {
      id: 'month',
      header: tGestion('colonnes.ceMois'),
      className: 'w-32 align-middle',
      cell: (property) => <PuceEtatDuMois property={property} aujourdhui={aujourdhui} court />,
    },
    {
      id: 'agent',
      header: tGestion('colonnes.agent'),
      className: 'w-13 align-middle',
      cell: (property) => <CelluleAgent property={property} />,
    },
    {
      id: 'actions',
      header: tGestion('colonnes.actions'),
      headerSrOnly: true,
      align: 'end',
      className: 'w-11 align-middle',
      cell: (property) => <PropertyRowActions property={property} layout="menu" />,
    },
  ];

  if (presentation === 'gestion') {
    return (
      <div className="space-y-4">
        <DataTable
          className="hidden lg:block"
          caption={tGestion('caption')}
          columns={colonnesGestion}
          rows={properties}
          rowKey={(property) => property.id}
          rowProps={(property) => ({
            className: cn('transition-colors hover:bg-muted/30', selectedIds.includes(property.id) && 'bg-primary/5'),
          })}
          stickyHeader
        />
        <ul
          aria-label={tGestion('caption')}
          className="divide-y divide-border border-y border-border bg-card md:-mx-6 lg:hidden"
        >
          {properties.map((property) => (
            <CarteGestion
              key={property.id}
              property={property}
              aujourdhui={aujourdhui}
              selectionne={selectedIds.includes(property.id)}
              onBasculer={() => toggleOne(property.id)}
              libelleCase={t('selectOne', { title: property.title })}
            />
          ))}
        </ul>
        {barreGroupee}
      </div>
    );
  }

  /**
   * TCK-2638 (lot B) — les cartes du mode Annonces (maquette a-1) : une colonne au téléphone, deux dès
   * `lg`, trois dès `xl`. `minmax(0, 1fr)` (`grid-cols-1`) borne la piste à la largeur disponible : la
   * piste implicite d'une grille se dimensionne au contenu maximal (TCK-644, carte élargie à 498 px).
   * « Tout sélectionner » reste au bureau, au-dessus de la grille.
   */
  return (
    <div className="space-y-4">
      <label className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
        <input
          type="checkbox"
          aria-label={t('selectAll')}
          checked={allVisibleSelected}
          onChange={toggleAll}
          className="size-4 rounded border-border"
        />
        {t('selectAll')}
      </label>
      <ul aria-label={tAnnonces('caption')} className="grid grid-cols-1 gap-3 px-4 md:px-0 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
        {properties.map((property) => (
          <CarteAnnonce
            key={property.id}
            property={property}
            currentUserId={currentUserId}
            selectionne={selectedIds.includes(property.id)}
            onBasculer={() => toggleOne(property.id)}
            libelleCase={t('selectOne', { title: property.title })}
          />
        ))}
      </ul>
      {barreGroupee}
    </div>
  );
}

function PortfolioEmpty() {
  const t = useTranslations('property.portfolio');
  return (
    <EmptyState
      icon={<Home className="size-8" aria-hidden="true" />}
      title={t('empty_title')}
      description={t('empty_description')}
      action={
        <Link href="/app/properties/new" className={buttonVariants()}>
          {t('empty_cta')}
        </Link>
      }
    />
  );
}

function PortfolioFilteredEmpty({ onReset }: { readonly onReset: () => void }) {
  const t = useTranslations('property.portfolio');
  return (
    <EmptyState
      icon={<Home className="size-8" aria-hidden="true" />}
      title={t('filtered_empty_title')}
      description={t('filtered_empty_description')}
      action={
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          {t('filtered_empty_cta')}
        </Button>
      }
    />
  );
}

/** Hauteur d'une rangée de la barre d'actions groupées (`py-2.5` + boutons `h-9`). */
const BULK_BAR_HEIGHT_PX = 56;

function BulkActionBar({
  selectedCount,
  pending,
  bulkError,
  bulkMessage,
  bulkAgentId,
  setBulkAgentId,
  agentOptions,
  currentUserId,
  failureLines = [],
  onArchive,
  onUnpublish,
  onAssign,
  onClear,
}: {
  readonly selectedCount: number;
  readonly pending: boolean;
  readonly bulkError: string | null;
  readonly bulkMessage: string | null;
  readonly bulkAgentId: string;
  readonly setBulkAgentId: (v: string) => void;
  readonly agentOptions: readonly { id: number; name: string }[];
  readonly currentUserId?: number;
  readonly failureLines?: readonly { id: number; text: string }[];
  readonly onArchive: () => void;
  readonly onUnpublish: () => void;
  readonly onAssign: () => void;
  readonly onClear: () => void;
}) {
  const t = useTranslations('property.dashboard.list');
  // TCK-587 — dépublier est un geste `properties.publish`, en lot comme à l'unité.
  const { canPublish } = useGestesDuBien();
  // TCK-644 — un créneau du FloatingDock, AU-DESSUS du lanceur de messagerie (priorité 0) : posée
  // en `bottom-3` au même coin que lui, la barre passait dessous et sa croix devenait inatteignable.
  // La hauteur déclarée ne sert qu'aux créneaux posés au-dessus d'elle (aucun aujourd'hui).
  const creneau = useFloatingDockSlot({
    id: 'property-bulk-bar',
    corner: 'bottom-right',
    priority: 1,
    height: BULK_BAR_HEIGHT_PX,
  });
  const items = agentOptions.map((agent) => ({
    value: String(agent.id),
    label:
      agent.id === currentUserId
        ? t('agentSelf', { name: agent.name })
        : agent.name,
  }));
  return (
    <div
      role="region"
      aria-label={t('bulkAria')}
      style={{ bottom: creneau.bottom }}
      className="fixed inset-x-2 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-foreground/95 px-3 py-2.5 text-sm text-primary-foreground shadow-lg backdrop-blur md:inset-x-auto md:right-6"
    >
      <span className="font-semibold">
        {t('bulkSelected', { count: selectedCount })}
      </span>
      <span className="hidden h-4 w-px bg-card/20 md:inline-block" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-card/30 bg-transparent text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"
        disabled={pending}
        onClick={onArchive}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Archive aria-hidden="true" />
        )}
        {t('bulkArchive')}
      </Button>
      {canPublish ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-card/30 bg-transparent text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"
          disabled={pending}
          onClick={onUnpublish}
        >
          {t('bulkUnpublish')}
        </Button>
      ) : null}
      {agentOptions.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="min-w-[180px]">
            <Select
              value={bulkAgentId}
              onValueChange={(v) => setBulkAgentId((v ?? '') as string)}
              items={items}
            >
              <SelectTrigger
                aria-label={t('bulkReassignPlaceholder')}
                className="border-card/30 bg-card/10 text-primary-foreground"
              >
                <SelectValue placeholder={t('bulkReassignPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {items.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-card/30 bg-transparent text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"
            disabled={pending || !bulkAgentId}
            onClick={onAssign}
          >
            {t('bulkAssign')}
          </Button>
        </div>
      ) : null}
      {bulkError ? (
        <span role="alert" className="rounded-md bg-background px-2 py-0.5 text-destructive">
          {bulkError}
        </span>
      ) : null}
      {bulkMessage ? (
        <span role="status" className="basis-full">
          {bulkMessage}
          {failureLines.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-primary-foreground/80" data-testid="bulk-failures">
              {failureLines.map((line) => (
                <li key={line.id}>{line.text}</li>
              ))}
            </ul>
          ) : null}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        aria-label={t('bulkClear')}
        className="ml-auto inline-flex size-8 items-center justify-center rounded-full text-primary-foreground/70 hover:bg-card/10 hover:text-primary-foreground"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
