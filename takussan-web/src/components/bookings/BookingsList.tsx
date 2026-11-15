'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck, Check, ChevronDown, ChevronRight } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { cheminApi } from '@/lib/chemin-api';
import { formaterTelephone } from '@/lib/phone';
import { useBookingCounts, useBookings } from '@/lib/queries/bookings';
import {
  type ComptesDesReservations,
  NATURES,
  type NatureDeReservation,
  natureDeLUrl,
  natureOuverte,
  STATUTS,
  type StatutDeReservation,
  statutDeLUrl,
  statutOuvert,
} from '@/lib/reservations/liste-des-reservations';
import { nomAffichable } from '@/lib/identite';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { Booking } from '@/types/booking';

import { EntreeSaisieDemande } from './EntreeSaisieDemande';
import {
  InitialesDuClient,
  SegmenteDesNatures,
  StatutDeLaDemande,
  useAgeDeLaDemande,
  useBienEtQuartier,
  useMotsDeLaNature,
  useNomDuClient,
  VignetteDuBien,
} from './liste/pieces';

/** L'hydratation n'a rien à écouter : `useSyncExternalStore` ne sert qu'à distinguer serveur et client. */
const sansAbonnement = () => () => {};

function entier(valeur: string | null): number | null {
  const n = valeur ? Number.parseInt(valeur, 10) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * TCK-2594 (ADR-0102) — les Réservations du personnel et du bailleur : un écran, trois natures
 * (maquette `app-reservations` a, « Liste » et « Vide — personnel »).
 *
 *  · En tête, le segmenté Séjours · Candidatures · Offres et le nombre « à décider » de chacun ; puis
 *    les statuts comptés, « À décider » d'abord et « Terminées » comprise — en pastilles sous `lg`,
 *    en onglets soulignés au bureau. Tous les comptes viennent d'UNE lecture (`/bookings/counts`).
 *  · La page ouvre sur la première nature qui a une demande à décider, et sur « À décider » s'il
 *    n'est pas vide, sinon « Confirmées » (`natureOuverte`, `statutOuvert`) : la liste attend les
 *    comptes plutôt que de lire deux fois.
 *  · Ligne (téléphone) : avatar et nom du client, bien, montant dans les mots de la nature, âge,
 *    statut. Tableau (bureau) : Client · Bien · Montant · Statut · Reçue, la recherche et les
 *    filtres Bien et Client. Une page de 30.
 *
 * L'URL porte tout : `?kind=`, `?status=` (TCK-1293), `?only_mine=1` (TCK-1735 : « Mes biens », la
 * portée `filter[managed_by]=me`, interrupteur du personnel), `?q=`, `?bien=`, `?client=`.
 */
export function BookingsList({ titre }: { readonly titre: string }) {
  const t = useTranslations('bookings.liste');
  const { params, remplacer } = useVueDansLUrl();
  const hydrate = useSyncExternalStore(sansAbonnement, () => true, () => false);
  const personnelLu = usePersonnelActif();
  const personnel = hydrate && personnelLu;

  const onlyMine = params.get('only_mine') === '1';
  const q = params.get('q')?.trim() || null;
  const bien = entier(params.get('bien'));
  const client = entier(params.get('client'));
  const filtres = { onlyMine, search: q, propertyId: bien, customerId: client };

  const comptesLus = useBookingCounts(filtres);
  const comptes = comptesLus.data?.data ?? null;
  const illisibles = comptesLus.isError;
  const nature = natureOuverte(natureDeLUrl(params.get('kind')), comptes, illisibles);
  const statut = statutOuvert(statutDeLUrl(params.get('status')), nature && comptes ? comptes[nature] : null, illisibles);

  const aDecider = comptes ? (Object.fromEntries(NATURES.map((n) => [n, comptes[n].pending])) as Record<NatureDeReservation, number>) : null;
  const sousTitre = useSousTitre(comptes, nature);

  const choisirNature = (n: NatureDeReservation) => remplacer({ kind: n, status: null });
  const choisirStatut = (s: StatutDeReservation) => remplacer({ status: s });
  const basculerMesBiens = (oui: boolean) => remplacer({ only_mine: oui ? 1 : null });

  const comptesDuStatut = (s: StatutDeReservation) => (nature && comptes ? comptes[nature][s] : undefined);

  return (
    <PagePleineLargeur data-slot="liste-des-reservations" className="max-md:pb-6">
      <div className="max-md:hidden">
        <PageHeader
          title={titre}
          description={sousTitre}
          actions={
            <>
              {personnel ? (
                <label className="hidden h-9 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm lg:inline-flex">
                  {t('mesBiens')}
                  <Switch checked={onlyMine} onCheckedChange={basculerMesBiens} />
                </label>
              ) : null}
              {/* Elle déclare aussi son « + » à l'en-tête de la coque du téléphone, qui porte le titre :
                  l'en-tête de page masqué sous `md` la monte quand même. */}
              <EntreeSaisieDemande variante="reservations" />
            </>
          }
          dessous={
            nature ? (
              <div className="hidden lg:block">
                <SegmenteDesNatures valeur={nature} onChange={choisirNature} comptes={aDecider} natures={NATURES} className="w-[calc(var(--spacing)*122.2)]" />
                <Tabs value={statut ?? undefined} onValueChange={(v) => choisirStatut(v as StatutDeReservation)} className="mt-5">
                  <TabsList variant="line" aria-label={t('statuts.label')}>
                    {STATUTS.map((s) => (
                      <TabsTrigger key={s} value={s}>
                        {t(`statuts.${s}`)}
                        {comptesDuStatut(s) !== undefined ? <TabsCount>{comptesDuStatut(s)}</TabsCount> : null}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            ) : null
          }
        />
      </div>

      {nature ? (
        <div className="lg:hidden">
          <div className="px-4 pt-3 md:mt-5 md:px-0">
            <SegmenteDesNatures valeur={nature} onChange={choisirNature} comptes={aDecider} natures={NATURES} />
          </div>
          <RangeeDePuces aria-label={t('statuts.label')} className="md:px-0">
            {STATUTS.map((s) => (
              <PuceDeFiltre key={s} active={s === statut} compte={comptesDuStatut(s)} onClick={() => choisirStatut(s)}>
                {t(`statuts.${s}`)}
              </PuceDeFiltre>
            ))}
          </RangeeDePuces>
          {personnel ? (
            <label className="flex h-12 cursor-pointer items-center gap-3 border-y border-border px-4 text-corps md:px-0">
              <span className="flex-1">{t('mesBiensSeulement')}</span>
              <Switch checked={onlyMine} onCheckedChange={basculerMesBiens} />
            </label>
          ) : null}
        </div>
      ) : null}

      {nature && statut ? (
        // La clé ramène en page 1 quand la portée, la nature, le statut ou un filtre change (TCK-2005).
        <CorpsDeLaListe key={[nature, statut, onlyMine, q, bien, client].join('|')} nature={nature} statut={statut} filtres={filtres} comptes={comptes} />
      ) : (
        <ChargementDeLaListe />
      )}
    </PagePleineLargeur>
  );
}

/** « 10 demandes à décider : 5 candidatures, 3 séjours, 2 offres » ; à vide, les confirmées de la nature. */
function useSousTitre(comptes: ComptesDesReservations | null, nature: NatureDeReservation | null): string | undefined {
  const t = useTranslations('bookings.liste');
  if (!comptes) return undefined;
  const total = NATURES.reduce((s, n) => s + comptes[n].pending, 0);
  if (total === 0) {
    const confirmees = nature ? comptes[nature].confirmed : 0;
    return confirmees > 0 ? `${t('sousTitre.aucune')} · ${t('sousTitre.confirmees', { count: confirmees })}` : t('sousTitre.aucune');
  }
  const parts = [...NATURES]
    .filter((n) => comptes[n].pending > 0)
    .sort((a, b) => comptes[b].pending - comptes[a].pending)
    .map((n) => t(`compte.${n}`, { count: comptes[n].pending }));
  return `${t('sousTitre.aDecider', { count: total })} : ${parts.join(', ')}`;
}

function ChargementDeLaListe() {
  return (
    <div className="space-y-3 px-4 pt-4 md:px-0 lg:pt-6" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-19 rounded-xl" />
      ))}
    </div>
  );
}

interface CorpsProps {
  readonly nature: NatureDeReservation;
  readonly statut: StatutDeReservation;
  readonly filtres: { readonly onlyMine: boolean; readonly search: string | null; readonly propertyId: number | null; readonly customerId: number | null };
  readonly comptes: ComptesDesReservations | null;
}

function CorpsDeLaListe({ nature, statut, filtres, comptes }: CorpsProps) {
  const t = useTranslations('bookings.liste');
  const tCommon = useTranslations('common');
  const { remplacer } = useVueDansLUrl();
  const [page, setPage] = useState(1);
  const lecture = useBookings({ kind: nature, status: statut, per_page: 30, page, ...filtres, avecClient: true });
  const reservations = lecture.data?.data ?? [];
  const total = lecture.data?.meta?.total ?? reservations.length;
  const filtre = Boolean(filtres.search || filtres.propertyId || filtres.customerId);

  const vide = (
    <EtatVideDeLaListe
      nature={nature}
      statut={statut}
      filtre={filtre}
      confirmees={comptes?.[nature].confirmed ?? 0}
      onVoirConfirmees={() => remplacer({ status: 'confirmed' })}
    />
  );

  const contenu = lecture.isError ? (
    <ErrorState message={t('erreur')} onRetry={() => void lecture.refetch()} retryLabel={tCommon('actions.retry')} />
  ) : lecture.isPending ? null : reservations.length === 0 ? (
    vide
  ) : null;

  return (
    <>
      {/* Téléphone et tablette : une ligne par demande, le pied qui dit l'ordre. */}
      <div data-slot="liste-du-telephone" className="lg:hidden">
        {lecture.isPending ? (
          <ChargementDeLaListe />
        ) : contenu ? (
          // L'état vide de la maquette suit la ligne « Mes biens seulement », sans marge de plus (son `py-12`).
          <div className="px-4 md:px-0">{contenu}</div>
        ) : (
          <>
            <ul aria-label={t('caption')} className="divide-y divide-border">
              {reservations.map((b) => (
                <LigneDeLaDemande key={b.id} b={b} />
              ))}
            </ul>
            <p className="border-t border-border px-4 py-4 text-ui text-muted-foreground md:px-0">{t(`pied.${nature}`, { count: total, statut })}</p>
            {lecture.data?.meta ? (
              <div className="px-4 md:px-0">
                <Pagination page={lecture.data.meta.current_page} lastPage={lecture.data.meta.last_page} onChange={setPage} />
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Bureau : la recherche, les filtres Bien et Client, le compte, puis le tableau. */}
      <div data-slot="liste-du-bureau" className="hidden pt-5 lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <DebouncedSearchInput
            value={filtres.search ?? ''}
            onCommit={(v) => remplacer({ q: v.trim() || null })}
            placeholder={t('recherche')}
            aria-label={t('recherche')}
            className="w-64"
          />
          <FiltreDuBien choisi={filtres.propertyId} />
          <FiltreDuClient choisi={filtres.customerId} />
          {lecture.data ? <span className="ml-auto text-sm tabular-nums text-muted-foreground">{t(`compte.${nature}`, { count: total })}</span> : null}
        </div>
        {lecture.isPending ? (
          <Skeleton className="mt-4 h-64 rounded-xl" />
        ) : contenu ? (
          <div className="mt-4 rounded-xl border border-dashed border-border">{contenu}</div>
        ) : (
          <div className="mt-4">
            <TableDesDemandes reservations={reservations} />
            {lecture.data?.meta && lecture.data.meta.last_page > 1 ? (
              <Pagination page={lecture.data.meta.current_page} lastPage={lecture.data.meta.last_page} onChange={setPage} />
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function EtatVideDeLaListe({
  nature,
  statut,
  filtre,
  confirmees,
  onVoirConfirmees,
}: {
  readonly nature: NatureDeReservation;
  readonly statut: StatutDeReservation;
  readonly filtre: boolean;
  readonly confirmees: number;
  readonly onVoirConfirmees: () => void;
}) {
  const t = useTranslations('bookings.liste');
  const icone = <CalendarCheck className="size-6" strokeWidth={1.75} aria-hidden="true" />;
  if (filtre) return <EmptyState variant="nue" icon={icone} title={t('vide.filtre')} />;
  if (statut !== 'pending') return <EmptyState variant="nue" icon={icone} title={t(`vide.statut.${statut}`)} />;
  return (
    <EmptyState
      variant="nue"
      icon={icone}
      title={t('vide.titre')}
      description={t(`vide.texte.${nature}`, { count: confirmees })}
      action={
        confirmees > 0 ? (
          <Button type="button" variant="outline" onClick={onVoirConfirmees}>
            {t('vide.voirConfirmees')}
          </Button>
        ) : undefined
      }
    />
  );
}

/** Une demande au téléphone (`LigneDemande`) : qui, quel bien, combien dans les mots de la nature. */
function LigneDeLaDemande({ b }: { readonly b: Booking }) {
  const nom = useNomDuClient();
  const bienEtQuartier = useBienEtQuartier();
  const mots = useMotsDeLaNature();
  const age = useAgeDeLaDemande(useMinuteCourante());
  const leNom = nom(b);
  return (
    <li data-slot="ligne-de-demande" className="relative flex min-h-19 items-start gap-3 px-4 py-3 md:px-0">
      <InitialesDuClient nom={leNom} taille={40} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link href={`/app/bookings/${b.id}`} className="min-w-0 flex-1 truncate text-corps font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:underline">
            {leNom}
          </Link>
          <span className="flex-none text-xs text-muted-foreground">{age(b.created_at)}</span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{bienEtQuartier(b)}</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums">{mots.montant(b)}</p>
          <StatutDeLaDemande statut={b.status} />
        </div>
      </div>
    </li>
  );
}

function Th({ children, className }: { readonly children?: ReactNode; readonly className?: string }) {
  return (
    <th scope="col" className={cn('px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground', className)}>
      {children}
    </th>
  );
}

/** Le tableau du bureau : Client · Bien · Montant · Statut · Reçue ; sous `xl`, il défile dans sa carte. */
function TableDesDemandes({ reservations }: { readonly reservations: readonly Booking[] }) {
  const t = useTranslations('bookings.liste');
  const nom = useNomDuClient();
  const bienEtQuartier = useBienEtQuartier();
  const mots = useMotsDeLaNature();
  const age = useAgeDeLaDemande(useMinuteCourante());
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t('caption')}</caption>
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <Th className="pl-4">{t('colonnes.client')}</Th>
            <Th>{t('colonnes.bien')}</Th>
            <Th>{t('colonnes.montant')}</Th>
            <Th>{t('colonnes.statut')}</Th>
            <Th>{t('colonnes.recue')}</Th>
            <Th className="w-10 pr-4" />
          </tr>
        </thead>
        <tbody>
          {reservations.map((b) => {
            const leNom = nom(b);
            const detail = mots.detail(b);
            return (
              <tr key={b.id} data-slot="rangee-de-reservation" className="border-b border-border last:border-0 hover:bg-secondary/50 focus-within:bg-secondary/50">
                <td className="py-3 pr-3 pl-4">
                  <div className="flex items-center gap-2.5">
                    <InitialesDuClient nom={leNom} taille={34} />
                    <div className="min-w-0">
                      <Link href={`/app/bookings/${b.id}`} className="font-medium whitespace-nowrap text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
                        {leNom}
                      </Link>
                      {b.customer?.phone ? <p className="text-ui whitespace-nowrap tabular-nums text-muted-foreground">{formaterTelephone(b.customer.phone)}</p> : null}
                    </div>
                  </div>
                </td>
                <td className="px-3">
                  <div className="flex items-center gap-2.5">
                    <VignetteDuBien src={b.property?.main_photo_url} className="size-10" />
                    <p className="font-medium whitespace-nowrap">{bienEtQuartier(b)}</p>
                  </div>
                </td>
                <td className="px-3">
                  <p className="font-medium whitespace-nowrap tabular-nums">{mots.montant(b)}</p>
                  {detail ? <p className="text-ui whitespace-normal text-muted-foreground min-[90rem]:whitespace-nowrap">{detail}</p> : null}
                </td>
                <td className="px-3">
                  <StatutDeLaDemande statut={b.status} />
                </td>
                <td className="px-3">
                  <p className="whitespace-nowrap text-muted-foreground">{age(b.created_at)}</p>
                </td>
                <td className="pr-4 text-right">
                  <ChevronRight className="inline size-4 text-muted-foreground" aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────────── les filtres du bureau ───────────────────────────── */

const DECLENCHEUR = 'inline-flex h-9 flex-none items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring';

function Filtre({ libelle, valeur, actif, children }: { readonly libelle: string; readonly valeur: string; readonly actif: boolean; readonly children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger className={cn(DECLENCHEUR, actif ? 'border-primary/50 bg-secondary' : 'border-border bg-card')}>
        <span className="text-muted-foreground">{libelle}</span>
        <span className="max-w-48 truncate font-medium text-foreground">{valeur}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
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

/** Une liste d'options cherchée côté serveur (`filter[search]`), huit à la fois. */
function FiltreCherche<T extends { id: number }>({
  libelle,
  placeholder,
  parametre,
  choisi,
  chemin,
  cheminDe,
  table,
  champs,
  etiquette,
}: {
  readonly libelle: string;
  readonly placeholder: string;
  readonly parametre: 'bien' | 'client';
  readonly choisi: number | null;
  readonly chemin: string;
  /** Le chemin d'UN élément, pour relire le choix courant hors de la page d'options. */
  readonly cheminDe: (id: number) => string;
  readonly table: string;
  readonly champs: readonly string[];
  readonly etiquette: (o: T) => string;
}) {
  const t = useTranslations('bookings.liste.filtres');
  const { remplacer } = useVueDansLUrl();
  const [terme, setTerme] = useState('');
  const options = useApiQuery<PaginatedResponse<T>>([table, 'filtre-des-reservations', terme], chemin, {
    params: { fields: { [table]: [...champs] }, filter: terme ? { search: terme } : {}, per_page: 8 },
  });
  // Le choix courant, lu seul quand il n'est pas dans la page d'options.
  const liste = options.data?.data ?? [];
  const courant = liste.find((o) => o.id === choisi);
  const seul = useApiQuery<{ data: T }>([table, 'filtre-des-reservations', 'choisi', choisi], cheminDe(choisi ?? 0), {
    params: { fields: { [table]: [...champs] } },
    enabled: choisi !== null && !courant,
  });
  const libelleChoisi = courant ?? seul.data?.data;
  return (
    <Filtre libelle={libelle} valeur={choisi !== null && libelleChoisi ? etiquette(libelleChoisi) : t('tous')} actif={choisi !== null}>
      {(fermer) => (
        <>
          <DebouncedSearchInput value={terme} onCommit={setTerme} placeholder={placeholder} aria-label={placeholder} busy={options.isFetching} />
          <Option choisie={choisi === null} onClick={() => (remplacer({ [parametre]: null }), fermer())}>
            {t('tous')}
          </Option>
          {liste.map((o) => (
            <Option key={o.id} choisie={choisi === o.id} onClick={() => (remplacer({ [parametre]: o.id }), fermer())}>
              {etiquette(o)}
            </Option>
          ))}
        </>
      )}
    </Filtre>
  );
}

function FiltreDuBien({ choisi }: { readonly choisi: number | null }) {
  const t = useTranslations('bookings.liste.filtres');
  return (
    <FiltreCherche<{ id: number; title: string }>
      libelle={t('bien')}
      placeholder={t('bienRecherche')}
      parametre="bien"
      choisi={choisi}
      chemin="/api/properties"
      cheminDe={(id) => cheminApi`/api/properties/${id}`}
      table="properties"
      champs={['id', 'title']}
      etiquette={(p) => p.title}
    />
  );
}

function FiltreDuClient({ choisi }: { readonly choisi: number | null }) {
  const t = useTranslations('bookings.liste.filtres');
  return (
    <FiltreCherche<{ id: number; first_name: string | null; last_name: string | null }>
      libelle={t('client')}
      placeholder={t('clientRecherche')}
      parametre="client"
      choisi={choisi}
      chemin="/api/customers"
      cheminDe={(id) => cheminApi`/api/customers/${id}`}
      table="customers"
      champs={['id', 'first_name', 'last_name']}
      etiquette={(c) => nomAffichable(c)}
    />
  );
}
