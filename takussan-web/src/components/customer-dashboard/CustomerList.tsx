import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';

import { DataTable, type DataTableColumn, StatusBadge, type StatusTone } from '@/components/console';
import { CustomerTagChips } from '@/components/customer-dashboard/CustomerTagPicker';
import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';
import {
  customerStatusValues,
  pipelineStageValues,
} from '@/lib/schemas/customer';

interface CustomerListProps {
  readonly page: PaginatedResponse<CustomerListItem>;
  readonly onTagClick?: (name: string) => void;
}

export function CustomerList({ page, onTagClick }: CustomerListProps) {
  const t = useTranslations('crm.list');
  const { data: customers, meta } = page;
  if (!customers || customers.length === 0) return <CustomersEmpty />;

  /**
   * Les colonnes, dans l'ORDRE EXACT de la table faite main qu'elles remplacent
   * (client · contact · étiquettes · pipeline · statut), éprouvé par test.
   *
   * ⚠ La liste de CARTES sous `md` reste une liste de cartes : `DataTable` remplace la table du
   * bureau, pas la forme mobile — cf. la Direction UX de TCK-380, « ne pas convertir en table ce
   * qui se lit mieux en cartes ».
   */
  const colonnes: readonly DataTableColumn<CustomerListItem>[] = [
    {
      id: 'client',
      header: t('columns.client'),
      cell: (customer) => (
        <>
          <Link
            href={`/app/customers/${customer.id}`}
            className="block font-semibold text-foreground hover:text-foreground"
          >
            {customer.first_name} {customer.last_name}
          </Link>
          {customer.occupation ? (
            <p className="text-xs text-muted-foreground">{customer.occupation}</p>
          ) : null}
        </>
      ),
    },
    {
      id: 'contact',
      header: t('columns.contact'),
      className: 'text-muted-foreground',
      cell: (customer) => (
        <>
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="hover:underline">
              {customer.email}
            </a>
          ) : null}
          {customer.email && customer.phone ? <br /> : null}
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="hover:underline">
              {customer.phone}
            </a>
          ) : null}
          {!customer.email && !customer.phone ? '—' : null}
        </>
      ),
    },
    {
      id: 'tags',
      header: t('columns.tags'),
      cell: (customer) =>
        customer.tags && customer.tags.length > 0 ? (
          <CustomerTagChips tags={customer.tags} onTagClick={onTagClick} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'pipeline',
      header: t('columns.pipeline'),
      cell: (customer) => <PipelineBadge stage={customer.pipeline_stage} />,
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (customer) => <CustomerStatusBadge status={customer.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        className="hidden md:block"
        caption={t('caption')}
        columns={colonnes}
        rows={customers}
        rowKey={(customer) => customer.id}
      />

      <ul className="space-y-3 md:hidden">
        {customers.map((customer) => (
          <li key={customer.id}>
            <Link
              href={`/app/customers/${customer.id}`}
              className="block rounded-xl bg-card p-4 transition-colors hover:bg-muted"
            >
              <p className="text-sm font-semibold text-foreground">
                {customer.first_name} {customer.last_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {customer.email ?? customer.phone ?? '—'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <PipelineBadge stage={customer.pipeline_stage} />
                <CustomerStatusBadge status={customer.status} />
              </div>
              {customer.tags && customer.tags.length > 0 && (
                <div className="mt-1.5">
                  <CustomerTagChips tags={customer.tags} onTagClick={onTagClick} />
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        {t('pagination', {
          total: meta.total,
          page: meta.current_page,
          pages: meta.last_page,
        })}
      </p>
    </div>
  );
}

function PipelineBadge({
  stage,
}: {
  stage: CustomerListItem['pipeline_stage'];
}) {
  const t = useTranslations('crm.pipeline.stage');
  if (!stage) return <span className="text-xs text-muted-foreground">—</span>;
  // Repli sur le jeton brut : même invariant que le `?? stage` d'avant, pour une
  // valeur de fil que le front ne connaîtrait pas.
  const label = (pipelineStageValues as readonly string[]).includes(stage) ? t(stage) : stage;
  return <StatusBadge label={label} tone={PIPELINE_STAGE_TONE[stage] ?? 'neutral'} />;
}

/**
 * `étape du pipeline → ton du DS`, et `statut du client → ton du DS` (TCK-472).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CES DEUX TABLES REMPLACENT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce fichier définissait son propre `StatusBadge` — un HOMONYME du composant de `console/`, monté
 * juste sous un `DataTable` importé de ce même barrel. `<StatusBadge …>` y résolvait vers le
 * local, et rien, ni au typage ni au lint, ne le signalait. Il coloriait quatre étapes et deux
 * statuts à la main, en quatre familles de jetons, sans lire la table des tons.
 *
 * L'écart n'était pas seulement structurel : `qualified` portait `bg-primary/5 text-primary`, qui
 * mesure **4,24:1 en clair** sur `bg-muted` plein — la surface de la carte mobile survolée de ce
 * fichier même (l. 112, `hover:bg-muted`) — et **3,73:1 en sombre**, sous le seuil AA de 4,5:1 des
 * deux côtés. Personne ne l'avait mesuré : la couleur avait été choisie ici, pas dans la table.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE CRITÈRE D'ARBITRAGE — repris tel quel de `kyc/kyc-components.tsx`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   `attention` = une décision est attendue d'un opérateur.
 *   `info`      = c'est décidé, ça suit son cours, il n'y a rien à faire.
 *   `neutral`   = la fiche existe, rien n'est attendu.
 *
 * D'où `negotiating` → `attention` (il faut relancer), `qualified` → `info` (c'est engagé, ça
 * avance), `lead` et `prospect` → `neutral`.
 *
 * ⚠ **`deleted` va à `neutral` et NON à `danger`**, alors que `blocked` va à `danger`. Un client
 * supprimé est un état terminal dont plus rien n'est attendu ; un client bloqué est une décision
 * active qu'un opérateur a prise et qu'il peut lever. Les peindre pareil aurait effacé la seule
 * différence qui compte à l'écran. C'est aussi le choix qui expose le moins de surface au trou
 * mesuré du ton `danger` (cf. le docblock de `TONE_CLASSES`).
 *
 * ⚠ `active` passe de gris à `success` — il était `bg-muted text-foreground`, exactement comme
 * `deleted` et `lead`. Un statut nominal qui se peint comme l'absence de statut ne dit rien ; et
 * `available` chez le bien porte déjà `success` pour la même idée.
 */
const PIPELINE_STAGE_TONE: Readonly<Record<string, StatusTone>> = {
  lead: 'neutral',
  prospect: 'neutral',
  qualified: 'info',
  negotiating: 'attention',
  converted: 'success',
  lost: 'danger',
};

const CUSTOMER_STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  active: 'success',
  inactive: 'neutral',
  blocked: 'danger',
  deleted: 'neutral',
};

function CustomerStatusBadge({ status }: { status: CustomerListItem['status'] }) {
  const t = useTranslations('crm.customerStatus');
  const label = (customerStatusValues as readonly string[]).includes(status) ? t(status) : status;
  return <StatusBadge label={label} tone={CUSTOMER_STATUS_TONE[status] ?? 'neutral'} />;
}

/**
 * `useTranslations` (et non `getTranslations`) : ce fichier n'a pas de `'use client'` et il est
 * rendu depuis `app/customers/page.tsx`, un server component. next-intl expose le hook dans les
 * deux mondes tant que le composant n'est pas `async` — ce qui est le cas ici.
 */
function CustomersEmpty() {
  const t = useTranslations('crm.list');
  return (
    <EmptyState
      icon={<UserPlus className="size-8" aria-hidden="true" />}
      title={t('empty_title')}
      description={t('empty_description')}
      action={
        <Link href="/app/customers/new" className={buttonVariants()}>
          {t('empty_cta')}
        </Link>
      }
    />
  );
}
