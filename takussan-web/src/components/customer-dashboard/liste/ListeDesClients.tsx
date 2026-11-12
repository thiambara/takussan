'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowDownUp, ChevronDown, ChevronUp, KanbanSquare, Plus, Search, SlidersHorizontal, UserPlus, Users } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { CustomerTagChips } from '@/components/customer-dashboard/CustomerTagPicker';
import { CustomerListFilters, RechercheDesClients, useFiltresDesClients, type CrmTagOption } from '@/components/customer-dashboard/CustomerListFilters';
import { EmptyState } from '@/components/feedback';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Tabs, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { CreationDuClient } from '@/components/customer-form/creation/CreationDuClient';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { type ColonneTriable, sensDeLaColonne, triAuClic, type VueDesClients } from '@/lib/crm/liste-des-clients';
import { initiales } from '@/lib/fiche-publique';
import { type CanalDeContactClient, useDesignerReferent, useEnregistrerContactClient } from '@/lib/queries/customer-gestures';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';

import { EtapeDuClient, GestesDuClient, InitialesDuClient, type LectureDuClient, useLecteurDuClient } from './pieces';

/** La clé de traduction d'une vue (`crm.list.vues.*`). */
const CLE_DE_LA_VUE: Record<VueDesClients, string> = {
  'a-relancer': 'aRelancer',
  'mes-clients': 'mesClients',
  negociation: 'negociation',
  'sans-referent': 'sansReferent',
  tous: 'tous',
};

export interface ListeDesClientsProps {
  readonly page: PaginatedResponse<CustomerListItem>;
  readonly vue: VueDesClients;
  readonly tri: string | undefined;
  /** Les vues de ce lecteur (« Tous » compris) ; vide hors personnel. */
  readonly vues: readonly VueDesClients[];
  /** Le compte de chaque vue (`meta.total` d'une lecture `per_page=1`) ; `null` : illisible. */
  readonly comptes: Partial<Record<VueDesClients, number | null>>;
  /** Le personnel de l'agence : créer, « Étapes », les gestes enregistrés, « Planifier ». */
  readonly personnel: boolean;
  /** L'admin : « sans référent » au sous-titre. */
  readonly admin: boolean;
  /**
   * « Me désigner » sur une fiche sans référent : `{ moi }` (l'identifiant du lecteur) quand son profil
   * actif porte `crm.assign` ; `null` sinon — le bailleur, ou une lecture des capacités en panne.
   */
  readonly designer?: { readonly moi: number } | null;
  readonly crmTags: readonly CrmTagOption[];
  /** Une vue, un filtre ou une recherche est posé : l'état vide le dit au lieu d'inviter à créer. */
  readonly filtre: boolean;
}

/**
 * TCK-2590 — la liste des clients (maquette `app-clients` a, « Liste » et « Liste vide »).
 *
 *  · Téléphone (sous `lg`) : les vues en pastilles comptées, une ligne de 96 px par client (initiales,
 *    nom, relance en retard ou prochaine action, étape et sa recherche ; Appeler et WhatsApp).
 *  · Bureau (dès `lg`) : les vues en onglets, Étape · Statut · Étiquettes et la recherche, puis le
 *    tableau Client · Cherche · Étape · Prochaine action · Référent · Étiquettes, triable par client
 *    et par prochaine action, ses gestes au survol. Sous `xl`, le tableau garde sa largeur et défile
 *    dans sa carte.
 *
 * Tout l'état vit dans l'URL (`lib/crm/liste-des-clients`) : la page serveur lit, ce composant écrit.
 */
export function ListeDesClients(props: ListeDesClientsProps) {
  const { page, vue, vues, comptes, personnel, admin } = props;
  const t = useTranslations('crm.list');
  const tPage = useTranslations('dashboard.pages.customers');
  const { remplacer } = useVueDansLUrl();
  const maintenant = useMinuteCourante();
  const lire = useLecteurDuClient(maintenant);
  const [planifier, setPlanifier] = useState<{ readonly client: CustomerListItem; readonly lecture: LectureDuClient } | null>(null);
  // TCK-2590 — « Ajouter un client » ouvre la création sur place : plein écran au téléphone, panneau au bureau.
  const [creer, setCreer] = useState(false);
  // Un geste de contact s'enregistre à côté du lien, qui s'ouvre de lui-même : son échec ne retient ni
  // l'appel ni WhatsApp, mais il se DIT (P228.06) — la fiche ne porte pas ce contact.
  const enregistrement = useEnregistrerContactClient();
  const noter = personnel ? (id: number) => (channel: CanalDeContactClient) => enregistrement.mutate({ id, channel }) : undefined;

  const choisirVue = (v: VueDesClients) => remplacer({ vue: v === 'tous' ? null : v, sort: null, page: null });
  const clients = page.data ?? [];
  const lignes = clients.map((c) => ({ client: c, lecture: lire(c) }));
  const total = comptes.tous ?? null;
  const aRelancer = comptes['a-relancer'] ?? null;
  const sansReferent = comptes['sans-referent'] ?? null;

  const sousTitre =
    personnel && total !== null
      ? [
          t('sousTitre.total', { count: total }),
          aRelancer !== null ? t('sousTitre.aRelancer', { count: aRelancer }) : null,
          admin && sansReferent !== null ? t('sousTitre.sansReferent', { count: sansReferent }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;

  const actions = personnel ? (
    <>
      {/* TCK-379 — le pipeline est une VUE du CRM, desservie d'ici ; sa cible garde son propre refus serveur. */}
      <Link href="/app/crm/pipeline" className={buttonVariants({ variant: 'outline' })}>
        <KanbanSquare className="size-4" aria-hidden="true" />
        {tPage('pipelineView')}
      </Link>
      <button type="button" onClick={() => setCreer(true)} className={buttonVariants()}>
        <Plus className="size-4" aria-hidden="true" />
        {tPage('add')}
      </button>
    </>
  ) : undefined;

  const vide = clients.length === 0;

  return (
    <PagePleineLargeur data-slot="liste-des-clients" className="max-md:pb-6">
      {personnel ? (
        <DeclarerEnTete action={<ActionDEnTete libelle={tPage('add')} icone={<UserPlus className="size-5" aria-hidden="true" />} onClick={() => setCreer(true)} primaire />} />
      ) : null}

      <div className="max-md:hidden">
        <PageHeader
          title={tPage('title')}
          description={sousTitre}
          actions={actions}
          dessous={
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              {vues.length > 0 ? (
                <>
                  <Tabs value={vue} onValueChange={(v) => choisirVue(v as VueDesClients)}>
                    {/* Les vues de la maquette (`Vues`) : piste `p-1`, onglets `h-7 px-2.5`, compte en 13 px —
                        la petite taille du segmenté, resserrée sous ses propres variantes. */}
                    <TabsList size="sm" aria-label={t('vues.label')} className="portee-app:data-[variant=default]:data-[size=sm]:p-1">
                      {vues.map((v) => (
                        <TabsTrigger key={v} value={v} className={VUE_DU_BUREAU}>
                          {t(`vues.${CLE_DE_LA_VUE[v]}`)}
                          {comptes[v] != null ? (
                            <TabsCount className={cn('text-ui leading-normal', v === 'a-relancer' && (comptes[v] ?? 0) > 0 && 'font-semibold text-destructive')}>{comptes[v]}</TabsCount>
                          ) : null}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                </>
              ) : null}
              <CustomerListFilters crmTags={props.crmTags} />
              <RechercheDesClients className="ml-auto w-64" />
            </div>
          }
        />
      </div>

      {/* Téléphone et tablette : les vues en pastilles, la ligne de tri, la recherche et les filtres. */}
      <div className="lg:hidden">
        {vues.length > 0 ? (
          <RangeeDePuces aria-label={t('vues.label')} className="border-b border-border md:mt-5 md:px-0">
            {vues.map((v) => (
              <PuceDeFiltre key={v} active={v === vue} compte={comptes[v] ?? undefined} onClick={() => choisirVue(v)}>
                {t(`vues.${CLE_DE_LA_VUE[v]}`)}
              </PuceDeFiltre>
            ))}
          </RangeeDePuces>
        ) : null}
        <OutilsDuTelephone tri={props.tri} crmTags={props.crmTags} />
      </div>

      {enregistrement.isError ? (
        <p role="alert" className="mx-4 mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-ui text-destructive md:mx-0">
          {t('gestes.nonNote')}
        </p>
      ) : null}

      {vide ? (
        <ClientsVides personnel={personnel} filtre={props.filtre} onAjouter={() => setCreer(true)} />
      ) : (
        <>
          <ul className="border-t border-border lg:hidden" aria-label={t('caption')}>
            {lignes.map(({ client, lecture }) => (
              <li key={client.id}>
                <LigneDuClient client={client} lecture={lecture} noter={noter?.(client.id)} />
              </li>
            ))}
          </ul>
          <div className="px-4 pt-4 md:px-0 lg:hidden">
            <PropertyPagination meta={page.meta} />
          </div>

          <div className="hidden pt-6 lg:block">
            <div className="overflow-hidden rounded-xl border border-border bg-card max-xl:overflow-x-auto">
              <TableDesClients
                lignes={lignes}
                tri={props.tri}
                personnel={personnel}
                noter={noter}
                designer={props.designer ?? null}
                onTri={(colonne) => remplacer({ sort: triAuClic(props.tri, colonne), page: null })}
                onEtiquette={(nom) => remplacer({ tags: nom, page: null })}
                onPlanifier={(client, lecture) => setPlanifier({ client, lecture })}
              />
              <div className="border-t border-border px-4 py-3">
                <PropertyPagination meta={page.meta} />
              </div>
            </div>
          </div>
        </>
      )}

      {personnel ? <CreationDuClient open={creer} onClose={() => setCreer(false)} /> : null}
      {planifier ? (
        <PlanifierDialog
          customer={{ id: planifier.client.id, libelle: planifier.lecture.nom, telephone: planifier.client.phone, etape: planifier.client.pipeline_stage }}
          onClose={() => setPlanifier(null)}
        />
      ) : null}
    </PagePleineLargeur>
  );
}

/** La ligne « Les plus en retard d'abord », la loupe et « Filtres · N » (téléphone). */
const VUE_DU_BUREAU = [
  'portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:h-7',
  'portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:px-2.5',
  'portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:leading-normal',
].join(' ');

function OutilsDuTelephone({ tri, crmTags }: { readonly tri: string | undefined; readonly crmTags: readonly CrmTagOption[] }) {
  const t = useTranslations('crm.list');
  const tFiltres = useTranslations('crm.filters');
  const f = useFiltresDesClients();
  const [recherche, setRecherche] = useState(false);
  const libelleDuTri =
    tri === undefined
      ? t('tri.pertinence')
      : tri === '-follow_up_days'
        ? t('tri.relance')
        : tri.endsWith('next_action_at')
          ? t('tri.prochaine')
          : tri.endsWith('last_name')
            ? t('tri.nom')
            : t('tri.recents');
  const ouverte = recherche || f.search !== '';
  return (
    <>
      {/* La barre de la maquette fait 32 px : les deux boutons y tiennent à 32 et 28 px de dessin, leur
          cible de 44 px débordant par un pseudo-élément (`after:-inset-*`), sans pousser la barre. */}
      <div className="flex h-8 items-center gap-1 px-4 md:px-0">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowDownUp className="size-3.5 flex-none" aria-hidden="true" />
          <span className="truncate">{libelleDuTri}</span>
        </p>
        <button
          type="button"
          aria-expanded={ouverte}
          aria-controls="recherche-des-clients"
          aria-label={tFiltres('searchLabel')}
          onClick={() => setRecherche((v) => !v)}
          className="relative inline-flex size-8 flex-none items-center justify-center rounded-full text-muted-foreground outline-none after:absolute after:-inset-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Search className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <FeuilleDuBas
          titre={t('filtres')}
          declencheur={
            <button
              type="button"
              className={cn(
                'relative inline-flex h-7 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none after:absolute after:-inset-x-0 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring',
                f.nombre > 0 ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground',
              )}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              {f.nombre > 0 ? t('filtresN', { n: f.nombre }) : t('filtres')}
            </button>
          }
        >
          <CustomerListFilters crmTags={crmTags} disposition="feuille" />
        </FeuilleDuBas>
      </div>
      {ouverte ? (
        <div id="recherche-des-clients" className="px-4 pb-2.5 md:px-0">
          <RechercheDesClients />
        </div>
      ) : null}
    </>
  );
}

interface LigneProps {
  readonly client: CustomerListItem;
  readonly lecture: LectureDuClient;
  /** Absent hors personnel : la ligne n'a alors pas de gestes enregistrés. */
  readonly noter: ((channel: CanalDeContactClient) => void) | undefined;
}

/** Une ligne du téléphone (96 px) : qui, où on en est, sa recherche — et deux gestes. */
function LigneDuClient({ client, lecture, noter }: LigneProps) {
  const t = useTranslations('crm.list');
  const tStage = useTranslations('crm.pipeline.stage');
  const etape = client.pipeline_stage ? (tStage.has(client.pipeline_stage) ? tStage(client.pipeline_stage) : client.pipeline_stage) : null;
  const cherche = lecture.cherche ? [lecture.cherche.quoi, lecture.cherche.budget].filter(Boolean).join(' · ') : null;
  return (
    <div data-slot="ligne-du-client" className="relative flex min-h-24 items-center gap-3 border-b border-border bg-card py-2.5 pr-3 pl-4 md:rounded-none">
      <InitialesDuClient texte={lecture.initiales} taille={44} />
      <div className="min-w-0 flex-1 leading-snug">
        <Link href={`/app/customers/${client.id}`} className="block truncate text-base leading-snug font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:underline">
          {lecture.nom}
        </Link>
        {lecture.prochaine ? (
          <p className={cn('flex items-start gap-1.5 text-sm', lecture.prochaine.enRetard ? 'font-medium text-destructive' : 'text-encre-douce')}>
            {lecture.prochaine.enRetard ? <span className="mt-2 size-1.5 flex-none rounded-full bg-destructive" aria-hidden="true" /> : null}
            <span className="line-clamp-2">{lecture.prochaine.texte}</span>
          </p>
        ) : lecture.contact ? (
          <p className="truncate text-sm text-encre-douce tabular-nums">{lecture.contact}</p>
        ) : null}
        <p className="truncate text-ui text-muted-foreground">
          {etape ? <span className="text-encre-douce">{etape}</span> : null}
          {etape && cherche ? ' · ' : null}
          {cherche ?? (etape ? null : t('cherche.rien'))}
        </p>
      </div>
      {/* Les gestes passent au-dessus du lien étiré de la ligne. */}
      <div className="relative flex flex-none items-center gap-3">
        <GestesDuClient client={client} lecture={lecture} noter={noter} forme="rond" />
      </div>
    </div>
  );
}

interface TableProps {
  readonly lignes: readonly { readonly client: CustomerListItem; readonly lecture: LectureDuClient }[];
  readonly tri: string | undefined;
  readonly personnel: boolean;
  readonly noter: ((id: number) => (channel: CanalDeContactClient) => void) | undefined;
  readonly designer: { readonly moi: number } | null;
  readonly onTri: (colonne: ColonneTriable) => void;
  readonly onEtiquette: (nom: string) => void;
  readonly onPlanifier: (client: CustomerListItem, lecture: LectureDuClient) => void;
}

function Th({ children, className, sens }: { readonly children?: ReactNode; readonly className?: string; readonly sens?: 'asc' | 'desc' | null }) {
  return (
    <th
      scope="col"
      aria-sort={sens === undefined ? undefined : sens === 'asc' ? 'ascending' : sens === 'desc' ? 'descending' : 'none'}
      className={cn('h-10 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground', className)}
    >
      {children}
    </th>
  );
}

function EnTeteTriable({ colonne, tri, onTri, children }: { readonly colonne: ColonneTriable; readonly tri: string | undefined; readonly onTri: (c: ColonneTriable) => void; readonly children: ReactNode }) {
  const t = useTranslations('crm.list');
  const sens = sensDeLaColonne(tri, colonne);
  const Icone = sens === 'asc' ? ChevronDown : sens === 'desc' ? ChevronUp : ArrowDownUp;
  return (
    <button
      type="button"
      onClick={() => onTri(colonne)}
      aria-label={t('trierPar', { colonne: String(children) })}
      className={cn('inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring', sens && 'text-foreground')}
    >
      {children}
      <Icone className="size-3" aria-hidden="true" />
    </button>
  );
}

/** Le tableau du bureau (approche A) : Cherche et Prochaine action en colonnes, gestes au survol. */
function TableDesClients({ lignes, tri, personnel, noter, designer, onTri, onEtiquette, onPlanifier }: TableProps) {
  const t = useTranslations('crm.list');
  // Les largeurs de la maquette sont des pixels du bureau (densité ×0,9 : `--spacing` vaut 3,6 px) :
  // Client 200 puis 220 dès 1440, Étape 116, Prochaine action 250, Référent 105 puis 150, Étiquettes 150.
  return (
    <table className="w-full table-fixed max-xl:min-w-[calc(var(--spacing)*266.7)]">
      <caption className="sr-only">{t('caption')}</caption>
      <thead className="border-b border-border bg-muted/40">
        <tr>
          <Th className="w-[calc(var(--spacing)*55.56)] pl-4 w1440:w-[calc(var(--spacing)*61.11)]" sens={sensDeLaColonne(tri, 'client')}>
            <EnTeteTriable colonne="client" tri={tri} onTri={onTri}>
              {t('columns.client')}
            </EnTeteTriable>
          </Th>
          <Th>{t('columns.cherche')}</Th>
          <Th className="w-[calc(var(--spacing)*32.22)]">{t('columns.etape')}</Th>
          <Th className="w-[calc(var(--spacing)*69.44)]" sens={personnel ? sensDeLaColonne(tri, 'prochaine') : undefined}>
            {personnel ? (
              <EnTeteTriable colonne="prochaine" tri={tri} onTri={onTri}>
                {t('columns.prochaine')}
              </EnTeteTriable>
            ) : (
              t('columns.prochaine')
            )}
          </Th>
          <Th className="w-[calc(var(--spacing)*29.17)] w1440:w-[calc(var(--spacing)*41.67)]">{t('columns.referent')}</Th>
          <Th className="w-[calc(var(--spacing)*41.67)]">{t('columns.tags')}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {lignes.map(({ client, lecture }) => (
          <tr key={client.id} data-slot="rangee-du-client" className="group hover:bg-secondary/50 focus-within:bg-secondary/50">
            <td className="px-3 py-2.5 pl-4 align-middle text-sm">
              <span className="flex items-center gap-2.5">
                <InitialesDuClient texte={lecture.initiales} taille={32} />
                <span className="min-w-0 leading-snug">
                  <Link href={`/app/customers/${client.id}`} className="block truncate font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline">
                    {lecture.nom}
                  </Link>
                  {lecture.contact ? <span className="block truncate text-xs text-muted-foreground tabular-nums">{lecture.contact}</span> : null}
                </span>
              </span>
            </td>
            <td className="px-3 py-2.5 align-middle text-sm text-encre-douce">
              {lecture.cherche ? (
                <span className="block leading-snug">
                  {lecture.cherche.quoi ? <span className="block truncate">{lecture.cherche.quoi}</span> : null}
                  {lecture.cherche.budget ? <span className="block truncate text-xs tabular-nums">{lecture.cherche.budget}</span> : null}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="px-3 py-2.5 align-middle text-sm">
              <EtapeDuClient stage={client.pipeline_stage} />
            </td>
            <td className={cn('px-3 py-2.5 align-middle text-sm', lecture.prochaine?.enRetard ? 'font-medium text-destructive' : 'text-encre-douce')}>
              <span className="flex items-center">
                <span className="min-w-0 flex-1 truncate">
                  {lecture.prochaine?.texte ?? (
                    // Rien de prévu ET personne pour le prévoir : la maquette le dit à cette place.
                    <span className="text-muted-foreground">{personnel && !client.referent ? t('prochaine.sansReferent') : '—'}</span>
                  )}
                </span>
                {/* Au repos, les gestes ne prennent AUCUNE place (largeur nulle, toujours atteignables au
                    clavier : le focus les déplie) — l'action prévue garde toute la colonne. */}
                <span className="flex max-w-0 flex-none items-center gap-1 overflow-hidden text-foreground opacity-0 transition-opacity group-focus-within:max-w-none group-focus-within:overflow-visible group-focus-within:pl-1.5 group-focus-within:opacity-100 group-hover:max-w-none group-hover:pl-1.5 group-hover:opacity-100 tactile:max-w-none tactile:pl-1.5 tactile:opacity-100">
                  <GestesDuClient
                    client={client}
                    lecture={lecture}
                    noter={noter?.(client.id)}
                    forme="petit"
                    onPlanifier={personnel ? () => onPlanifier(client, lecture) : undefined}
                  />
                </span>
              </span>
            </td>
            <td className="px-3 py-2.5 align-middle text-sm text-encre-douce">
              <Referent client={client} nom={lecture.nom} designer={designer} />
            </td>
            <td className="px-3 py-2.5 align-middle text-sm">
              {client.tags && client.tags.length > 0 ? (
                <span className="flex gap-1 overflow-hidden">
                  <CustomerTagChips tags={client.tags} onTagClick={onEtiquette} />
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Le référent : avatar et nom ; sous 1440, l'avatar seul (le nom au lecteur d'écran et au survol). */
function Referent({ client, nom, designer }: { readonly client: CustomerListItem; readonly nom: string; readonly designer: { readonly moi: number } | null }) {
  const r = client.referent;
  if (!r) return designer ? <MeDesigner client={client} nom={nom} moi={designer.moi} /> : <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-2" title={r.name}>
      <span className="inline-flex size-6 flex-none items-center justify-center rounded-full bg-fond-avatar text-pastille font-semibold text-encre-avatar" aria-hidden="true">
        {initiales(r.name)}
      </span>
      <span className="hidden truncate w1440:block">{r.name}</span>
      <span className="sr-only w1440:hidden">{r.name}</span>
    </span>
  );
}

/**
 * « Me désigner » : le lecteur devient le référent de la fiche, puis la page se relit (le référent
 * et le compte « Sans référent » viennent du serveur). Offert à qui porte `crm.assign` seulement.
 */
function MeDesigner({ client, nom, moi }: { readonly client: CustomerListItem; readonly nom: string; readonly moi: number }) {
  const t = useTranslations('crm.list.referent');
  const router = useRouter();
  const toast = useToast();
  const designation = useDesignerReferent();
  return (
    <button
      type="button"
      disabled={designation.isPending}
      aria-label={t('designerAria', { name: nom })}
      onClick={() =>
        designation.mutate(
          { id: client.id, userId: moi },
          {
            onSuccess: () => {
              toast.add({ title: t('designe', { name: nom }), type: 'success' });
              router.refresh();
            },
            onError: () => toast.add({ title: t('erreur'), type: 'error' }),
          },
        )
      }
      className="rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
    >
      {t('designer')}
    </button>
  );
}

/** « Pas encore de clients » — ou, sous une vue ou un filtre, « Aucun client ici ». */
function ClientsVides({ personnel, filtre, onAjouter }: { readonly personnel: boolean; readonly filtre: boolean; readonly onAjouter: () => void }) {
  const t = useTranslations('crm.list');
  const tPage = useTranslations('dashboard.pages.customers');
  if (filtre) {
    return (
      <div className="px-4 pt-6 md:px-0">
        <EmptyState icon={<Users className="size-6" aria-hidden="true" />} title={t('videFiltre.title')} description={t('videFiltre.description')} />
      </div>
    );
  }
  return (
    <div className="px-4 pt-6 md:px-0">
      <div className="rounded-xl md:border md:border-border md:bg-card">
        <EmptyState
          icon={<Users className="size-6" aria-hidden="true" />}
          title={t('vide.title')}
          description={personnel ? t('vide.description') : t('vide.descriptionBailleur')}
          action={
            personnel ? (
              <button type="button" onClick={onAjouter} className={buttonVariants()}>
                <Plus className="size-4" aria-hidden="true" />
                {tPage('add')}
              </button>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
