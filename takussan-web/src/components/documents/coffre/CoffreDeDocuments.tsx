'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Camera, ChevronDown, Download, ExternalLink, Folder, FolderOpen, Lock, TriangleAlert } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { Pagination } from '@/components/console/Pagination';
import { ErrorState } from '@/components/feedback';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { useDejaOuvert } from '@/hooks/useDejaOuvert';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useTelechargementApi } from '@/hooks/useTelechargementApi';
import { voirLeCoffre, voirLesTrouvees, type DossierVu, type EntreeVue } from '@/lib/documents/coffre';
import { ciblesDeRangement } from '@/lib/documents/rangement';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useCoffreDeDocuments, useRechercheDansLeCoffre } from '@/lib/queries/coffre';
import { cn } from '@/lib/utils';
import { jourADakar } from '@/lib/visites/par-le-temps';

import { ChampDeRecherche, useEcrireLaRecherche, useRechercheDansLURL } from './ChampDeRecherche';
import { useLibellesDuCoffre } from './libelles';
import { LigneDuCoffre, TuileDEntree, useMarques } from './LigneDuCoffre';

/** TCK-1041, TCK-2656 (lot 2) — l'ajout en deux temps n'est chargé qu'à sa première ouverture. */
const AjoutAuCoffre = dynamic(() => import('./ajout/AjoutAuCoffre').then((m) => m.AjoutAuCoffre));

/**
 * TCK-2656 (lot 1) — le coffre de documents du locataire, du bailleur et du prestataire :
 * `GET /api/me/document-vault`, rangé par dossier (« Mon bail », « Quittances 2026 », « Mes pièces »…).
 *
 * Maquette retenue : `app-documents` a, écrans « Locataire — le coffre » et « coffre encore vide »
 * (`CoffreMobile`, `CoffreBureau`). Téléphone : puces par dossier, alerte d'expiration, dossiers
 * repliables, ajout collé en bas. Bureau ≥ 1280 (`xl`) : l'arborescence, la liste, l'aperçu.
 *
 * TCK-2769 — « Chercher un document », le champ de la maquette : la requête part au serveur
 * (`filter[search]` de `GET /api/me/document-vault`, documents générés compris), gardée dans l'URL
 * (`?q=`, `?page=`) ; le coffre chargé n'est jamais filtré côté client. Sous une recherche, les
 * entrées trouvées remplacent les dossiers, avec le total et les pages du serveur. Il remplace le
 * geste « Rechercher » de TCK-2656 (décision 2 (c)). Pas de « Tout télécharger » : aucune archive
 * servie (décision 3 (a)).
 *
 * TCK-2729 — le dossier d'un bien d'un bailleur bloqué est en lecture seule : il se lit, rien ne s'y
 * ajoute ni ne s'y remplace, et le coffre le dit une fois.
 */

const TOUT = 'tout';
const EXPIRE = 'expire';

/** Une pièce dans la fenêtre « expire bientôt » (aujourd'hui compris). */
const expireBientot = (vue: EntreeVue) => vue.echeance?.etat === 'bientot' || vue.echeance?.etat === 'aujourdhui';

/** Au bureau, un dossier de plus de 4 entrées en montre 3, puis « Voir les N autres ». */
const APERCU_DU_DOSSIER = 3;

export function CoffreDeDocuments() {
  const t = useTranslations('documents.coffre');
  const tDl = useTranslations('documents.download');
  const libelles = useLibellesDuCoffre();
  const requete = useCoffreDeDocuments();
  const bureau = useMatchesMedia('(min-width: 80rem)');
  const [filtre, setFiltre] = useState<string>(TOUT);
  const [bascules, setBascules] = useState<Readonly<Record<string, boolean>>>({});
  const [choisie, setChoisie] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const ajoutMonte = useDejaOuvert(ajout);
  const { telecharger, enCours, echec } = useTelechargementApi();
  const { q, page } = useRechercheDansLURL();

  if (requete.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('titre')} />
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only">{t('chargement')}</span>
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (requete.isError || !requete.data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('titre')} />
        <ErrorState message={t('echec')} onRetry={() => void requete.refetch()} retryLabel={t('reessayer')} />
      </div>
    );
  }

  const coffre = requete.data.data;
  const vu = voirLeCoffre(coffre, jourADakar(new Date()));
  // Sous impersonation, l'API ne rend aucune cible rattachable : rien ne s'ajoute. Un dossier en
  // lecture seule (TCK-2729) n'en offre pas non plus.
  const peutAjouter = ciblesDeRangement(coffre).length > 0;
  const vide = vu.total === 0;
  // L'accueil du coffre vide est celui du locataire : un bailleur ou un prestataire a ses dossiers.
  const accueil = vide && coffre.folders.every((d) => d.kind === 'lease' || d.kind === 'receipts' || d.kind === 'pieces');

  const visibles: readonly DossierVu[] = vu.dossiers
    .map((d) => (filtre === EXPIRE ? { ...d, entrees: d.entrees.filter(expireBientot) } : d))
    .filter((d) => (filtre === TOUT ? true : filtre === EXPIRE ? d.entrees.length > 0 : d.key === filtre));

  const toutes = vu.dossiers.flatMap((d) => d.entrees.map((vue) => ({ vue, dossier: d })));
  const enApercu = toutes.find((x) => x.vue.cle === choisie) ?? toutes[0] ?? null;

  const ouvert = (d: DossierVu) => bascules[d.key] ?? (!d.replieParDefaut || filtre === d.key || filtre === EXPIRE);
  const basculer = (d: DossierVu) => setBascules((b) => ({ ...b, [d.key]: !ouvert(d) }));
  const surTelecharger = (chemin: string, nom: string) => void telecharger(chemin, `${nom}.pdf`);

  const libelleAjout = vide ? t('ajouterPremiere') : t('ajouter');
  // Au téléphone, l'action de la maquette (`Bouton taille="grand"`) : 48 px, texte 15, icône 18.
  const boutonAjout = (className?: string, grand = false) => (
    <Button type="button" className={cn(grand && 'text-corps', className)} onClick={() => setAjout(true)}>
      <Camera data-icon="inline-start" className={grand ? 'size-icone' : undefined} strokeWidth={1.75} aria-hidden="true" />
      {libelleAjout}
    </Button>
  );

  // Rien à chercher dans un coffre vide — sauf une recherche déjà dans l'URL, qu'on doit pouvoir effacer.
  const champ = !vide || q !== '' ? <ChampDeRecherche bureau={bureau} /> : null;
  const nombreDeBaux = coffre.folders.filter((d) => d.kind === 'lease').length;
  const lectureSeuleVisible = vu.lectureSeule && (filtre === TOUT || visibles.some((d) => d.lectureSeule));

  return (
    <div className="space-y-5 pb-4 xl:space-y-6">
      <PageHeader
        title={t('titre')}
        description={t('sousTitre', { count: vu.total })}
        actions={
          (bureau && champ) || peutAjouter ? (
            <>
              {bureau ? champ : null}
              {peutAjouter ? boutonAjout('max-md:hidden') : null}
            </>
          ) : undefined
        }
      />

      {/* Téléphone et bureau étroit : le champ sous l'en-tête, pleine largeur (maquette `CoffreMobile`). */}
      {bureau ? null : champ}

      {/* Téléphone et bureau étroit : les puces tiennent lieu d'arborescence. */}
      {!vide && q === '' ? (
        <RangeeDePuces aria-label={t('filtres')} className="-mx-4 -mt-2 xl:hidden">
          <PuceDeFiltre active={filtre === TOUT} compte={vu.total} onClick={() => setFiltre(TOUT)}>
            {t('tout')}
          </PuceDeFiltre>
          {vu.dossiers
            .filter((d) => d.entrees.length > 0)
            .map((d) => (
              <PuceDeFiltre key={d.key} active={filtre === d.key} compte={d.entrees.length} onClick={() => setFiltre(d.key)}>
                {libelles.dossier(d.etiquette)}
              </PuceDeFiltre>
            ))}
        </RangeeDePuces>
      ) : null}

      {echec ? (
        <p role="alert" className="text-ui text-destructive">
          {tDl(`errors.${echec}`)}
        </p>
      ) : null}
      {enCours ? (
        <p role="status" className="sr-only">
          {tDl('inProgress')}
        </p>
      ) : null}

      {q !== '' ? (
        <Trouvees q={q} page={page} nombreDeBaux={nombreDeBaux} bureau={bureau} onTelecharger={surTelecharger} />
      ) : (
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        {/* L'arborescence : 220 px au bureau de la maquette (61 pas de 3,6 px). */}
        <nav aria-label={t('arbre')} className="hidden flex-none text-sm xl:block xl:w-[calc(var(--spacing)*61)]">
          <ul>
            <EntreeDArbre actif={filtre === TOUT} compte={vu.total} onClick={() => setFiltre(TOUT)}>
              {t('tousLesDocuments')}
            </EntreeDArbre>
            {vu.dossiers.map((d) => (
              <EntreeDArbre key={d.key} actif={filtre === d.key} compte={d.entrees.length} onClick={() => setFiltre(d.key)}>
                {libelles.dossier(d.etiquette)}
              </EntreeDArbre>
            ))}
            {vu.expireBientot > 0 ? (
              <EntreeDArbre separe alerte actif={filtre === EXPIRE} compte={vu.expireBientot} onClick={() => setFiltre(EXPIRE)}>
                {t('expireBientot')}
              </EntreeDArbre>
            ) : null}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 space-y-4 xl:space-y-5">
          {accueil ? <Accueil /> : null}
          {lectureSeuleVisible ? (
            <p data-testid="coffre-lecture-seule" className="flex items-start gap-2.5 rounded-xl bg-secondary px-3.5 py-3 text-sm leading-snug text-encre-douce">
              <Lock className="mt-px size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1">{t('lectureSeule')}</span>
            </p>
          ) : null}
          {vu.alerte ? (
            <AlerteDExpiration
              vue={vu.alerte.entree}
              jours={vu.alerte.jours}
              nom={libelles.entree(vu.alerte.entree)}
              remplacable={!vu.alerte.lectureSeule}
            />
          ) : null}

          {visibles.map((d) => {
            const nom = libelles.dossier(d.etiquette);
            const entreesVisibles = bureau && d.entrees.length > APERCU_DU_DOSSIER + 1 && bascules[d.key] !== true ? d.entrees.slice(0, APERCU_DU_DOSSIER) : d.entrees;
            const lignes = (
              <ul className="divide-y divide-border">
                {entreesVisibles.map((vue) => {
                  const nomEntree = libelles.entree(vue);
                  return (
                    <LigneDuCoffre
                      key={vue.cle}
                      vue={vue}
                      nom={nomEntree}
                      detail={libelles.detail(vue)}
                      bureau={bureau}
                      choisie={bureau && enApercu?.vue.cle === vue.cle}
                      onChoisir={() => setChoisie(vue.cle)}
                      onTelecharger={surTelecharger}
                    />
                  );
                })}
              </ul>
            );

            if (bureau) {
              return (
                <section key={d.key} aria-label={nom}>
                  <h2 className="flex items-baseline gap-2 px-1 text-corps font-semibold">
                    {nom}
                    {d.entrees.length > 0 ? <span className="text-sm tabular-nums text-muted-foreground">{d.entrees.length}</span> : null}
                    {d.lectureSeule ? <MarqueLectureSeule /> : null}
                  </h2>
                  {d.entrees.length > 0 ? (
                    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
                      {lignes}
                      {entreesVisibles.length < d.entrees.length ? (
                        <button
                          type="button"
                          onClick={() => setBascules((b) => ({ ...b, [d.key]: true }))}
                          className="block w-full border-t border-border px-4 py-2.5 text-left text-ui font-medium text-primary-deep outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                        >
                          {t('voirLesAutres', { count: d.entrees.length - entreesVisibles.length })}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{t(`vide.${d.kind}`)}</p>
                  )}
                </section>
              );
            }

            const estOuvert = ouvert(d) && d.entrees.length > 0;
            return (
              <section key={d.key} aria-label={nom}>
                <h2 className="font-display text-lg font-semibold tracking-titre">
                  <button
                    type="button"
                    aria-expanded={estOuvert}
                    disabled={d.entrees.length === 0}
                    onClick={() => basculer(d)}
                    className="flex h-11 w-full items-center gap-2 rounded-md px-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-default"
                  >
                    {estOuvert ? (
                      <FolderOpen className="size-5 flex-none text-primary" strokeWidth={1.5} aria-hidden="true" />
                    ) : (
                      <Folder className="size-5 flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    )}
                    <span className="min-w-0 truncate">{nom}</span>
                    {d.entrees.length > 0 ? (
                      <span className="font-sans text-sm font-semibold tracking-normal tabular-nums text-muted-foreground">{d.entrees.length}</span>
                    ) : null}
                    {d.lectureSeule ? <MarqueLectureSeule /> : null}
                    {d.entrees.length > 0 ? (
                      <ChevronDown className={cn('ml-auto size-5 flex-none text-muted-foreground', !estOuvert && '-rotate-90')} aria-hidden="true" />
                    ) : null}
                  </button>
                </h2>
                {d.entrees.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-3.5 text-sm leading-snug text-muted-foreground">{t(`vide.${d.kind}`)}</p>
                ) : estOuvert ? (
                  <div className="overflow-hidden rounded-xl border border-border bg-card">{lignes}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => basculer(d)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 text-ui leading-snug text-muted-foreground">{libelles.resume(d)}</span>
                    <span className="sr-only">{t('ouvrirDossier', { nom })}</span>
                  </button>
                )}
              </section>
            );
          })}

          {filtre === TOUT && vu.biensSansDocument > 0 ? (
            <p data-testid="biens-sans-document" className="px-1 text-ui text-muted-foreground">
              {t('biensSansDocument', { count: vu.biensSansDocument })}
            </p>
          ) : null}
        </div>

        {/* L'aperçu : 320 px au bureau de la maquette (89 pas de 3,6 px). */}
        {bureau ? (
          <aside aria-label={t('apercu.titre')} className="flex-none xl:w-[calc(var(--spacing)*89)]">
            {enApercu ? (
              <Apercu vue={enApercu.vue} nom={libelles.entree(enApercu.vue)} dossier={libelles.dossier(enApercu.dossier.etiquette)} onTelecharger={surTelecharger} />
            ) : (
              <Accueil />
            )}
          </aside>
        ) : null}
      </div>
      )}

      {peutAjouter ? <BarreDAction taille="action">{boutonAjout(undefined, true)}</BarreDAction> : null}

      {ajoutMonte && peutAjouter ? (
        <AjoutAuCoffre open={ajout} onOpenChange={setAjout} coffre={coffre} vu={vu} onAjoute={() => void requete.refetch()} />
      ) : null}
    </div>
  );
}

/**
 * TCK-2769 — les entrées du coffre que le SERVEUR trouve pour `q`, à plat, chacune avec son dossier, le
 * total et les pages de l'API. Au bureau, l'aperçu de l'entrée choisie, comme dans le coffre.
 */
function Trouvees({
  q,
  page,
  nombreDeBaux,
  bureau,
  onTelecharger,
}: {
  readonly q: string;
  readonly page: number;
  readonly nombreDeBaux: number;
  readonly bureau: boolean;
  readonly onTelecharger: (chemin: string, nom: string) => void;
}) {
  const t = useTranslations('documents.coffre');
  const libelles = useLibellesDuCoffre();
  const requete = useRechercheDansLeCoffre(q, page);
  const ecrire = useEcrireLaRecherche();
  const [choisie, setChoisie] = useState<string | null>(null);

  if (requete.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">{t('recherche.chargement')}</span>
        <Skeleton className="h-5 w-40 rounded-md" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (requete.isError || !requete.data) {
    return <ErrorState message={t('recherche.echec')} onRetry={() => void requete.refetch()} retryLabel={t('reessayer')} />;
  }

  const { meta } = requete.data;
  const trouvees = voirLesTrouvees(requete.data.data, jourADakar(new Date()), nombreDeBaux);
  const enApercu = trouvees.find((x) => x.vue.cle === choisie) ?? trouvees[0] ?? null;

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <section aria-label={t('recherche.champ')} className="min-w-0 flex-1 space-y-3">
        <p role="status" className="px-1 text-ui text-muted-foreground">
          {t('recherche.resultats', { count: meta.total })}
        </p>
        {trouvees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-3.5 text-sm leading-snug">
            <p className="font-medium">{t('recherche.aucun', { q })}</p>
            <p className="mt-1 text-muted-foreground">{t('recherche.conseil')}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {trouvees.map(({ vue, dossier }) => {
                const nom = libelles.entree(vue);
                return (
                  <LigneDuCoffre
                    key={vue.cle}
                    vue={vue}
                    nom={nom}
                    detail={t('recherche.detail', { dossier: libelles.dossier(dossier), detail: libelles.detail(vue) })}
                    bureau={bureau}
                    choisie={bureau && enApercu?.vue.cle === vue.cle}
                    onChoisir={() => setChoisie(vue.cle)}
                    onTelecharger={onTelecharger}
                  />
                );
              })}
            </ul>
          </div>
        )}
        <Pagination page={meta.current_page} lastPage={meta.last_page} onChange={(suivante: number) => ecrire(q, suivante)} />
      </section>

      {bureau && enApercu ? (
        <aside aria-label={t('apercu.titre')} className="flex-none xl:w-[calc(var(--spacing)*89)]">
          <Apercu vue={enApercu.vue} nom={libelles.entree(enApercu.vue)} dossier={libelles.dossier(enApercu.dossier)} onTelecharger={onTelecharger} />
        </aside>
      ) : null}
    </div>
  );
}

function EntreeDArbre({
  actif,
  compte,
  separe,
  alerte,
  onClick,
  children,
}: {
  readonly actif: boolean;
  readonly compte: number;
  readonly separe?: boolean;
  readonly alerte?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <li className={cn(separe && 'mt-3 border-t border-border pt-3')}>
      <button
        type="button"
        aria-pressed={actif}
        onClick={onClick}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-lg pr-2 pl-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring',
          actif ? 'bg-muted font-medium' : 'text-encre-douce',
        )}
      >
        {alerte ? (
          <TriangleAlert className="size-4 flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
        ) : actif ? (
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

/** TCK-2729 — le dossier lui-même dit qu'il est figé : dans un coffre mixte, l'avis seul ne nomme pas lequel. */
function MarqueLectureSeule() {
  const t = useTranslations('documents.coffre');
  return (
    <span className="inline-flex flex-none items-center gap-1 self-center font-sans text-legende font-medium tracking-normal text-muted-foreground">
      <Lock className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      {t('dossierLectureSeule')}
    </span>
  );
}

function Accueil() {
  const t = useTranslations('documents.coffre.accueil');
  return (
    <div className="rounded-xl bg-secondary px-4 py-4">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-card text-primary-deep">
        <FolderOpen className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 className="mt-3 font-display text-xl leading-tight font-semibold tracking-titre">{t('titre')}</h2>
      <p className="mt-1.5 text-sm leading-snug text-encre-douce">{t('texte')}</p>
    </div>
  );
}

function AlerteDExpiration({
  vue,
  jours,
  nom,
  remplacable,
}: {
  readonly vue: EntreeVue;
  readonly jours: number;
  readonly nom: string;
  readonly remplacable: boolean;
}) {
  const t = useTranslations('documents.coffre.alerte');
  const id = remplacable && vue.geste.geste === 'ouvrir' ? vue.geste.documentId : null;
  return (
    <p data-testid="alerte-d-expiration" className="flex items-center gap-2.5 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-sm leading-snug">
      <TriangleAlert className="size-icone flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {t.rich('texte', { nom: () => <span className="font-semibold">{nom}</span>, jours })}
      </span>
      {id !== null ? (
        <Link href={`/app/documents/${id}`} className="flex-none rounded-md font-semibold text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
          {t('remplacer')}
        </Link>
      ) : null}
    </p>
  );
}

function Apercu({
  vue,
  nom,
  dossier,
  onTelecharger,
}: {
  readonly vue: EntreeVue;
  readonly nom: string;
  readonly dossier: string;
  readonly onTelecharger: (chemin: string, nom: string) => void;
}) {
  const t = useTranslations('documents.coffre');
  const f = useFormatteurs();
  const marques = useMarques()(vue);
  const e = vue.entree;
  const geste = vue.geste;
  const paires: [string, string][] = [];
  if (e.date) paires.push([t('apercu.date'), f.date(e.date)]);
  paires.push([t('apercu.rangeDans'), dossier]);
  if (e.kind === 'generated' && e.title && vue.nature !== 'releve' && vue.nature !== 'attestation') paires.push([t('apercu.reference'), e.title]);
  if (e.kind === 'generated') paires.push([t('apercu.fichier'), 'PDF']);

  return (
    <section data-testid="apercu-du-coffre" className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Aucune première page n'est servie : la tuile du document tient lieu d'aperçu. */}
      <div className="flex justify-center bg-muted px-5 py-8">
        <TuileDEntree vue={vue} className="size-16 rounded-xl" iconeClassName="size-8" />
      </div>
      <div className="p-4">
        <p className="text-corps leading-snug font-semibold">{nom}</p>
        {marques ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{marques}</div> : null}
        <dl className="mt-3 divide-y divide-border border-y border-border">
          {paires.map(([libelle, valeur]) => (
            <div key={libelle} className="flex items-baseline justify-between gap-3 py-2 text-ui">
              <dt className="text-muted-foreground">{libelle}</dt>
              <dd className="min-w-0 truncate text-right font-medium">{valeur}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex gap-2">
          {geste.geste === 'telecharger' ? (
            <Button type="button" className="flex-1" onClick={() => onTelecharger(geste.chemin, nom)}>
              <Download data-icon="inline-start" aria-hidden="true" />
              {t('telecharger')}
            </Button>
          ) : geste.geste === 'ouvrir' ? (
            <Link href={`/app/documents/${geste.documentId}`} className={cn(buttonVariants(), 'flex-1')}>
              <ExternalLink data-icon="inline-start" aria-hidden="true" />
              {t('ouvrir')}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
