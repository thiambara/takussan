'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, FileText, Info, Plus, SlidersHorizontal } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Button, buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { cheminApi } from '@/lib/chemin-api';
import {
  COMPTE_DE_L_ONGLET,
  elementsManquants,
  MOTIFS_D_ATTENTION,
  ONGLETS_DES_BAUX,
  useAgentsDeLAgence,
  useBauxDeLAgence,
  useListesDEntree,
  useResumeDesBaux,
  type AgentDuFiltre,
  type BailDeLaListe,
  type FiltresCommuns,
  type MotifDAttention,
  type OngletDesBaux,
  type PortionDesBaux,
  type ResumeDesBaux,
} from '@/lib/queries/leases-file';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { LeaseStatus, LeaseType } from '@/types/lease';

import { useLectureDuBail } from './lecture';
import { CarteDAttente, LigneDuBail, TableDAttente, TableDesBaux, type Attente } from './PiecesDesBaux';

/**
 * TCK-2644 — « Baux » de l'agence (maquette `app-baux`, approche a, « Liste — À traiter ») : la page
 * s'ouvre sur le travail du jour.
 *
 *  · Onglets comptés par UN appel (`GET /api/leases/summary`, AC2) : À traiter · Actifs · En attente
 *    du locataire · Terminés. Les brouillons restent atteignables par le statut (`?status=draft`).
 *  · Chaque ligne nomme le locataire, le bien, ce qui attend depuis quand, et porte UN geste.
 *  · La règle de la file est écrite sous la liste.
 *  · Rien ne se perd de l'ancienne liste : « Nouveau bail » selon la capacité, `?status=`, `?property=`
 *    (devenu un filtre « Bien » à recherche), la référence, le statut, les dates et le loyer, la
 *    pagination, les squelettes, l'erreur avec « Réessayer », le vide avec « Nouveau bail » ; et de
 *    l'écran des entrées en attente (TCK-266) : le lien vers le bail, la date de signature, les
 *    éléments manquants, les jours d'ouverture (rouges au-delà de 14).
 *
 * L'état vit dans l'URL : `vue` (l'onglet, « À traiter » par défaut), `status`, `property`, `type`,
 * `motif`, `q`. Un statut choisi l'emporte sur l'onglet.
 */
const STATUTS: readonly LeaseStatus[] = ['draft', 'pending_signature', 'active', 'terminating', 'expired', 'terminated', 'renewed'];
const TYPES: readonly LeaseType[] = ['residential_rent', 'commercial_rent', 'seasonal_rent', 'sale'];
/** Au téléphone, la file montre six cartes, puis « Afficher les N autres » (maquette). */
const CARTES_VISIBLES = 6;

function entier(v: string | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function choix<T extends string>(v: string | null, valeurs: readonly T[]): T | null {
  return v !== null && (valeurs as readonly string[]).includes(v) ? (v as T) : null;
}

export interface ListeDesBauxDeLAgenceProps {
  readonly peutCreer: boolean;
  /** L'agence du lecteur : l'onglet « En attente du locataire » y lit ce qui manque à chaque entrée. */
  readonly agencyId: number | null;
}

export function ListeDesBauxDeLAgence({ peutCreer, agencyId }: ListeDesBauxDeLAgenceProps) {
  const t = useTranslations('lease.liste');
  const { params, remplacer } = useVueDansLUrl();

  const statut = choix(params.get('status'), STATUTS);
  const onglet = choix(params.get('vue'), ONGLETS_DES_BAUX) ?? 'a_traiter';
  const motif = choix(params.get('motif'), MOTIFS_D_ATTENTION);
  const communs: FiltresCommuns = {
    search: params.get('q')?.trim() || null,
    propertyId: entier(params.get('property')),
    type: choix(params.get('type'), TYPES),
    agentId: entier(params.get('agent')),
  };
  const { agents } = useAgentsDeLAgence(agencyId);
  const portion: PortionDesBaux = statut ? { statut } : { onglet, motif: onglet === 'a_traiter' ? motif : null };

  const resume = useResumeDesBaux(communs);
  const comptes = resume.data?.data ?? null;

  const choisirOnglet = (o: OngletDesBaux) => remplacer({ vue: o === 'a_traiter' ? null : o, status: null, motif: null });
  const rechercher = (q: string) => remplacer({ q: q.trim() || null });

  const nouveauBail = peutCreer ? (
    <Link href="/app/leases/new" className={buttonVariants()}>
      <Plus className="size-4" aria-hidden="true" />
      {t('nouveauBail')}
    </Link>
  ) : null;

  const compteDe = (o: OngletDesBaux) => (comptes ? comptes[COMPTE_DE_L_ONGLET[o]] : undefined);
  const ongletActif = statut ? null : onglet;

  return (
    <PagePleineLargeur data-slot="liste-des-baux" className="max-md:pb-6">
      <DeclarerEnTete
        titre={t('titre')}
        action={peutCreer ? <ActionDEnTete libelle={t('nouveauBail')} icone={<Plus className="size-5" aria-hidden="true" />} href="/app/leases/new" primaire /> : undefined}
      />

      <div className="max-md:hidden">
        <PageHeader
          title={t('titre')}
          description={comptes ? sousTitre(t, comptes) : undefined}
          actions={nouveauBail}
          dessous={
            <div className="hidden lg:block">
              <Tabs value={ongletActif} onValueChange={(v) => choisirOnglet(v as OngletDesBaux)}>
                <TabsList variant="line" aria-label={t('onglets.label')}>
                  {ONGLETS_DES_BAUX.map((o) => (
                    <TabsTrigger key={o} value={o}>
                      {t(`onglets.${o}`)}
                      {compteDe(o) !== undefined ? <TabsCount>{compteDe(o)}</TabsCount> : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          }
        />
      </div>

      {/* Téléphone et tablette : la recherche et « Filtres », puis les vues en pastilles. */}
      <div className="lg:hidden">
        <div className="flex items-center gap-2 px-4 pt-3 md:mt-5 md:px-0">
          <DebouncedSearchInput value={communs.search ?? ''} onCommit={rechercher} placeholder={t('recherche')} aria-label={t('recherche')} className="min-w-0 flex-1" />
          <FiltresDuTelephone
            statut={statut}
            motif={portion && 'onglet' in portion ? (portion.motif ?? null) : null}
            type={communs.type}
            agentId={communs.agentId}
            agents={agents}
            montrerLeMotif={!statut && onglet === 'a_traiter'}
          />
        </div>
        <RangeeDePuces aria-label={t('onglets.label')} className="md:px-0">
          {ONGLETS_DES_BAUX.map((o) => (
            <PuceDeFiltre key={o} active={o === ongletActif} compte={compteDe(o)} onClick={() => choisirOnglet(o)}>
              {t(`onglets.${o}`)}
            </PuceDeFiltre>
          ))}
        </RangeeDePuces>
      </div>

      {/* Bureau : la recherche et les filtres. */}
      <div className="hidden flex-wrap items-center gap-3 pt-5 lg:flex xl:flex-nowrap">
        <DebouncedSearchInput value={communs.search ?? ''} onCommit={rechercher} placeholder={t('recherche')} aria-label={t('recherche')} className="h-9 w-[calc(var(--spacing)*83.33)] text-sm" />
        {!statut && onglet === 'a_traiter' ? (
          <Filtre libelle={t('filtres.motif')} valeur={motif ? t(`motifsDuFiltre.${motif}`) : t('filtres.tousLesMotifs')} actif={motif !== null} largeur={LARGE}>
            {(fermer) => (
              <Options
                tous={t('filtres.tousLesMotifs')}
                valeurs={MOTIFS_D_ATTENTION}
                choisie={motif}
                libelle={(m) => t(`motifsDuFiltre.${m}`)}
                onChoisir={(m) => (remplacer({ motif: m }), fermer())}
              />
            )}
          </Filtre>
        ) : null}
        <FiltreDuType type={communs.type} />
        <FiltreDuBien choisi={communs.propertyId} />
        {/* La file a ses motifs ; le statut (les brouillons, les signatures en cours) se choisit hors d'elle. */}
        {statut || onglet !== 'a_traiter' ? <FiltreDuStatut statut={statut} /> : null}
        {agents && agents.length > 0 ? <FiltreDeLAgent choisi={communs.agentId} agents={agents} /> : null}
      </div>

      <CorpsDeLaListe
        key={JSON.stringify([portion, communs])}
        portion={portion}
        communs={communs}
        comptes={comptes}
        agencyId={agencyId}
        nouveauBail={nouveauBail}
        onVoirLesActifs={() => choisirOnglet('actifs')}
      />
    </PagePleineLargeur>
  );
}

function sousTitre(t: ReturnType<typeof useTranslations<'lease.liste'>>, c: ResumeDesBaux): string {
  return t('sousTitre', { total: c.active + c.ended + c.draft, actifs: c.active, aTraiter: c.a_traiter });
}

/* ───────────────────────────── le corps ───────────────────────────── */

function attenteDe(bail: BailDeLaListe, portion: PortionDesBaux, manquants: ReadonlyMap<number, Attente['manquants']>): Attente | null {
  if ('statut' in portion || portion.onglet === 'actifs' || portion.onglet === 'termines') return null;
  const entrees = bail.attention ?? [];
  // Sous un motif choisi, c'est lui qui attend ; sur « En attente du locataire », l'entrée.
  const voulu: MotifDAttention | null = portion.onglet === 'en_attente' ? 'onboarding_incomplete' : (portion.motif ?? null);
  const entree =
    (voulu ? entrees.find((e) => e.motif === voulu) : entrees[0]) ??
    (portion.onglet === 'en_attente' ? { motif: 'onboarding_incomplete' as const, since: bail.signed_at ?? bail.start_date } : null);
  if (!entree) return null;
  return { entree, manquants: entree.motif === 'onboarding_incomplete' ? manquants.get(bail.id) : undefined };
}

function CorpsDeLaListe({
  portion,
  communs,
  comptes,
  agencyId,
  nouveauBail,
  onVoirLesActifs,
}: {
  readonly portion: PortionDesBaux;
  readonly communs: FiltresCommuns;
  readonly comptes: ResumeDesBaux | null;
  readonly agencyId: number | null;
  readonly nouveauBail: ReactNode;
  readonly onVoirLesActifs: () => void;
}) {
  const t = useTranslations('lease.liste');
  const tListe = useTranslations('lease.list');
  const tCommon = useTranslations('common');
  const [maintenant] = useState(() => new Date());
  const lecture = useLectureDuBail(maintenant);
  const [page, setPage] = useState(1);
  const [toutes, setToutes] = useState(false);
  const lu = useBauxDeLAgence(portion, communs, page);
  const baux = lu.data?.data ?? [];
  const total = lu.data?.meta?.total ?? baux.length;
  const file = !('statut' in portion) && (portion.onglet === 'a_traiter' || portion.onglet === 'en_attente');

  // Ce qui manque à chaque entrée en attente de la page : la ligne du bail ne le porte pas.
  const idsDesEntrees = file ? baux.filter((b) => 'onglet' in portion && (portion.onglet === 'en_attente' || b.attention?.some((e) => e.motif === 'onboarding_incomplete'))).map((b) => b.id) : [];
  const listes = useListesDEntree(agencyId, idsDesEntrees);
  const manquants = new Map((listes.data?.data ?? []).map((l) => [l.lease_id, elementsManquants(l)] as const));
  const lignes = baux.map((bail) => ({ bail, attente: attenteDe(bail, portion, manquants) }));

  const filtre = Boolean(communs.search || communs.propertyId || communs.type || communs.agentId || ('onglet' in portion && portion.motif));
  const parcVide = comptes !== null && comptes.active + comptes.ended + comptes.draft === 0 && !filtre;
  const icone = <FileText className="size-6" strokeWidth={1.75} aria-hidden="true" />;
  const vide = parcVide ? (
    <EmptyState variant="nue" icon={icone} title={tListe('empty_title')} description={tListe('empty_description')} action={nouveauBail ?? undefined} />
  ) : filtre ? (
    <EmptyState variant="nue" icon={icone} title={tListe('empty_filtered_title')} description={tListe('empty_filtered_description')} />
  ) : 'onglet' in portion && portion.onglet === 'a_traiter' ? (
    <EmptyState
      variant="nue"
      icon={icone}
      title={t('vide.a_traiter')}
      description={t('vide.a_traiterTexte')}
      action={
        <Button type="button" variant="outline" onClick={onVoirLesActifs}>
          {t('vide.voirActifs')}
        </Button>
      }
    />
  ) : 'onglet' in portion && portion.onglet === 'en_attente' ? (
    <EmptyState variant="nue" icon={icone} title={t('vide.en_attente')} description={t('vide.en_attenteTexte')} />
  ) : (
    <EmptyState variant="nue" icon={icone} title={t('vide.portion')} />
  );

  const contenu = lu.isError ? (
    <ErrorState message={t('erreur')} onRetry={() => void lu.refetch()} retryLabel={tCommon('actions.retry')} />
  ) : lu.isPending ? null : baux.length === 0 ? (
    vide
  ) : null;

  const compte = t(`compte.${'statut' in portion ? 'statut' : portion.onglet}`, { count: total });
  const pagination = lu.data?.meta ? (
    <Pagination page={lu.data.meta.current_page} lastPage={lu.data.meta.last_page} onChange={(p) => (setPage(p), setToutes(false))} summary={<span className="tabular-nums">{compte}</span>} />
  ) : null;
  const regle = 'onglet' in portion && portion.onglet === 'a_traiter';
  const visibles = toutes ? lignes : lignes.slice(0, CARTES_VISIBLES);
  const autres = lignes.length - visibles.length;

  return (
    <>
      {/* Téléphone et tablette : une carte par bail, un geste par carte dans la file. */}
      <div data-slot="liste-du-telephone" className="lg:hidden">
        {lu.isPending ? (
          <Chargement />
        ) : contenu ? (
          <div className="px-4 pt-2 md:px-0">{contenu}</div>
        ) : (
          <>
            <ul aria-label={t('caption')} className="space-y-3 px-4 md:px-0">
              {visibles.map(({ bail, attente }) =>
                file && attente ? (
                  <CarteDAttente key={bail.id} bail={bail} attente={attente} lecture={lecture} maintenant={maintenant} />
                ) : (
                  <LigneDuBail key={bail.id} bail={bail} lecture={lecture} />
                ),
              )}
            </ul>
            {autres > 0 ? (
              <div className="px-4 pt-4 md:px-0">
                <Button type="button" variant="outline" size="lg" className="h-11 w-full" onClick={() => setToutes(true)}>
                  {t('afficherLesAutres', { n: autres })}
                </Button>
              </div>
            ) : (lu.data?.meta.last_page ?? 1) > 1 ? (
              // Au téléphone, une page unique n'a pas de pagination (la maquette n'en dessine pas).
              <div className="px-4 pt-3 md:px-0">{pagination}</div>
            ) : null}
          </>
        )}
        {regle ? (
          <p className="mx-4 my-5 flex gap-2.5 rounded-xl bg-muted/60 p-3.5 text-ui leading-relaxed text-muted-foreground md:mx-0">
            <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
            {t('regle')}
          </p>
        ) : null}
      </div>

      {/* Bureau : le tableau, son compte et sa pagination dans la carte, la règle dessous. */}
      <div data-slot="liste-du-bureau" className="hidden pt-4 lg:block">
        {lu.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : contenu ? (
          <div className="rounded-xl border border-dashed border-border">{contenu}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            {file ? <TableDAttente lignes={lignes} lecture={lecture} maintenant={maintenant} /> : <TableDesBaux baux={baux} lecture={lecture} />}
            <div className="border-t border-border px-4 py-3">
              {pagination ?? <span className="text-ui tabular-nums text-muted-foreground">{compte}</span>}
            </div>
          </div>
        )}
        {regle ? (
          <p className="mt-4 flex max-w-[calc(var(--spacing)*238.9)] gap-2.5 text-ui leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
            {t('regle')}
          </p>
        ) : null}
      </div>
    </>
  );
}

function Chargement() {
  return (
    <div className="space-y-3 px-4 md:px-0" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

/* ───────────────────────────── les filtres ───────────────────────────── */

const DECLENCHEUR = 'inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring';
/** Les largeurs de la maquette (170 et 160 px au bureau) : un filtre ne change pas de taille avec sa valeur. */
const LARGE = 'w-[calc(var(--spacing)*47.22)]';
const ETROIT = 'w-[calc(var(--spacing)*44.44)]';

function Filtre({
  libelle,
  valeur,
  actif,
  largeur,
  children,
}: {
  readonly libelle: string;
  readonly valeur: string;
  readonly actif: boolean;
  readonly largeur: string;
  readonly children: (fermer: () => void) => ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger className={cn(DECLENCHEUR, largeur, actif ? 'border-primary/50 bg-secondary' : 'border-border bg-card')} aria-label={`${libelle} : ${valeur}`}>
        <span className="min-w-0 flex-1 truncate text-left text-foreground">{valeur}</span>
        <ChevronDown className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="max-h-80 w-72 space-y-1 overflow-y-auto p-1">{children(() => setOuvert(false))}</PopoverContent>
    </Popover>
  );
}

function Option({ choisie, onClick, children }: { readonly choisie: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button type="button" aria-pressed={choisie} onClick={onClick} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {choisie ? <Check className="size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
    </button>
  );
}

function Options<T extends string>({
  tous,
  valeurs,
  choisie,
  libelle,
  onChoisir,
}: {
  readonly tous: string;
  readonly valeurs: readonly T[];
  readonly choisie: T | null;
  readonly libelle: (v: T) => string;
  readonly onChoisir: (v: T | null) => void;
}) {
  return (
    <>
      <Option choisie={choisie === null} onClick={() => onChoisir(null)}>
        {tous}
      </Option>
      {valeurs.map((v) => (
        <Option key={v} choisie={choisie === v} onClick={() => onChoisir(v)}>
          {libelle(v)}
        </Option>
      ))}
    </>
  );
}

function FiltreDuType({ type }: { readonly type: LeaseType | null }) {
  const t = useTranslations('lease.liste.filtres');
  const tType = useTranslations('lease.types');
  const { remplacer } = useVueDansLUrl();
  return (
    <Filtre libelle={t('type')} valeur={type ? tType(type) : t('tousLesTypes')} actif={type !== null} largeur={ETROIT}>
      {(fermer) => <Options tous={t('tousLesTypes')} valeurs={TYPES} choisie={type} libelle={(v) => tType(v)} onChoisir={(v) => (remplacer({ type: v }), fermer())} />}
    </Filtre>
  );
}

/** L'agent du bail (`?agent=`) : la liste et les comptes des onglets. */
function FiltreDeLAgent({ choisi, agents }: { readonly choisi: number | null; readonly agents: readonly AgentDuFiltre[] }) {
  const t = useTranslations('lease.liste.filtres');
  const { remplacer } = useVueDansLUrl();
  const courant = agents.find((a) => a.id === choisi);
  return (
    <Filtre libelle={t('agent')} valeur={courant ? courant.nom : t('tousLesAgents')} actif={choisi !== null} largeur={ETROIT}>
      {(fermer) => (
        <>
          <Option choisie={choisi === null} onClick={() => (remplacer({ agent: null }), fermer())}>
            {t('tousLesAgents')}
          </Option>
          {agents.map((a) => (
            <Option key={a.id} choisie={choisi === a.id} onClick={() => (remplacer({ agent: a.id }), fermer())}>
              {a.nom}
            </Option>
          ))}
        </>
      )}
    </Filtre>
  );
}

/** Le statut : un choix l'emporte sur l'onglet (les brouillons, `?status=pending_signature`…). */
function FiltreDuStatut({ statut }: { readonly statut: LeaseStatus | null }) {
  const t = useTranslations('lease.liste.filtres');
  const tStatut = useTranslations('lease.status');
  const { remplacer } = useVueDansLUrl();
  return (
    <Filtre libelle={t('statut')} valeur={statut ? tStatut(statut) : t('tousLesStatuts')} actif={statut !== null} largeur={ETROIT}>
      {(fermer) => (
        <Options tous={t('tousLesStatuts')} valeurs={STATUTS} choisie={statut} libelle={(v) => tStatut(v)} onChoisir={(v) => (remplacer({ status: v, motif: null }), fermer())} />
      )}
    </Filtre>
  );
}

/**
 * Le bien choisi quand il n'est pas dans les huit proposés : son `show`, SANS `fields[...]` (un
 * `show` rend la ressource entière, P60.03) — dans sa propre déclaration pour que la garde le voie seul.
 */
function useBienChoisi(choisi: number | null, enabled: boolean): { readonly title: string | null } | null {
  const lu = useApiQuery<{ data: { readonly title: string | null } }>(['properties', 'filtre-des-baux', 'choisi', choisi], cheminApi`/api/properties/${choisi ?? 0}`, { enabled });
  return lu.data?.data ?? null;
}

/** Le bien (`?property=`, gardé de l'ancienne liste) : une liste cherchée côté serveur, huit à la fois. */
function FiltreDuBien({ choisi }: { readonly choisi: number | null }) {
  const t = useTranslations('lease.liste.filtres');
  const { remplacer } = useVueDansLUrl();
  const [terme, setTerme] = useState('');
  type Bien = { readonly id: number; readonly title: string | null; readonly reference_number?: string | null };
  const options = useApiQuery<PaginatedResponse<Bien>>(['properties', 'filtre-des-baux', terme], '/api/properties', {
    params: { fields: { properties: ['id', 'title', 'reference_number'] }, filter: terme ? { search: terme } : {}, per_page: 8 },
  });
  const liste = options.data?.data ?? [];
  const courant = liste.find((o) => o.id === choisi);
  const seul = useBienChoisi(choisi, choisi !== null && !courant);
  const libelleChoisi = (courant ?? seul)?.title;
  return (
    <Filtre libelle={t('bien')} valeur={choisi !== null && libelleChoisi ? libelleChoisi : t('tousLesBiens')} actif={choisi !== null} largeur={LARGE}>
      {(fermer) => (
        <>
          <DebouncedSearchInput value={terme} onCommit={setTerme} placeholder={t('bienRecherche')} aria-label={t('bienRecherche')} busy={options.isFetching} />
          <Option choisie={choisi === null} onClick={() => (remplacer({ property: null }), fermer())}>
            {t('tousLesBiens')}
          </Option>
          {liste.map((o) => (
            <Option key={o.id} choisie={choisi === o.id} onClick={() => (remplacer({ property: o.id }), fermer())}>
              {o.reference_number ? `${o.reference_number} · ` : ''}
              {o.title}
            </Option>
          ))}
        </>
      )}
    </Filtre>
  );
}

/** Téléphone : « Filtres » ouvre une feuille — le motif (dans la file), le type, le statut. */
function FiltresDuTelephone({
  statut,
  motif,
  type,
  agentId,
  agents,
  montrerLeMotif,
}: {
  readonly statut: LeaseStatus | null;
  readonly motif: MotifDAttention | null;
  readonly type: LeaseType | null;
  readonly agentId: number | null;
  readonly agents: readonly AgentDuFiltre[] | null;
  readonly montrerLeMotif: boolean;
}) {
  const t = useTranslations('lease.liste');
  const tStatut = useTranslations('lease.status');
  const tType = useTranslations('lease.types');
  const { remplacer } = useVueDansLUrl();
  const [ouverte, setOuverte] = useState(false);
  const actifs = [statut, montrerLeMotif ? motif : null, type, agentId].filter(Boolean).length;
  const groupe = (titre: string, contenu: ReactNode) => (
    <section className="space-y-1">
      <h3 className="px-2.5 pt-2 text-ui font-semibold text-muted-foreground">{titre}</h3>
      {contenu}
    </section>
  );
  return (
    <FeuilleDuBas
      open={ouverte}
      onOpenChange={setOuverte}
      titre={t('filtres.titre')}
      declencheur={
        <button
          type="button"
          aria-label={t('filtres.label')}
          className="relative inline-flex size-11 flex-none items-center justify-center rounded-lg border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="size-icone" strokeWidth={1.75} aria-hidden="true" />
          {actifs > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-foreground px-1 text-pastille font-semibold text-background">{actifs}</span>
          ) : null}
        </button>
      }
      pied={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => (remplacer({ status: null, motif: null, type: null, agent: null }), setOuverte(false))}>
            {t('filtres.effacer')}
          </Button>
          <Button type="button" className="flex-1" onClick={() => setOuverte(false)}>
            {t('filtres.appliquer')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {montrerLeMotif
          ? groupe(
              t('filtres.motif'),
              <Options tous={t('filtres.tousLesMotifs')} valeurs={MOTIFS_D_ATTENTION} choisie={motif} libelle={(m) => t(`motifsDuFiltre.${m}`)} onChoisir={(m) => remplacer({ motif: m })} />,
            )
          : null}
        {groupe(t('filtres.type'), <Options tous={t('filtres.tousLesTypes')} valeurs={TYPES} choisie={type} libelle={(v) => tType(v)} onChoisir={(v) => remplacer({ type: v })} />)}
        {groupe(
          t('filtres.statut'),
          <Options tous={t('filtres.tousLesStatuts')} valeurs={STATUTS} choisie={statut} libelle={(v) => tStatut(v)} onChoisir={(v) => remplacer({ status: v, motif: null })} />,
        )}
        {agents && agents.length > 0
          ? groupe(
              t('filtres.agent'),
              <>
                <Option choisie={agentId === null} onClick={() => remplacer({ agent: null })}>
                  {t('filtres.tousLesAgents')}
                </Option>
                {agents.map((a) => (
                  <Option key={a.id} choisie={agentId === a.id} onClick={() => remplacer({ agent: a.id })}>
                    {a.nom}
                  </Option>
                ))}
              </>,
            )
          : null}
      </div>
    </FeuilleDuBas>
  );
}
