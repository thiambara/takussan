'use client';

import { Fragment, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, ClipboardCheck, Folder, FolderOpen, IdCard, Plus, ReceiptText, ScrollText } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { StatusBadge } from '@/components/console/StatusBadge';
import { ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { Button } from '@/components/ui/button';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { useDejaOuvert } from '@/hooks/useDejaOuvert';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMyProfiles } from '@/hooks/useProfiles';
import {
  biensAvecDocuments,
  cleDuDossier,
  trouverLeDossier,
  type BailDuCoffre,
  type BienDuCoffre,
  type CoffreDeLAgence,
  type DossierDAgence,
  type DossierTrouve,
} from '@/lib/documents/coffre-de-l-agence';
import { useCoffreDeLAgence, type FiltreDeLAgence } from '@/lib/queries/coffre-de-l-agence';
import { cn } from '@/lib/utils';
import { jourADakar } from '@/lib/visites/par-le-temps';

import { ChampDeRecherche } from '../coffre/ChampDeRecherche';
import { useEtatDeLaVue, type EtatDeLaVue } from './etat-de-la-vue';
import { useLibellesDeLAgence, type LibellesDeLAgence } from './libelles';
import { ListeDeLAgence, type PorteursConnus, type SourceDeLaListe } from './ListeDeLAgence';

/** Le dépôt (zod, react-hook-form) n'est chargé qu'à sa première ouverture (TCK-1041). */
const DocumentUploadDialog = dynamic(() => import('../DocumentUploadDialog').then((m) => m.DocumentUploadDialog));

/**
 * TCK-2896 — `/app/documents` pour le personnel actif d'une agence : les documents rangés par bien,
 * puis par bail (`GET /api/agency/document-vault`, TCK-2895). Remplace la bibliothèque à plat groupée
 * par type (`DocumentsLibrary`, TCK-062), dont rien ne se perd sans motif (Notes de TCK-2896).
 *
 * Maquette retenue : `app-documents` a, écran 4 « Agence — par bien, par bail » (`MobileAgence`,
 * `BureauAgence`).
 *  · Téléphone (et sous `xl`) : la recherche, les puces « Tous · Expire bientôt · Non vérifiés ·
 *    Générés » (comptes de l'en-tête de l'arbre), la carte du bien dépliée (pièces du bien, bail et ses
 *    quatre sous-dossiers comptés et alertés), les autres biens repliés, le dossier de l'agence. Un
 *    dossier touché s'ouvre en liste ; une puce ou une recherche rend la liste de toute l'agence.
 *  · Bureau ≥ 1280 : trois colonnes (l'arbre, la liste, l'aperçu) au partage de la maquette
 *    (244 / 483 / 340, en proportion) ; la liste dit son fil, ses puces locales et « Dans le même bail ».
 *
 * Tout filtre, toute recherche part au SERVEUR ; tous les comptes viennent de l'arbre, jamais des
 * lignes lues.
 */
export function DocumentsDeLAgence() {
  const t = useTranslations('documents.agence');
  const requete = useCoffreDeLAgence();
  const bureau = useMatchesMedia('(min-width: 80rem)');
  const vue = useEtatDeLaVue();
  const profils = useMyProfiles();
  const actif = profils.data?.data.find((p) => p.id === profils.data?.meta.active_profile_id);
  const libelles = useLibellesDeLAgence(actif?.agency?.name ?? null);
  const [ajout, setAjout] = useState(false);
  const ajoutMonte = useDejaOuvert(ajout);

  const declaration = (
    <DeclarerEnTete
      action={<ActionDEnTete libelle={t('ajouter')} icone={<Plus className="size-5" aria-hidden="true" />} primaire onClick={() => setAjout(true)} />}
    />
  );

  if (requete.isPending || requete.isError || !requete.data) {
    return (
      <div className="space-y-6">
        {declaration}
        <PageHeader title={t('titre')} />
        {requete.isPending ? (
          <div className="space-y-4" aria-busy="true">
            <span className="sr-only">{t('chargement')}</span>
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-60 w-full rounded-xl" />
          </div>
        ) : (
          <ErrorState message={t('echec')} onRetry={() => void requete.refetch()} retryLabel={t('reessayer')} />
        )}
      </div>
    );
  }

  const coffre = requete.data.data;
  // Une recherche porte sur toute l'agence : le dossier choisi s'efface devant elle.
  const trouve = vue.q === '' ? trouverLeDossier(coffre, vue.dossier) : null;
  const porteurs = porteursDe(coffre);
  // Le dépôt part rangé dans le dossier téléversé ouvert ; sinon, l'agent choisit sa cible.
  const cibleDuDepot = trouve && trouve.dossier.kind === 'uploaded' ? trouve.dossier.target : null;
  const champ = <ChampDeRecherche bureau={bureau} libelle={t('recherche')} className={bureau ? 'w-80' : undefined} />;

  return (
    <div className="space-y-5 pb-4 xl:space-y-6">
      {declaration}
      <PageHeader
        title={t('titre')}
        description={libelles.sousTitre(coffre.totals)}
        actions={
          <>
            {bureau ? champ : null}
            <Button type="button" className="max-md:hidden" onClick={() => setAjout(true)}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              {t('ajouter')}
            </Button>
          </>
        }
      />

      {bureau ? (
        <div className="flex flex-row items-start gap-6">
          <ArbreDuBureau coffre={coffre} trouve={trouve} vue={vue} libelles={libelles} />
          <ListeDeLAgence
            key={trouve ? cleDuDossier(trouve.dossier) : 'tous'}
            source={sourceDe(trouve, vue)}
            bureau
            porteurs={porteurs}
            onPage={vue.choisirPage}
            entete={<EnTeteDeLaListe trouve={trouve} coffre={coffre} vue={vue} libelles={libelles} />}
            dessous={trouve?.bail ? <MemeBail bail={trouve.bail} actuel={trouve.dossier} vue={vue} libelles={libelles} /> : null}
          />
        </div>
      ) : (
        <>
          {trouve ? null : champ}
          {trouve ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => vue.choisirDossier(null)}
                className="-ml-2 inline-flex h-11 items-center rounded-md px-2 text-ui font-medium text-primary-deep outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {/* Pas de flèche : la seule flèche de retour est celle de la coque (TCK-2617). */}
                {t('tousLesDocuments')}
              </button>
              <ListeDeLAgence
                key={cleDuDossier(trouve.dossier)}
                source={sourceDe(trouve, vue)}
                bureau={false}
                porteurs={porteurs}
                onPage={vue.choisirPage}
                entete={<EnTeteDeLaListe trouve={trouve} coffre={coffre} vue={vue} libelles={libelles} />}
              />
            </div>
          ) : (
            <>
              <RangeeDePuces aria-label={t('filtres')} className="-mx-4 -mt-2">
                <PucesGlobales coffre={coffre} vue={vue} />
              </RangeeDePuces>
              {vue.filtre === 'tous' && vue.q === '' ? (
                <ArbreDuTelephone coffre={coffre} vue={vue} libelles={libelles} />
              ) : (
                <ListeDeLAgence source={sourceDe(null, vue)} bureau={false} porteurs={porteurs} onPage={vue.choisirPage} />
              )}
            </>
          )}
        </>
      )}

      {ajoutMonte ? (
        <DocumentUploadDialog
          key={cibleDuDepot ? `${cibleDuDepot.type}-${cibleDuDepot.id}` : 'libre'}
          open={ajout}
          onOpenChange={setAjout}
          defaultDocumentable={cibleDuDepot ?? undefined}
        />
      ) : null}
    </div>
  );
}

/** La source de la liste : un dossier généré d'un bail, un dossier téléversé, ou toute l'agence. */
function sourceDe(trouve: DossierTrouve | null, vue: EtatDeLaVue): SourceDeLaListe {
  if (trouve && trouve.dossier.kind === 'generated' && trouve.bail) {
    return { genre: 'generesDuBail', bailId: trouve.bail.id, cle: trouve.dossier.key };
  }
  // Dans un dossier téléversé, « Générés » n'a pas de sens : la puce locale n'existe pas.
  const filtre: FiltreDeLAgence = trouve && vue.filtre === 'generes' ? 'tous' : vue.filtre;
  return { genre: 'agence', filtre, q: vue.q, page: vue.page, cible: trouve ? trouve.dossier.target : null };
}

/** Le locataire d'un bail et le titre d'un bien, lus dans l'arbre : la liste ne les sert pas. */
function porteursDe(coffre: CoffreDeLAgence): PorteursConnus {
  const locataires = new Map<number, string | null>();
  const biens = new Map<number, string | null>();
  for (const bien of coffre.properties) {
    biens.set(bien.id, bien.title);
    for (const bail of bien.leases) locataires.set(bail.id, bail.tenant.name);
  }
  return { locataireDuBail: (id) => locataires.get(id) ?? null, titreDuBien: (id) => biens.get(id) ?? null };
}

/* ─────────────────────────────────────────── Puces ─────────────────────────────────────────── */

function PucesGlobales({ coffre, vue, taille }: { readonly coffre: CoffreDeLAgence; readonly vue: EtatDeLaVue; readonly taille?: 'sm' }) {
  const t = useTranslations('documents.agence.puces');
  const puces: { readonly f: FiltreDeLAgence; readonly compte?: number }[] = [
    { f: 'tous', compte: coffre.totals.documents },
    { f: 'expire', compte: coffre.totals.expiring_soon },
    { f: 'nonVerifies', compte: coffre.totals.unverified },
    { f: 'generes' },
  ];
  return (
    <>
      {puces.map(({ f, compte }) => (
        <PuceDeFiltre key={f} taille={taille} active={vue.filtre === f} compte={compte} onClick={() => vue.choisirFiltre(f)}>
          {t(f)}
        </PuceDeFiltre>
      ))}
    </>
  );
}

/**
 * Le haut de la liste : le fil « Bien › Bail › dossier » et les puces locales du dossier téléversé
 * (« Tout · Expire bientôt · Non vérifiés », comptes du dossier) ; « Tous les documents » et les puces
 * de toute l'agence au bureau quand aucun dossier n'est choisi.
 */
function EnTeteDeLaListe({
  trouve,
  coffre,
  vue,
  libelles,
}: {
  readonly trouve: DossierTrouve | null;
  readonly coffre: CoffreDeLAgence;
  readonly vue: EtatDeLaVue;
  readonly libelles: LibellesDeLAgence;
}) {
  const t = useTranslations('documents.agence');
  const fil = trouve
    ? [trouve.bien?.title ?? null, trouve.bail ? libelles.bail(trouve.bail) : null, libelles.dossier(trouve.dossier)].filter((x): x is string => Boolean(x))
    : [t('tousLesDocuments')];

  return (
    <div className="space-y-3">
      <p data-testid="fil-du-dossier" aria-label={t('fil')} className="flex min-w-0 flex-wrap items-center gap-1.5 text-ui text-muted-foreground">
        {fil.map((etape, i) => (
          <Fragment key={`${i}-${etape}`}>
            {i > 0 ? <span aria-hidden="true">›</span> : null}
            <span className={cn('min-w-0 truncate', i === fil.length - 1 && 'font-medium text-foreground')}>{etape}</span>
          </Fragment>
        ))}
      </p>
      {trouve === null ? (
        vue.q === '' ? (
          <div role="group" aria-label={t('filtres')} className="flex flex-wrap items-center gap-2">
            <PucesGlobales coffre={coffre} vue={vue} taille="sm" />
          </div>
        ) : null
      ) : trouve.dossier.kind === 'uploaded' ? (
        <div role="group" aria-label={t('filtres')} className="flex flex-wrap items-center gap-2">
          {(
            [
              { f: 'tous', cle: 'tout', compte: trouve.dossier.documents },
              { f: 'expire', cle: 'expire', compte: trouve.dossier.expiring_soon },
              { f: 'nonVerifies', cle: 'nonVerifies', compte: trouve.dossier.unverified },
            ] as const
          ).map(({ f, cle, compte }) => (
            <PuceDeFiltre key={f} taille="sm" active={vue.filtre === f || (f === 'tous' && vue.filtre === 'generes')} compte={compte} onClick={() => vue.choisirFiltre(f)}>
              {t(`puces.${cle}`)}
            </PuceDeFiltre>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** « Dans le même bail » : les autres dossiers du bail, en tuiles « 6 · générés ». */
function MemeBail({ bail, actuel, vue, libelles }: { readonly bail: BailDuCoffre; readonly actuel: DossierDAgence; readonly vue: EtatDeLaVue; readonly libelles: LibellesDeLAgence }) {
  const t = useTranslations('documents.agence');
  const autres = bail.folders.filter((d) => d.key !== actuel.key);
  if (autres.length === 0) return null;
  return (
    <section aria-labelledby="meme-bail" className="pt-3">
      <h2 id="meme-bail" className="px-1 text-ui font-medium text-muted-foreground">
        {t('memeBail')}
      </h2>
      <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(calc(var(--spacing)*35),1fr))] gap-3">
        {autres.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => vue.choisirDossier(cleDuDossier(d))}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Folder className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{libelles.dossier(d)}</span>
              <span className="block text-xs text-muted-foreground">{d.kind === 'generated' ? t('tuileGeneres', { n: d.documents }) : libelles.documents(d.documents)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────── L'arbre ─────────────────────────────────────────── */

/**
 * Ce qui est déplié : par défaut le premier bien et son premier bail (la maquette), et toujours le bien
 * et le bail du dossier choisi.
 */
function useDepliage(biens: readonly BienDuCoffre[], trouve: DossierTrouve | null) {
  const [bascules, setBascules] = useState<Readonly<Record<string, boolean>>>({});
  const [premier] = biens;
  const parDefaut = (cle: string) =>
    (premier !== undefined && (cle === `bien-${premier.id}` || (premier.leases[0] !== undefined && cle === `bail-${premier.leases[0].id}`))) ||
    (trouve?.bien != null && cle === `bien-${trouve.bien.id}`) ||
    (trouve?.bail != null && cle === `bail-${trouve.bail.id}`);
  const ouvert = (cle: string) => bascules[cle] ?? parDefaut(cle);
  const basculer = (cle: string) => setBascules((b) => ({ ...b, [cle]: !ouvert(cle) }));
  return { ouvert, basculer };
}

const ICONE_DU_DOSSIER = {
  contract: ScrollText,
  inventories: ClipboardCheck,
  receipts: ReceiptText,
  tenant_pieces: IdCard,
  property_pieces: Folder,
  agency_pieces: Folder,
} as const;

function ArbreDuTelephone({ coffre, vue, libelles }: { readonly coffre: CoffreDeLAgence; readonly vue: EtatDeLaVue; readonly libelles: LibellesDeLAgence }) {
  const t = useTranslations('documents.agence');
  const aujourdhui = jourADakar(new Date());
  const biens = biensAvecDocuments(coffre);
  const sansDocument = coffre.properties.length - biens.length;
  const { ouvert, basculer } = useDepliage(biens, null);
  const agence = coffre.agency_folder;

  if (biens.length === 0 && agence.documents === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-3.5 text-sm leading-snug text-muted-foreground">{t('vide.agence')}</p>;
  }

  // Les biens dépliés ont chacun leur carte ; les biens repliés qui se suivent partagent la leur (maquette).
  const groupes: { readonly ouvert: boolean; readonly biens: BienDuCoffre[] }[] = [];
  for (const bien of biens) {
    const o = ouvert(`bien-${bien.id}`);
    const dernier = groupes.at(-1);
    if (!o && dernier && !dernier.ouvert) dernier.biens.push(bien);
    else groupes.push({ ouvert: o, biens: [bien] });
  }

  return (
    <div data-testid="arbre-du-telephone" className="space-y-3">
      {groupes.map((g) =>
        g.ouvert ? (
          <CarteDuBienDeplie key={g.biens[0].id} bien={g.biens[0]} vue={vue} libelles={libelles} ouvert={ouvert} basculer={basculer} aujourdhui={aujourdhui} />
        ) : (
          <div key={g.biens[0].id} className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {g.biens.map((bien) => {
                const alerte = libelles.alerte(bien, aujourdhui);
                return (
                  <li key={bien.id}>
                    <button
                      type="button"
                      aria-expanded={false}
                      onClick={() => basculer(`bien-${bien.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <Folder className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-corps font-semibold">{bien.title}</span>
                        <span className="block truncate text-ui text-muted-foreground">{libelles.resume(bien)}</span>
                        {alerte ? <span className="mt-0.5 block text-ui font-semibold text-warning">{alerte}</span> : null}
                      </span>
                      <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ),
      )}

      <button
        type="button"
        onClick={() => vue.choisirDossier(cleDuDossier(agence))}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Folder className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-corps font-semibold">{libelles.nomDeLAgence}</span>
          <span className="block truncate text-ui text-muted-foreground">{t('agenceDetail', { documents: libelles.documents(agence.documents) })}</span>
          {libelles.alerte(agence, aujourdhui) ? <span className="mt-0.5 block text-ui font-semibold text-warning">{libelles.alerte(agence, aujourdhui)}</span> : null}
        </span>
        <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
      </button>

      {sansDocument > 0 ? (
        <p data-testid="biens-sans-document" className="px-1 text-ui text-muted-foreground">
          {t('biensSansDocument', { n: sansDocument })}
        </p>
      ) : null}
    </div>
  );
}

function CarteDuBienDeplie({
  bien,
  vue,
  libelles,
  ouvert,
  basculer,
  aujourdhui,
}: {
  readonly bien: BienDuCoffre;
  readonly vue: EtatDeLaVue;
  readonly libelles: LibellesDeLAgence;
  readonly ouvert: (cle: string) => boolean;
  readonly basculer: (cle: string) => void;
  readonly aujourdhui: string;
}) {
  const t = useTranslations('documents.agence');
  return (
    <section aria-label={bien.title ?? undefined} data-testid="bien-deplie" className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded
        onClick={() => basculer(`bien-${bien.id}`)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <FolderOpen className="size-5 flex-none text-primary" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-corps font-semibold">{bien.title}</span>
          <span className="block truncate text-ui text-muted-foreground">{libelles.detailDuBien(bien)}</span>
        </span>
        <ChevronDown className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
      </button>
      <ul className="divide-y divide-border border-t border-border">
        {bien.folders.map((d) => (
          <LigneDeDossier key={d.key} dossier={d} niveau={1} vue={vue} libelles={libelles} aujourdhui={aujourdhui} />
        ))}
        {bien.leases.map((bail) => {
          const o = ouvert(`bail-${bail.id}`);
          const detail = libelles.detailDuBail(bail);
          return (
            <Fragment key={bail.id}>
              <li className={cn(o && 'bg-muted/40')}>
                <button
                  type="button"
                  aria-expanded={o}
                  onClick={() => basculer(`bail-${bail.id}`)}
                  className="flex min-h-12 w-full items-center gap-3 py-2 pr-4 pl-8 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {o ? (
                    <FolderOpen className="size-icone flex-none text-primary" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Folder className="size-icone flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-corps font-medium">{libelles.bail(bail)}</span>
                    {detail ? <span className="block truncate text-ui text-muted-foreground">{detail}</span> : null}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">{bail.documents}</span>
                  <ChevronDown className={cn('size-4 flex-none text-muted-foreground', !o && '-rotate-90')} aria-hidden="true" />
                </button>
              </li>
              {o ? bail.folders.map((d) => <LigneDeDossier key={`${bail.id}-${d.key}`} dossier={d} niveau={2} vue={vue} libelles={libelles} aujourdhui={aujourdhui} />) : null}
            </Fragment>
          );
        })}
      </ul>
      <span className="sr-only">{t('compte.documents', { n: bien.documents })}</span>
    </section>
  );
}

/** Un dossier de l'arbre du téléphone : son icône, son nom, son compte, « Généré », son alerte ; il s'ouvre en liste. */
function LigneDeDossier({
  dossier,
  niveau,
  vue,
  libelles,
  aujourdhui,
}: {
  readonly dossier: DossierDAgence;
  readonly niveau: 1 | 2;
  readonly vue: EtatDeLaVue;
  readonly libelles: LibellesDeLAgence;
  readonly aujourdhui: string;
}) {
  const t = useTranslations('documents.agence');
  const tMarques = useTranslations('documents.coffre.marques');
  const Icone = ICONE_DU_DOSSIER[dossier.key];
  const nom = libelles.dossier(dossier);
  const alerte = libelles.alerte(dossier, aujourdhui);
  return (
    <li data-testid="dossier-de-l-arbre">
      <button
        type="button"
        onClick={() => vue.choisirDossier(cleDuDossier(dossier))}
        aria-label={t('ouvrirDossier', { nom })}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 py-2 pr-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset',
          niveau === 1 ? 'pl-8' : 'pl-12',
        )}
      >
        <Icone className="size-icone flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex items-center gap-2">
            <span className="truncate text-corps font-medium">{nom}</span>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">{dossier.documents}</span>
            {dossier.kind === 'generated' ? <StatusBadge tone="info" label={tMarques('genereCourt')} className="text-legende" /> : null}
          </span>
          {alerte ? (
            <span data-testid="alerte-du-dossier" className="mt-0.5 block text-ui font-semibold text-warning">
              {alerte}
            </span>
          ) : null}
        </span>
        <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

/** L'arbre du bureau : Tous les documents, chaque bien, ses pièces, ses baux et leurs dossiers, puis l'agence. */
function ArbreDuBureau({
  coffre,
  trouve,
  vue,
  libelles,
}: {
  readonly coffre: CoffreDeLAgence;
  readonly trouve: DossierTrouve | null;
  readonly vue: EtatDeLaVue;
  readonly libelles: LibellesDeLAgence;
}) {
  const t = useTranslations('documents.agence');
  const biens = biensAvecDocuments(coffre);
  const { ouvert, basculer } = useDepliage(biens, trouve);
  const actif = trouve ? cleDuDossier(trouve.dossier) : null;
  const dossier = (d: DossierDAgence, niveau: 1 | 2) => (
    <EntreeDArbre key={cleDuDossier(d)} niveau={niveau} actif={actif === cleDuDossier(d)} compte={d.documents} onClick={() => vue.choisirDossier(cleDuDossier(d))}>
      {libelles.dossier(d)}
    </EntreeDArbre>
  );

  return (
    <nav aria-label={t('arbre')} data-testid="arbre-du-bureau" className="min-w-0 flex-[244_1_0%] text-sm">
      <ul>
        <EntreeDArbre actif={actif === null} compte={coffre.totals.documents} onClick={() => vue.choisirDossier(null)}>
          {t('tousLesDocuments')}
        </EntreeDArbre>
        {biens.map((bien) => {
          const o = ouvert(`bien-${bien.id}`);
          return (
            <Fragment key={bien.id}>
              <EntreeDArbre deplie={o} compte={bien.documents} onClick={() => basculer(`bien-${bien.id}`)}>
                {bien.title}
              </EntreeDArbre>
              {o
                ? [
                    ...bien.folders.map((d) => dossier(d, 1)),
                    ...bien.leases.flatMap((bail) => {
                      const ob = ouvert(`bail-${bail.id}`);
                      return [
                        <EntreeDArbre key={`bail-${bail.id}`} niveau={1} deplie={ob} compte={bail.documents} onClick={() => basculer(`bail-${bail.id}`)}>
                          {libelles.bail(bail)}
                        </EntreeDArbre>,
                        ...(ob ? bail.folders.map((d) => dossier(d, 2)) : []),
                      ];
                    }),
                  ]
                : null}
            </Fragment>
          );
        })}
        <EntreeDArbre separe actif={actif === cleDuDossier(coffre.agency_folder)} compte={coffre.agency_folder.documents} onClick={() => vue.choisirDossier(cleDuDossier(coffre.agency_folder))}>
          {libelles.nomDeLAgence}
        </EntreeDArbre>
      </ul>
    </nav>
  );
}

function EntreeDArbre({
  actif,
  deplie,
  niveau = 0,
  compte,
  separe,
  onClick,
  children,
}: {
  /** Un dossier choisi (`aria-pressed`) ; absent pour un nœud qui se déplie. */
  readonly actif?: boolean;
  /** Un bien ou un bail : déplié ou non (`aria-expanded`). */
  readonly deplie?: boolean;
  readonly niveau?: 0 | 1 | 2;
  readonly compte: number;
  readonly separe?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  const ouvertOuActif = deplie === true || actif === true;
  return (
    <li className={cn(separe && 'mt-3 border-t border-border pt-3')}>
      <button
        type="button"
        aria-pressed={deplie === undefined ? actif === true : undefined}
        aria-expanded={deplie}
        onClick={onClick}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-lg pr-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring',
          niveau === 0 ? 'pl-2' : niveau === 1 ? 'pl-6' : 'pl-10',
          actif ? 'bg-muted font-medium' : 'text-encre-douce',
        )}
      >
        {ouvertOuActif ? (
          <FolderOpen className="size-4 flex-none text-primary" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Folder className="size-4 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate">{children}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{compte}</span>
      </button>
    </li>
  );
}
