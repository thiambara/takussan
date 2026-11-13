'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ChevronRight, Plus, SlidersHorizontal, Wrench } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { MaintenanceList } from '@/components/maintenance/MaintenanceList';
import { MaintenanceStatusBadge } from '@/components/maintenance/MaintenanceStatusBadge';
import { Button, buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { enAttenteDUnGeste, FILES_DE_L_AGENCE, type FileDeLAgence, type ResumeDesFiles } from '@/lib/maintenance/files';
import { useFileDInterventions, useResumeDesFiles, type FiltresDesFiles } from '@/lib/queries/maintenance-files';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, type MaintenancePriority } from '@/types/maintenance';

import { CarteDeColonne, CarteDeFile, LigneDeFile, lienDeLaFiche, lieu } from './CartesDIntervention';

/**
 * TCK-2653 — « Interventions » de l'agence (maquette `app-interventions`, approche a, « Agence —
 * files ») : la page s'ouvre sur ce qui attend un geste, file par file.
 *
 *  · Comptes des pastilles et des colonnes par UN appel (`GET …/summary`, AC2) ; les cartes d'une
 *    file par `filter[file]`, la plus pressante puis la plus ancienne d'abord (`TRI_D_UNE_FILE`).
 *  · Téléphone : pastilles comptées au-dessus des cinq files empilées (cartes pleines pour les files
 *    à geste, lignes compactes pour « En cours » et « À confirmer »), puis « Terminées et closes ».
 *  · Bureau (dès `lg`) : cinq colonnes ; sous `xl`, elles défilent dans leur conteneur plutôt que de
 *    rétrécir (AC6 : visibles sans défilement à 1280).
 *  · Aucune demande terminée hors de « À confirmer » et de « Terminées » (AC1) ; « Urgences
 *    prioritaires » disparaît, la priorité se lit en pastille.
 *  · Rien ne se perd : « Liste » rend l'ancienne liste (statut, priorité, pagination) et `?status=`
 *    (TCK-1727) y ouvre directement ; « Nouvelle demande » devient « Signaler une intervention ».
 *
 * L'état vit dans l'URL : `vue` (files, liste, terminees), `q`, `priorite`, `metier`, `bien`.
 */
const VUES = ['files', 'liste', 'terminees'] as const;
type Vue = (typeof VUES)[number];
/** Les cartes d'une file avant « Afficher les N autres ». */
export const CARTES_PAR_FILE = 10;

function choix<T extends string>(v: string | null, valeurs: readonly T[]): T | null {
  return v !== null && (valeurs as readonly string[]).includes(v) ? (v as T) : null;
}

function entier(v: string | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function InterventionsDeLAgence() {
  const t = useTranslations('maintenance.files');
  const { params, remplacer } = useVueDansLUrl();
  // TCK-1727 — `?status=` (les aperçus du tableau de bord) ouvre la liste filtrée par statut.
  const vue: Vue = params.get('status') ? 'liste' : (choix(params.get('vue'), VUES) ?? 'files');
  const filtres: FiltresDesFiles = {
    search: params.get('q')?.trim() || null,
    priority: choix(params.get('priorite'), MAINTENANCE_PRIORITIES),
    category: choix(params.get('metier'), MAINTENANCE_CATEGORIES),
    propertyId: entier(params.get('bien')),
  };
  const [parFile, setParFile] = useState<Partial<Record<FileDeLAgence, number>>>({});
  const parPage = (f: FileDeLAgence) => parFile[f] ?? CARTES_PAR_FILE;
  const voirPlus = (f: FileDeLAgence, total: number) => setParFile((p) => ({ ...p, [f]: total }));

  const resume = useResumeDesFiles(filtres);
  const comptes = resume.data?.data ?? null;
  // « Signaler une intervention » suit l'API (`meta.abilities.can_create`), comme l'ancienne liste.
  const premiere = useFileDInterventions('a_dispatcher', filtres, parPage('a_dispatcher'));
  const peutSignaler = premiere.data?.meta.abilities?.can_create ?? false;

  const choisirVue = (v: Vue) => remplacer({ vue: v === 'files' ? null : v, status: null, page: null });
  const [maintenant] = useState(() => new Date());

  const signaler = peutSignaler ? (
    <Link href="/app/maintenance/new" className={buttonVariants()}>
      <Plus className="size-4" aria-hidden="true" />
      {t('signaler')}
    </Link>
  ) : null;

  return (
    <PagePleineLargeur data-slot="interventions-de-l-agence" className="max-md:pb-6">
      <DeclarerEnTete
        titre={t('titre')}
        action={peutSignaler ? <ActionDEnTete libelle={t('signaler')} icone={<Plus className="size-5" aria-hidden="true" />} href="/app/maintenance/new" primaire /> : undefined}
      />

      <div className="max-md:hidden">
        <PageHeader
          title={t('titre')}
          description={comptes ? t('sousTitre', { attente: enAttenteDUnGeste(comptes), terminees: comptes.terminees }) : undefined}
          actions={
            <>
              <Link href="/app/maintenance/providers" className={buttonVariants({ variant: 'outline' })}>
                {t('prestataires')}
              </Link>
              {signaler}
            </>
          }
          dessous={
            <div className="hidden flex-wrap items-center gap-2 lg:flex xl:flex-nowrap">
              {vue !== 'liste' ? <FiltresDuBureau filtres={filtres} /> : null}
              <Vues vue={vue} terminees={comptes?.terminees} choisir={choisirVue} />
            </div>
          }
        />
      </div>

      {/* Téléphone et tablette : les files en pastilles, « Priorité, métier » et le carnet. */}
      <div className="lg:hidden">
        {vue === 'liste' ? null : (
          <>
            <div className="sticky top-0 z-10 border-b border-border/70 bg-background md:static md:border-0">
              <PastillesDesFiles vue={vue} comptes={comptes} choisirVue={choisirVue} />
            </div>
            <div className="flex items-center gap-2 px-4 pt-3 text-ui md:px-0">
              <FiltresDuTelephone filtres={filtres} />
              <Link href="/app/maintenance/providers" className="ml-auto inline-flex h-9 items-center gap-1 font-medium text-primary-deep">
                {t('prestataires')}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </div>

      {vue === 'liste' ? (
        <div className="px-4 pt-4 md:px-0 lg:pt-5">
          <MaintenanceList urgencesAPart={false} />
        </div>
      ) : vue === 'terminees' ? (
        <VueDesTerminees filtres={filtres} />
      ) : resume.isError ? (
        <div className="px-4 pt-4 md:px-0">
          <ErrorState message={t('erreur')} onRetry={() => void resume.refetch()} retryLabel={t('reessayer')} />
        </div>
      ) : (
        <>
          <div data-slot="files-du-telephone" className="space-y-6 px-4 pt-4 md:px-0 lg:hidden">
            {FILES_DE_L_AGENCE.map((f) => (
              <SectionDuTelephone key={f} file={f} filtres={filtres} compte={comptes?.[f]} parPage={parPage(f)} voirPlus={voirPlus} maintenant={maintenant} />
            ))}
            <button
              type="button"
              onClick={() => choisirVue('terminees')}
              className="flex h-12 w-full items-center rounded-xl border border-border bg-card px-4 text-left text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">{t('termineesEtCloses')}</span>
              {comptes ? <span className="text-sm text-muted-foreground tabular-nums">{comptes.terminees}</span> : null}
              <ChevronRight className="ml-1 size-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>

          {/* Sous `xl`, les cinq colonnes défilent dans leur conteneur plutôt que de tomber sous 170 px. */}
          <div data-slot="files-du-bureau" className="hidden overflow-x-auto pt-5 lg:block">
            <div className="grid min-w-[calc(var(--spacing)*244.44)] grid-cols-5 gap-3 xl:min-w-0">
              {FILES_DE_L_AGENCE.map((f) => (
                <Colonne key={f} file={f} filtres={filtres} compte={comptes?.[f]} parPage={parPage(f)} voirPlus={voirPlus} maintenant={maintenant} />
              ))}
            </div>
          </div>
        </>
      )}
    </PagePleineLargeur>
  );
}

/* ───────────────────────────── les vues ───────────────────────────── */

function Vues({ vue, terminees, choisir }: { readonly vue: Vue; readonly terminees: number | undefined; readonly choisir: (v: Vue) => void }) {
  const t = useTranslations('maintenance.files.vues');
  return (
    <div role="group" aria-label={t('label')} className="ml-auto inline-flex h-9 items-center rounded-lg border border-border bg-card p-0.5 text-sm">
      {VUES.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === vue}
          onClick={() => choisir(v)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring',
            v === vue ? 'bg-foreground text-background' : 'text-encre-douce hover:text-foreground',
          )}
        >
          {t(v)}
          {v === 'terminees' && terminees !== undefined ? <span className="tabular-nums">{terminees}</span> : null}
        </button>
      ))}
    </div>
  );
}

function PastillesDesFiles({ vue, comptes, choisirVue }: { readonly vue: Vue; readonly comptes: ResumeDesFiles | null; readonly choisirVue: (v: Vue) => void }) {
  const t = useTranslations('maintenance.files');
  const [active, setActive] = useState<FileDeLAgence>('a_dispatcher');
  const aller = (f: FileDeLAgence) => {
    setActive(f);
    if (vue !== 'files') choisirVue('files');
    // La section est montée dans la vue des files : on y descend au prochain rendu.
    requestAnimationFrame(() => document.getElementById(`file-${f}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  return (
    <RangeeDePuces aria-label={t('pastilles')} className="md:px-0">
      {FILES_DE_L_AGENCE.map((f) => (
        <PuceDeFiltre key={f} active={vue === 'files' && f === active} compte={comptes?.[f]} onClick={() => aller(f)}>
          {t(`noms.${f}`)}
        </PuceDeFiltre>
      ))}
      <PuceDeFiltre active={vue === 'terminees'} onClick={() => choisirVue('terminees')}>
        {t('noms.terminees')}
      </PuceDeFiltre>
    </RangeeDePuces>
  );
}

/* ───────────────────────────── les files ───────────────────────────── */

interface FileProps {
  readonly file: FileDeLAgence;
  readonly filtres: FiltresDesFiles;
  readonly compte: number | undefined;
  readonly parPage: number;
  readonly voirPlus: (f: FileDeLAgence, total: number) => void;
  readonly maintenant: Date;
}

/** Les files à geste se lisent en cartes pleines, les autres en lignes compactes (maquette). */
const EN_CARTES: readonly FileDeLAgence[] = ['a_dispatcher', 'en_retard', 'chez_le_bailleur'];

function SectionDuTelephone({ file, filtres, compte, parPage, voirPlus, maintenant }: FileProps) {
  const t = useTranslations('maintenance.files');
  const lu = useFileDInterventions(file, filtres, parPage);
  const lignes = lu.data?.data ?? [];
  const total = lu.data?.meta.total ?? compte ?? 0;
  const autres = total - lignes.length;
  return (
    <section id={`file-${file}`} data-file={file} aria-labelledby={`titre-file-${file}`} className="scroll-mt-16 space-y-3">
      <div className="flex items-baseline gap-2 px-1">
        <h2 id={`titre-file-${file}`} className="font-display text-lg font-semibold tracking-titre">
          {t(`noms.${file}`)}
        </h2>
        {compte !== undefined ? <span className="text-sm font-semibold text-muted-foreground tabular-nums">{compte}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">{t(`aides.${file}`)}</span>
      </div>
      {lu.isPending ? (
        <Skeleton className="h-28 rounded-xl" />
      ) : lu.isError ? (
        <ErrorState message={t('erreur')} onRetry={() => void lu.refetch()} retryLabel={t('reessayer')} />
      ) : lignes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-ui text-muted-foreground">{t('fileVide')}</p>
      ) : EN_CARTES.includes(file) ? (
        lignes.map((i) => <CarteDeFile key={i.id} i={i} maintenant={maintenant} />)
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {lignes.map((i) => (
              <LigneDeFile key={i.id} i={i} maintenant={maintenant} />
            ))}
          </ul>
        </div>
      )}
      {autres > 0 ? (
        <Button type="button" variant="outline" size="lg" className="h-11 w-full" onClick={() => voirPlus(file, total)}>
          {t('afficherLesAutres', { n: autres })}
        </Button>
      ) : null}
    </section>
  );
}

function Colonne({ file, filtres, compte, parPage, voirPlus, maintenant }: FileProps) {
  const t = useTranslations('maintenance.files');
  const lu = useFileDInterventions(file, filtres, parPage);
  const lignes = lu.data?.data ?? [];
  const total = lu.data?.meta.total ?? compte ?? 0;
  const autres = total - lignes.length;
  return (
    <section data-file={file} aria-labelledby={`colonne-${file}`} className={cn('min-w-0 rounded-xl p-2', file === 'en_retard' ? 'bg-destructive/6' : 'bg-muted/50')}>
      <div className="px-1.5 pt-1 pb-2">
        <h2 id={`colonne-${file}`} className="flex items-baseline gap-1.5 text-sm font-semibold">
          {t(`noms.${file}`)}
          {compte !== undefined ? <span className="text-muted-foreground tabular-nums">{compte}</span> : null}
        </h2>
        <p className="text-xs text-muted-foreground">{t(`aides.${file}`)}</p>
      </div>
      <div className="space-y-2">
        {lu.isPending ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : lu.isError ? (
          <button type="button" onClick={() => void lu.refetch()} className="w-full rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs text-destructive">
            {t('erreurCourte')}
          </button>
        ) : lignes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs text-muted-foreground">{t('fileVide')}</p>
        ) : (
          lignes.map((i) => <CarteDeColonne key={i.id} i={i} maintenant={maintenant} />)
        )}
        {autres > 0 ? (
          <button
            type="button"
            onClick={() => voirPlus(file, total)}
            className="h-8 w-full rounded-md text-xs font-medium text-primary-deep outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('afficherLesAutres', { n: autres })}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** « Terminées » : les demandes closes, annulées ou terminées, vingt par page, avec leur statut. */
function VueDesTerminees({ filtres }: { readonly filtres: FiltresDesFiles }) {
  const t = useTranslations('maintenance.files');
  const { params, remplacer } = useVueDansLUrl();
  const page = entier(params.get('page')) ?? 1;
  const lu = useFileDInterventions('terminees', filtres, 20, page);
  const lignes = lu.data?.data ?? [];
  return (
    <div data-slot="vue-des-terminees" className="px-4 pt-4 md:px-0 lg:pt-5">
      {lu.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : lu.isError ? (
        <ErrorState message={t('erreur')} onRetry={() => void lu.refetch()} retryLabel={t('reessayer')} />
      ) : lignes.length === 0 ? (
        <EmptyState variant="nue" icon={<Wrench className="size-6" strokeWidth={1.75} aria-hidden="true" />} title={t('termineesVide')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {lignes.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <Link href={lienDeLaFiche(i.id)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-base font-medium">{i.title}</span>
                    <span className="mt-0.5 block truncate text-ui text-muted-foreground">
                      {[...lieu(i), i.assignee?.name].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <MaintenanceStatusBadge status={i.status} />
                </Link>
              </li>
            ))}
          </ul>
          {lu.data && lu.data.meta.last_page > 1 ? (
            <div className="border-t border-border px-4 py-3">
              <Pagination
                page={lu.data.meta.current_page}
                lastPage={lu.data.meta.last_page}
                onChange={(p) => remplacer({ page: p })}
                summary={<span className="tabular-nums">{t('compteTerminees', { count: lu.data.meta.total })}</span>}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── les filtres ───────────────────────────── */

const DECLENCHEUR = 'inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring';

function Filtre({ libelle, valeur, actif, children }: { readonly libelle: string; readonly valeur: string; readonly actif: boolean; readonly children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger className={cn(DECLENCHEUR, actif ? 'border-primary/50 bg-secondary' : 'border-border bg-card')} aria-label={`${libelle} : ${valeur}`}>
        <span className="min-w-0 flex-1 truncate text-left text-foreground">{valeur}</span>
        <ChevronDown className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="max-h-80 w-64 space-y-1 overflow-y-auto p-1">{children(() => setOuvert(false))}</PopoverContent>
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

function Options<T extends string>({ tous, valeurs, choisie, libelle, onChoisir }: { readonly tous: string; readonly valeurs: readonly T[]; readonly choisie: T | null; readonly libelle: (v: T) => string; readonly onChoisir: (v: T | null) => void }) {
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

/** Les priorités du plus pressant au moins pressant : l'ordre où on les cherche. */
const PRIORITES_DU_FILTRE: readonly MaintenancePriority[] = [...MAINTENANCE_PRIORITIES].reverse();

function FiltresDuBureau({ filtres }: { readonly filtres: FiltresDesFiles }) {
  const t = useTranslations('maintenance.files.filtres');
  const tPriorite = useTranslations('maintenance.priority');
  const tMetier = useTranslations('maintenance.category');
  const { remplacer } = useVueDansLUrl();
  const priorite = filtres.priority ?? null;
  const metier = filtres.category ?? null;
  return (
    <>
      <DebouncedSearchInput
        value={filtres.search ?? ''}
        onCommit={(q) => remplacer({ q: q.trim() || null, page: null })}
        placeholder={t('recherche')}
        aria-label={t('recherche')}
        className="h-9 w-64 text-sm"
      />
      <Filtre libelle={t('priorite')} valeur={priorite ? tPriorite(priorite) : t('toutesLesPriorites')} actif={priorite !== null}>
        {(fermer) => <Options tous={t('toutesLesPriorites')} valeurs={PRIORITES_DU_FILTRE} choisie={priorite} libelle={(v) => tPriorite(v)} onChoisir={(v) => (remplacer({ priorite: v, page: null }), fermer())} />}
      </Filtre>
      <Filtre libelle={t('metier')} valeur={metier ? tMetier(metier) : t('tousLesMetiers')} actif={metier !== null}>
        {(fermer) => <Options tous={t('tousLesMetiers')} valeurs={MAINTENANCE_CATEGORIES} choisie={metier} libelle={(v) => tMetier(v)} onChoisir={(v) => (remplacer({ metier: v, page: null }), fermer())} />}
      </Filtre>
      <FiltreDuBien choisi={filtres.propertyId ?? null} />
    </>
  );
}

/** Le bien (`?bien=`) : une liste cherchée côté serveur, huit à la fois. */
function FiltreDuBien({ choisi }: { readonly choisi: number | null }) {
  const t = useTranslations('maintenance.files.filtres');
  const { remplacer } = useVueDansLUrl();
  const [terme, setTerme] = useState('');
  type Bien = { readonly id: number; readonly title: string | null; readonly reference_number?: string | null };
  const options = useApiQuery<PaginatedResponse<Bien>>(['properties', 'filtre-des-interventions', terme], '/api/properties', {
    params: { fields: { properties: ['id', 'title', 'reference_number'] }, filter: terme ? { search: terme } : {}, per_page: 8 },
  });
  const liste = options.data?.data ?? [];
  const courant = liste.find((o) => o.id === choisi);
  return (
    <Filtre libelle={t('bien')} valeur={choisi !== null ? (courant?.title ?? t('bienChoisi')) : t('tousLesBiens')} actif={choisi !== null}>
      {(fermer) => (
        <>
          <DebouncedSearchInput value={terme} onCommit={setTerme} placeholder={t('bienRecherche')} aria-label={t('bienRecherche')} busy={options.isFetching} />
          <Option choisie={choisi === null} onClick={() => (remplacer({ bien: null, page: null }), fermer())}>
            {t('tousLesBiens')}
          </Option>
          {liste.map((o) => (
            <Option key={o.id} choisie={choisi === o.id} onClick={() => (remplacer({ bien: o.id, page: null }), fermer())}>
              {o.reference_number ? `${o.reference_number} · ` : ''}
              {o.title}
            </Option>
          ))}
        </>
      )}
    </Filtre>
  );
}

/** Téléphone : « Priorité, métier » ouvre une feuille ; le compte des filtres actifs s'y lit. */
function FiltresDuTelephone({ filtres }: { readonly filtres: FiltresDesFiles }) {
  const t = useTranslations('maintenance.files.filtres');
  const tPriorite = useTranslations('maintenance.priority');
  const tMetier = useTranslations('maintenance.category');
  const { remplacer } = useVueDansLUrl();
  const [ouverte, setOuverte] = useState(false);
  const actifs = [filtres.priority, filtres.category, filtres.propertyId, filtres.search].filter(Boolean).length;
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
      titre={t('titre')}
      declencheur={
        <button
          type="button"
          className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring', actifs > 0 ? 'border-primary/50 bg-secondary' : 'border-border bg-card')}
        >
          <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {t('telephone')}
          {actifs > 0 ? <span className="tabular-nums text-muted-foreground">{actifs}</span> : null}
        </button>
      }
      pied={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => (remplacer({ priorite: null, metier: null, bien: null, q: null, page: null }), setOuverte(false))}>
            {t('effacer')}
          </Button>
          <Button type="button" className="flex-1" onClick={() => setOuverte(false)}>
            {t('appliquer')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <DebouncedSearchInput value={filtres.search ?? ''} onCommit={(q) => remplacer({ q: q.trim() || null, page: null })} placeholder={t('recherche')} aria-label={t('recherche')} />
        {groupe(
          t('priorite'),
          <Options tous={t('toutesLesPriorites')} valeurs={PRIORITES_DU_FILTRE} choisie={filtres.priority ?? null} libelle={(v) => tPriorite(v)} onChoisir={(v) => remplacer({ priorite: v, page: null })} />,
        )}
        {groupe(
          t('metier'),
          <Options tous={t('tousLesMetiers')} valeurs={MAINTENANCE_CATEGORIES} choisie={filtres.category ?? null} libelle={(v) => tMetier(v)} onChoisir={(v) => remplacer({ metier: v, page: null })} />,
        )}
      </div>
    </FeuilleDuBas>
  );
}

