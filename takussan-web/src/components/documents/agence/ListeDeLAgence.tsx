'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, Download, Share2 } from 'lucide-react';

import { Pagination } from '@/components/console/Pagination';
import { ErrorState } from '@/components/feedback';
import { PageAuDelaDeLaDerniere } from '@/components/payments/PageAuDelaDeLaDerniere';
import { estAuDelaDeLaDernierePage } from '@/components/payments/pagination-de-l-adresse';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useTelechargementApi } from '@/hooks/useTelechargementApi';
import type { EntreeVue } from '@/lib/documents/coffre';
import {
  entreeDuDocument,
  entreeGeneree,
  rangeDansLeDossier,
  type CibleDAgence,
  type CleDeDossierDAgence,
} from '@/lib/documents/coffre-de-l-agence';
import { useListeDeLAgence, type FiltreDeLAgence } from '@/lib/queries/coffre-de-l-agence';
import { useDocumentsGeneres, useDocumentWithVersions } from '@/lib/queries/documents';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import { jourADakar } from '@/lib/visites/par-le-temps';
import type { Document } from '@/types/document';

import { useLibellesDuCoffre } from '../coffre/libelles';
import { TuileDEntree, useMarques } from '../coffre/LigneDuCoffre';
import { ApercuDuDocument } from '../fiche/ApercuDuDocument';
import { useNomDAuteur } from '../fiche/auteur';
import { LiensDePartage, PartagerParLien, useSuiviDesLiens } from '../fiche/PartageDuDocument';
import { VersionsDuDocument } from '../fiche/VersionsDuDocument';
import { seVersionne } from '@/lib/documents/fiche';

/**
 * TCK-2896 — la liste de la vue de l'agence et, au bureau, l'aperçu de la ligne choisie (colonnes 2
 * et 3 de la maquette `BureauAgence`).
 *
 * Deux sources, toutes deux jugées par le SERVEUR :
 *  · `agence` — `GET /api/documents?filter[agency]=current` (puces, recherche, et un dossier téléversé
 *    de l'arbre par `filter[documentable_type]` + `filter[documentable_id]`) ; `generes` rend les générés
 *    de toute l'agence (`filter[generated]=1`).
 *  · `generesDuBail` — un dossier généré d'un bail (Contrat, États des lieux, Quittances) :
 *    `GET /api/documents/generated?target=lease:{id}`, découpé par catégorie comme l'arbre le compte
 *    (`rangeDansLeDossier`) — `filter[generated]` ne se borne pas à un bail.
 *
 * Partager (ADR-0099 : jamais un généré) ouvre LE partage de la fiche (`PartagerParLien`) : la carte
 * flottante sous « Partager » de l'aperçu au bureau, la feuille du bas au téléphone, depuis le bouton
 * de la ligne. `DocumentShareDialog` n'existe plus.
 */

export type SourceDeLaListe =
  | { readonly genre: 'agence'; readonly filtre: FiltreDeLAgence; readonly q: string; readonly page: number; readonly cible: CibleDAgence | null }
  | { readonly genre: 'generesDuBail'; readonly bailId: number; readonly cle: CleDeDossierDAgence };

/** Ce que la liste sait du porteur d'une ligne, lu dans l'arbre (la liste ne sert ni locataire ni bien). */
export interface PorteursConnus {
  readonly locataireDuBail: (id: number) => string | null;
  readonly titreDuBien: (id: number) => string | null;
}

interface Ligne {
  readonly vue: EntreeVue;
  /** La pièce téléversée de la ligne : ses gestes (`abilities`) ; `null` pour un généré. */
  readonly doc: Document | null;
  readonly porteur: string | null;
}

export function ListeDeLAgence({
  source,
  bureau,
  porteurs,
  onPage,
  entete,
  dessous,
}: {
  readonly source: SourceDeLaListe;
  readonly bureau: boolean;
  readonly porteurs: PorteursConnus;
  readonly onPage: (page: number) => void;
  /** Au-dessus des lignes (le fil et les puces locales au bureau). */
  readonly entete?: ReactNode;
  /** Sous les lignes (« Dans le même bail »). */
  readonly dessous?: ReactNode;
}) {
  const t = useTranslations('documents.agence');
  const tDl = useTranslations('documents.download');
  const aujourdhui = jourADakar(new Date());
  const agence = useListeDeLAgence(
    source.genre === 'agence'
      ? { filtre: source.filtre, q: source.q, page: source.page, cible: source.cible }
      : { filtre: 'tous', q: '', page: 1, enabled: false },
  );
  const generes = useDocumentsGeneres(source.genre === 'generesDuBail' ? { type: 'lease', id: source.bailId } : null);
  const requete = source.genre === 'agence' ? agence : generes;
  const { telecharger, enCours, echec } = useTelechargementApi();
  const [choisie, setChoisie] = useState<string | null>(null);
  const [aPartager, setAPartager] = useState<Pick<Document, 'id' | 'name'> | null>(null);
  const suivi = useSuiviDesLiens();

  const porteurDe = (doc: Document): string | null => {
    if (doc.lease) return porteurs.locataireDuBail(doc.lease.id);
    const type = doc.documentable_type.toLowerCase();
    if (type === 'property' || type.endsWith('\\property')) return porteurs.titreDuBien(doc.documentable_id);
    return null;
  };

  let lignes: Ligne[] = [];
  let pagination: { readonly page: number; readonly last: number } | null = null;
  if (source.genre === 'agence' && agence.data) {
    // Chaque ligne se lit par SA forme, pas par la puce : la page d'avant reste affichée
    // (`keepPreviousData`) le temps que la suivante arrive, et « Générés » ne rend pas des `Document`.
    lignes = agence.data.data.map((x) =>
      'kind' in x && x.kind === 'generated'
        ? { vue: entreeGeneree(x, aujourdhui), doc: null, porteur: x.context?.lease?.tenant_name ?? null }
        : { vue: entreeDuDocument(x as Document, aujourdhui), doc: x as Document, porteur: porteurDe(x as Document) },
    );
    pagination = { page: agence.data.meta.current_page, last: agence.data.meta.last_page };
  } else if (source.genre === 'generesDuBail' && generes.data) {
    const locataire = porteurs.locataireDuBail(source.bailId);
    lignes = generes.data.data
      .filter((g) => rangeDansLeDossier(source.cle, g.category))
      .map((g) => ({ vue: entreeGeneree(g, aujourdhui), doc: null, porteur: locataire }));
  }

  const enApercu = lignes.find((l) => l.vue.cle === choisie) ?? lignes[0] ?? null;
  const surTelecharger = (chemin: string, nom: string) => void telecharger(chemin, `${nom}.pdf`);

  const vide =
    source.genre === 'agence' && source.q !== ''
      ? t('vide.recherche', { q: source.q })
      : source.genre === 'agence' && source.filtre !== 'tous'
        ? t('vide.filtre')
        : source.genre === 'agence' && source.cible === null
          ? t('vide.agence')
          : t('vide.dossier');

  const corps = requete.isPending ? (
    <div className="space-y-2" aria-busy="true">
      <span className="sr-only">{t('chargement')}</span>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  ) : requete.isError ? (
    <ErrorState message={t('echec')} onRetry={() => void requete.refetch()} retryLabel={t('reessayer')} />
  ) : source.genre === 'agence' && agence.data && estAuDelaDeLaDernierePage(lignes.length, agence.data.meta) ? (
    // TCK-2815 — une page au-delà de la dernière (`?page=` périmé) n'est pas une agence sans document.
    <PageAuDelaDeLaDerniere meta={agence.data.meta} allerA={onPage} />
  ) : lignes.length === 0 ? (
    <p data-testid="liste-de-l-agence-vide" className="rounded-xl border border-dashed border-border px-4 py-3.5 text-sm leading-snug text-muted-foreground">
      {vide}
    </p>
  ) : (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ul data-testid="liste-de-l-agence" className="divide-y divide-border">
        {lignes.map((l) => (
          <LigneDeLAgence
            key={l.vue.cle}
            ligne={l}
            bureau={bureau}
            choisie={bureau && enApercu?.vue.cle === l.vue.cle}
            onChoisir={() => setChoisie(l.vue.cle)}
            onTelecharger={surTelecharger}
            onPartager={l.doc && l.doc.abilities?.share === true ? () => setAPartager({ id: l.doc!.id, name: l.doc!.name }) : null}
          />
        ))}
      </ul>
    </div>
  );

  const milieu = (
    <div className={cn('min-w-0 space-y-3', bureau && 'xl:flex-[483_1_0%]')}>
      {entete}
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
      {corps}
      {pagination ? <Pagination page={pagination.page} lastPage={pagination.last} onChange={onPage} /> : null}
      {dessous}
    </div>
  );

  return (
    <>
      {milieu}
      {bureau ? (
        <aside aria-label={t('apercu')} className="min-w-0 space-y-5 xl:flex-[340_1_0%]">
          {enApercu ? <ApercuDeLaLigne ligne={enApercu} onTelecharger={surTelecharger} /> : null}
        </aside>
      ) : null}
      {!bureau && aPartager ? (
        <PartagerParLien open onOpenChange={(o) => (o ? null : setAPartager(null))} document={aPartager} suivi={suivi} bureau={false} />
      ) : null}
    </>
  );
}

function LigneDeLAgence({
  ligne,
  bureau,
  choisie,
  onChoisir,
  onTelecharger,
  onPartager,
}: {
  readonly ligne: Ligne;
  readonly bureau: boolean;
  readonly choisie: boolean;
  readonly onChoisir: () => void;
  readonly onTelecharger: (chemin: string, nom: string) => void;
  readonly onPartager: (() => void) | null;
}) {
  const t = useTranslations('documents.agence');
  const tCoffre = useTranslations('documents.coffre');
  const libelles = useLibellesDuCoffre();
  const { vue, porteur } = ligne;
  const marques = useMarques()(vue, true);
  const nom = libelles.entree(vue);
  const detail = [porteur, libelles.detail(vue)].filter(Boolean).join(' · ');
  const geste = vue.geste;

  const contenu = (
    <>
      <TuileDEntree vue={vue} className={bureau ? 'size-9' : undefined} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn('block truncate font-medium', bureau ? 'text-sm' : 'text-corps')}>{nom}</span>
        <span className={cn('mt-0.5 block truncate text-muted-foreground', bureau ? 'text-xs' : 'text-ui')}>{detail}</span>
        {marques ? <span className={cn('mt-1.5 flex flex-wrap items-center gap-1.5', bureau && 'w1440:hidden')}>{marques}</span> : null}
      </span>
    </>
  );
  const zone = 'flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring';

  if (bureau) {
    return (
      <li data-testid="ligne-de-l-agence" className={cn('flex items-center gap-3 px-4 py-2.5', choisie && 'bg-muted')}>
        <button type="button" aria-pressed={choisie} onClick={onChoisir} className={cn(zone, 'rounded-md')}>
          {contenu}
        </button>
        {marques ? <span className="hidden flex-none items-center gap-1.5 w1440:flex">{marques}</span> : null}
        {geste.geste === 'telecharger' ? (
          <button
            type="button"
            onClick={() => onTelecharger(geste.chemin, nom)}
            aria-label={tCoffre('telechargerNomme', { nom })}
            className="inline-flex size-8 flex-none items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Download className="size-4 text-encre-douce" strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : geste.geste === 'ouvrir' ? (
          <Link
            href={`/app/documents/${geste.documentId}`}
            aria-label={tCoffre('ouvrirNomme', { nom })}
            className="inline-flex size-8 flex-none items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          >
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        ) : null}
      </li>
    );
  }

  // Téléphone : la ligne ouvre la fiche (ou télécharge un généré) ; « Partager » à sa droite quand l'API l'accorde.
  return (
    <li data-testid="ligne-de-l-agence" className="flex items-center">
      {geste.geste === 'ouvrir' ? (
        <Link href={`/app/documents/${geste.documentId}`} className={cn(zone, 'px-4 py-3', onPartager && 'pr-1')}>
          {contenu}
          {onPartager ? null : <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />}
          <span className="sr-only">{tCoffre('ouvrir')}</span>
        </Link>
      ) : geste.geste === 'telecharger' ? (
        <button type="button" onClick={() => onTelecharger(geste.chemin, nom)} className={cn(zone, 'w-full px-4 py-3')}>
          {contenu}
          <span className="-mr-2 inline-flex size-11 flex-none items-center justify-center">
            <Download className="size-5 text-encre-douce" strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">{tCoffre('telecharger')}</span>
          </span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">{contenu}</div>
      )}
      {onPartager ? (
        <button
          type="button"
          onClick={onPartager}
          aria-label={t('partagerNomme', { nom })}
          className="mr-2 inline-flex size-11 flex-none items-center justify-center rounded-full text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Share2 className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}

/**
 * L'aperçu de la ligne choisie (maquette `PanneauApercu` + `BlocVersions` + `BlocLiens`). Une pièce
 * téléversée se lit sur sa fiche (`GET /api/documents/{id}`) : auteurs, gestes, fichier — la liste ne
 * les sert pas. Un généré n'a que sa marque et « Télécharger » (ADR-0099 § 3).
 */
function ApercuDeLaLigne({ ligne, onTelecharger }: { readonly ligne: Ligne; readonly onTelecharger: (chemin: string, nom: string) => void }) {
  const tCoffre = useTranslations('documents.coffre');
  const libelles = useLibellesDuCoffre();
  const marques = useMarques()(ligne.vue);
  const nom = libelles.entree(ligne.vue);
  const geste = ligne.vue.geste;

  if (ligne.doc === null) {
    return (
      <section data-testid="apercu-de-l-agence" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex justify-center bg-muted px-5 py-8">
          <TuileDEntree vue={ligne.vue} className="size-16 rounded-xl" iconeClassName="size-8" />
        </div>
        <div className="p-4">
          <p className="text-corps leading-snug font-semibold">{nom}</p>
          {marques ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{marques}</div> : null}
          {geste.geste === 'telecharger' ? (
            <Button type="button" className="mt-4 w-full" onClick={() => onTelecharger(geste.chemin, nom)}>
              <Download data-icon="inline-start" aria-hidden="true" />
              {tCoffre('telecharger')}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  // Une clé par pièce : les liens créés, la carte de partage ouverte ne passent pas d'une pièce à l'autre.
  return <ApercuDUnePiece key={ligne.doc.id} documentId={ligne.doc.id} nom={nom} marques={marques} />;
}

function ApercuDUnePiece({ documentId, nom, marques }: { readonly documentId: number; readonly nom: string; readonly marques: ReactNode }) {
  const t = useTranslations('documents.fiche');
  const tLib = useTranslations('documents.library');
  const f = useFormatteurs();
  const { user } = useAuth();
  const nomDe = useNomDAuteur();
  const requete = useDocumentWithVersions(documentId);
  const suivi = useSuiviDesLiens();
  const [partage, setPartage] = useState(false);
  const document = requete.data?.data;

  if (!document) {
    return requete.isError ? null : <Skeleton className="h-72 w-full rounded-xl" aria-busy="true" />;
  }

  const moi = (id: number | null) => user !== null && id !== null && id === user.id;
  // « Ajouté par » / « Vérifié par » : « vous, le … », « Qui, le … », ou la date seule quand l'API ne nomme personne.
  const paire = (par: 'ajoutePar' | 'verifiePar', le: 'ajouteLe' | 'verifieLe', date: string, id: number | null, qui: string | null): [string, string] =>
    moi(id) ? [t(`meta.${par}`), t('meta.vousLe', { date })] : qui ? [t(`meta.${par}`), t('meta.quiLe', { qui, date })] : [t(`meta.${le}`), date];
  const paires: [string, string][] = [];
  if (document.created_at) paires.push(paire('ajoutePar', 'ajouteLe', f.jourMois(document.created_at), document.uploaded_by, nomDe(document.uploaded_by_person)));
  if (document.is_verified && document.verified_at) {
    paires.push(paire('verifiePar', 'verifieLe', f.jourMois(document.verified_at), document.verified_by, nomDe(document.verified_by_person)));
  }
  const peutPartager = document.abilities?.share === true;
  const sesLiensSeuls = !peutPartager && document.abilities?.manage_own_share_links === true;

  return (
    <>
      <section data-testid="apercu-de-l-agence" className="overflow-hidden rounded-xl border border-border bg-card">
        <ApercuDuDocument document={document} className="h-48 rounded-none" />
        <div className="p-4">
          <p className="text-corps leading-snug font-semibold break-words">{nom}</p>
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
            {document.file_url ? (
              <a href={document.file_url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), 'flex-1')}>
                <Download data-icon="inline-start" aria-hidden="true" />
                {tLib('download')}
              </a>
            ) : null}
            {peutPartager ? (
              <PartagerParLien
                open={partage}
                onOpenChange={setPartage}
                document={document}
                suivi={suivi}
                bureau
                declencheur={
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setPartage(true)}>
                    <Share2 data-icon="inline-start" aria-hidden="true" />
                    {tLib('share')}
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      </section>
      <VersionsDuDocument documentId={document.id} peutAjouter={seVersionne(document)} peutRestaurer={document.abilities?.update === true} echeanceActuelle={document.expiry_date} />
      {peutPartager || sesLiensSeuls ? <LiensDePartage document={document} suivi={suivi} lesSiens={sesLiensSeuls} /> : null}
    </>
  );
}
