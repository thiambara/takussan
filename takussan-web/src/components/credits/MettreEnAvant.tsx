'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { Loader2 } from 'lucide-react';

import type { EffetAchat } from '@/components/boost/effet-achat';
import type { BoostProduct } from '@/components/boost/types';
import { useAchatDeBoost } from '@/components/boost/useAchatDeBoost';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useBiensAPousser, useBiensEnLigne, type BienAPousser, type BienEnLigne, type CarteDeBien } from '@/lib/queries/credits';
import { cn } from '@/lib/utils';

import { familleDe, grilleDesOffres, prochaineExpiration, type FamilleDOffre, type LigneDeGrille } from './lecture';
import { Vignette } from './pieces';

/**
 * TCK-2664 — « Mettre un bien en avant » depuis la page Crédits (maquette `app-credits`, écran
 * « booster ») : 1 · quel bien, 2 · quelle mise en avant, puis ce qu'il restera. Au téléphone, le
 * formulaire plein écran (`PanneauDroit formulaire` : croix à gauche, barre collante) ; au bureau,
 * le dialogue de 880 px en deux colonnes.
 *
 * · Les règles de l'achat (solde, manque, effet sur le boost en place, refus du serveur, clé
 *   d'idempotence) sont celles du dialogue de la page d'un bien : `useAchatDeBoost`, partagé.
 * · Les biens proposés d'abord sont ceux « à pousser » (sans contact depuis 30 jours, les moins
 *   vus d'abord, TCK-2663) ; la recherche porte sur TOUS les biens en ligne, côté serveur
 *   (`filter[public]=1` : la règle même que l'achat exige).
 * · Chaque prix vient de `GET /api/boost-products` ; une offre que le solde ne couvre pas reste
 *   visible, désactivée, avec ce qu'il manque à côté (AC3).
 */

/** Ce que l'appelant pose à l'ouverture : « Remonter · 5 » (le bien et la Remontée), « Relancer ». */
export interface Preselection {
  readonly bien: CarteDeBien | null;
  readonly offreId: number | null;
}

interface Candidat {
  readonly id: number;
  readonly titre: string;
  readonly photo: string | null;
  readonly lieu: string | null;
  readonly vues: number | null;
  /** `undefined` : on ne sait pas (résultat de recherche) ; `null` : jamais contacté. */
  readonly dernierContact?: string | null;
}

const depuisCarte = (b: CarteDeBien): Candidat => ({ id: b.id, titre: b.title ?? '', photo: b.main_photo_url, lieu: b.quarter, vues: null });
const depuisSuggestion = (b: BienAPousser): Candidat => ({ ...depuisCarte(b), vues: b.views_count, dernierContact: b.last_contact_at });
const depuisRecherche = (b: BienEnLigne): Candidat => ({
  id: b.id,
  titre: b.title ?? '',
  photo: b.main_photo_url,
  lieu: b.location?.quarter ?? b.location?.city ?? null,
  vues: b.views_count ?? null,
});

const NB_SUGGESTIONS = 5;

/* ─────────────────────────────── 1 · quel bien ─────────────────────────────── */

function LigneDeCandidat({ c, choisi, bureau }: { readonly c: Candidat; readonly choisi: boolean; readonly bureau: boolean }) {
  const t = useTranslations('credits.flux');
  const tPousser = useTranslations('credits.pousser');
  const f = useFormatteurs();
  const contact = c.dernierContact === undefined ? null : c.dernierContact === null ? t('aucunContact') : t('dernierContact', { date: f.jourMois(c.dernierContact) });
  return (
    <label
      data-slot="candidat"
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 has-focus-visible:ring-3 has-focus-visible:ring-ring',
        choisi ? 'border-foreground ring-1 ring-foreground' : 'border-border',
      )}
    >
      <Vignette src={c.photo} taille={bureau ? 44 : 48} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-corps font-medium">{c.titre}</span>
        <span className="mt-0.5 block truncate text-ui text-muted-foreground">
          {[c.lieu, c.vues === null ? null : tPousser('vues', { count: c.vues }), contact].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Radio value={String(c.id)} />
    </label>
  );
}

function ChoixDuBien({
  choisi,
  onChoisir,
  preselectionne,
  bureau,
}: {
  readonly choisi: Candidat | null;
  readonly onChoisir: (c: Candidat) => void;
  readonly preselectionne: Candidat | null;
  readonly bureau: boolean;
}) {
  const t = useTranslations('credits.flux');
  const [recherche, setRecherche] = useState('');
  const suggestions = useBiensAPousser(NB_SUGGESTIONS);
  const enLigne = useBiensEnLigne('');
  const resultats = useBiensEnLigne(recherche, recherche !== '');
  const total = enLigne.data?.meta.total;

  const proposes = (suggestions.data?.data ?? []).map(depuisSuggestion);
  const sansRecherche = preselectionne && !proposes.some((c) => c.id === preselectionne.id) ? [preselectionne, ...proposes] : proposes;
  const trouves = recherche ? (resultats.data?.data ?? []).map(depuisRecherche) : sansRecherche;
  // Le bien choisi reste à l'écran, en tête, quelle que soit la recherche : on n'achète jamais pour un
  // bien qu'on ne voit plus (le pied du téléphone ne le nomme pas).
  const liste = choisi && !trouves.some((c) => c.id === choisi.id) ? [choisi, ...trouves] : trouves;
  const enCours = recherche ? resultats.isLoading : suggestions.isLoading;
  const enEchec = recherche ? resultats.isError : suggestions.isError;

  return (
    <div data-slot="choix-du-bien">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p id="mettre-en-avant-bien" className="flex-none text-sm font-semibold whitespace-nowrap">
          {t('etapeBien')}
        </p>
        {recherche ? null : <p className="min-w-0 text-right text-ui text-muted-foreground">{t('ordre')}</p>}
      </div>
      <DebouncedSearchInput
        value={recherche}
        onCommit={(q) => setRecherche(q.trim())}
        placeholder={total === undefined ? t('chercherSansCompte') : t('chercher', { count: total })}
        aria-label={t('chercherAria')}
        busy={recherche !== '' && resultats.isFetching}
        className="mb-2"
      />
      {enCours ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : enEchec ? (
        <ErrorState message={t('biensEnEchec')} onRetry={() => void (recherche ? resultats.refetch() : suggestions.refetch())} retryLabel={t('reessayer')} />
      ) : liste.length === 0 ? (
        <p role="status" className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          {recherche ? t('aucunResultat', { q: recherche }) : t('aucuneSuggestion')}
        </p>
      ) : (
        <RadioGroup
          aria-labelledby="mettre-en-avant-bien"
          value={choisi ? String(choisi.id) : null}
          onValueChange={(v) => {
            const c = liste.find((x) => String(x.id) === v);
            if (c) onChoisir(c);
          }}
          className="grid-cols-[minmax(0,1fr)] gap-2"
        >
          {liste.map((c) => (
            <LigneDeCandidat key={c.id} c={c} choisi={choisi?.id === c.id} bureau={bureau} />
          ))}
        </RadioGroup>
      )}
    </div>
  );
}

/* ─────────────────────────── 2 · quelle mise en avant ─────────────────────────── */

function Prix({ n }: { readonly n: number }) {
  const t = useTranslations('credits.page');
  return (
    <span className="flex-none text-corps font-semibold tabular-nums">
      {n} <span className="text-ui font-normal text-muted-foreground">{t('unite', { count: n })}</span>
    </span>
  );
}

function FamilleDOffreChoix({
  ligne,
  choisie,
  offre,
  onOffre,
  manqueDe,
}: {
  readonly ligne: LigneDeGrille;
  readonly choisie: boolean;
  readonly offre: BoostProduct | null;
  readonly onOffre: (o: BoostProduct) => void;
  readonly manqueDe: (o: BoostProduct) => number;
}) {
  const t = useTranslations('credits');
  const { famille, offres } = ligne;
  const unique = offres.length === 1 ? offres[0] : null;
  // Une famille se choisit tant qu'une de ses offres est couverte ; sinon elle dit ce qui manque
  // pour la moins chère.
  const manque = Math.min(...offres.map(manqueDe));
  const idManque = `manque-${famille}`;
  return (
    <div
      data-slot="offre"
      data-famille={famille}
      className={cn('rounded-lg border px-3 py-2.5', choisie ? 'border-foreground ring-1 ring-foreground' : 'border-border', manque > 0 && 'bg-muted/40')}
    >
      <label className={cn('flex items-center gap-3', manque > 0 ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <Radio value={famille} disabled={manque > 0} aria-describedby={manque > 0 ? idManque : undefined} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className={cn('block text-corps font-medium', manque > 0 && 'text-muted-foreground')}>{t(`offres.${famille}.nom`)}</span>
          <span className="mt-0.5 block text-ui text-muted-foreground">{t(`flux.detail.${famille}`, { jours: offres[0].duration_days })}</span>
        </span>
        {unique ? <Prix n={unique.price_credits} /> : null}
      </label>
      {manque > 0 ? (
        <p id={idManque} data-slot="raison" className="mt-1.5 pl-8 text-ui font-medium text-destructive">
          {t('flux.manque', { count: manque })}
        </p>
      ) : null}
      {/* Les durées : un second groupe, dont chaque case est une offre. */}
      {unique ? null : (
        <RadioGroup
          aria-label={t('flux.dureesAria')}
          value={offre && familleDe(offre.kind, offre.variant) === famille ? String(offre.id) : null}
          onValueChange={(v) => {
            const o = offres.find((x) => String(x.id) === v);
            if (o) onOffre(o);
          }}
          className="mt-3 grid grid-cols-3 gap-2"
        >
          {offres.map((o) => {
            const m = manqueDe(o);
            return (
              <RadioPrimitive.Root
                key={o.id}
                value={String(o.id)}
                disabled={m > 0}
                data-slot="duree"
                className={cn(
                  'flex flex-col items-center rounded-lg border border-border py-2 leading-tight outline-none focus-visible:ring-3 focus-visible:ring-ring',
                  'data-checked:border-primary data-checked:bg-secondary data-disabled:cursor-not-allowed data-disabled:bg-muted/40',
                )}
              >
                <span className={cn('text-sm font-medium', m > 0 && 'text-muted-foreground')}>{t('flux.duree', { jours: o.duration_days })}</span>
                <span className={cn('mt-0.5 text-ui tabular-nums', m > 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                  {m > 0 ? t('flux.manqueCourt', { count: m }) : t('flux.prix', { count: o.price_credits })}
                </span>
              </RadioPrimitive.Root>
            );
          })}
        </RadioGroup>
      )}
    </div>
  );
}

function ChoixDeLOffre({
  grille,
  offre,
  onOffre,
  manqueDe,
}: {
  readonly grille: readonly LigneDeGrille[];
  readonly offre: BoostProduct | null;
  readonly onOffre: (o: BoostProduct) => void;
  readonly manqueDe: (o: BoostProduct) => number;
}) {
  const t = useTranslations('credits.flux');
  const famille = offre ? familleDe(offre.kind, offre.variant) : null;
  return (
    <div data-slot="choix-de-l-offre">
      <p id="mettre-en-avant-offre" className="mb-2 text-sm font-semibold">
        {t('etapeOffre')}
      </p>
      <RadioGroup
        aria-labelledby="mettre-en-avant-offre"
        value={famille}
        onValueChange={(v) => {
          const ligne = grille.find((l) => l.famille === (v as FamilleDOffre));
          // La famille choisie prend sa première offre couverte (la plus courte d'abord).
          const o = ligne?.offres.find((x) => manqueDe(x) === 0);
          if (o) onOffre(o);
        }}
        className="grid-cols-[minmax(0,1fr)] gap-2"
      >
        {grille.map((ligne) => (
          <FamilleDOffreChoix key={ligne.famille} ligne={ligne} choisie={famille === ligne.famille} offre={offre} onOffre={onOffre} manqueDe={manqueDe} />
        ))}
      </RadioGroup>
    </div>
  );
}

/* ─────────────────────────────── le parcours ─────────────────────────────── */

function useDireEffet() {
  // Les phrases de l'effet sont celles de la fenêtre d'achat : une seule source (TCK-824).
  const t = useTranslations('boost.dialog.effect');
  const f = useFormatteurs();
  return (e: NonNullable<EffetAchat>) => {
    switch (e.type) {
      case 'remplaceBadge':
        return e.jusquA
          ? t('replacesBadge', { badge: t(`badges.${e.variant}`), date: f.date(e.jusquA) })
          : t('replacesPausedBadge', { badge: t(`badges.${e.variant}`) });
      case 'prolongeVedette':
        return e.jusquA ? t('extendsFeatured', { date: f.date(e.jusquA) }) : t('extendsPausedFeatured', { days: e.jours });
      case 'remonteeEnDelai':
        return t('bumpCooldown', { date: f.dateTime(e.aPartirDu) });
    }
  };
}

/**
 * Le parcours, monté à l'ouverture et démonté à la fermeture : chaque ouverture repart de la
 * présélection (et d'une clé d'idempotence neuve).
 */
export function MettreEnAvant({
  preselection,
  bureau,
  onFermer,
}: {
  readonly preselection: Preselection;
  readonly bureau: boolean;
  readonly onFermer: () => void;
}) {
  const t = useTranslations('credits');
  const f = useFormatteurs();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const direEffet = useDireEffet();
  const preselectionne = preselection.bien ? depuisCarte(preselection.bien) : null;
  const [bien, setBien] = useState<Candidat | null>(preselectionne);
  const a = useAchatDeBoost({ propertyId: bien?.id ?? null, ouvert: true, choixInitial: preselection.offreId });
  const { solde, offre, manque, refusSolde, effet, achat } = a;
  const grille = grilleDesOffres(a.offres);
  const expiration = prochaineExpiration(a.lots);

  const nomDeLOffre = (o: BoostProduct) =>
    familleDe(o.kind, o.variant) === 'featured' ? t('flux.vedette', { jours: o.duration_days }) : t(`offres.${familleDe(o.kind, o.variant)}.nom`);
  // L'effet sur le boost en place doit être connu avant de confirmer (TCK-824).
  const pret = bien !== null && offre !== null && manque === 0 && !achat.isPending && !a.chargementDuBien && !a.echecDuBien;
  const confirmer = () => {
    if (!pret || !bien || !offre) return;
    a.confirmer(() => {
      toast.add({ title: t('flux.fait', { bien: bien.titre, offre: nomDeLOffre(offre) }), type: 'success' });
      onFermer();
    });
  };

  const titre = t('flux.titre');
  const soldeDit = t('flux.solde', { count: solde });
  const restera = offre && manque === 0 ? solde - offre.price_credits : null;
  const libelleConfirmer = offre ? t('flux.confirmer', { count: offre.price_credits }) : t('flux.confirmerSansChoix');
  const ditRestera =
    restera === null ? null : t.rich('flux.restera', { count: restera, solde, b: (c: ReactNode) => <span className="font-semibold text-foreground">{c}</span> });

  const corps = a.chargementDesOffres ? (
    <div className="space-y-2" aria-busy="true">
      {[0, 1, 2, 3].map((n) => (
        <Skeleton key={n} className="h-16 rounded-lg" />
      ))}
    </div>
  ) : a.echecDesOffres ? (
    <ErrorState message={t('loadError')} onRetry={a.relire} retryLabel={t('retry')} />
  ) : (
    <div className={cn(bureau ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6' : 'space-y-6')}>
      <ChoixDuBien choisi={bien} onChoisir={setBien} preselectionne={preselectionne} bureau={bureau} />
      <div className="space-y-3">
        <ChoixDeLOffre grille={grille} offre={offre} onOffre={(o) => a.choisir(o.id)} manqueDe={a.manqueDe} />
        <div aria-live="polite" className="empty:hidden">
          {effet ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">{direEffet(effet)}</p> : null}
        </div>
        {a.echecDuBien ? <ErrorState message={t('flux.bienEnEchec')} onRetry={a.relire} retryLabel={t('retry')} /> : null}
        {a.offres.some((o) => o.is_active && a.manqueDe(o) > 0) ? <p className="text-ui text-muted-foreground">{t('flux.pasDAchat')}</p> : null}
        {refusSolde ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {t('flux.manque', { count: refusSolde.missing })}
          </p>
        ) : achat.error ? (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(achat.error, t('flux.echecAchat'))}
          </p>
        ) : null}
      </div>
    </div>
  );

  const bouton = (
    <Button type="button" size={bureau ? 'default' : 'xl'} className={bureau ? undefined : 'w-full'} disabled={!pret} onClick={confirmer}>
      {achat.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {libelleConfirmer}
    </Button>
  );

  if (bureau) {
    return (
      <Dialog open onOpenChange={(o) => (o ? undefined : onFermer())}>
        <DialogContent
          data-slot="mettre-en-avant"
          className="flex max-h-[calc(100dvh-var(--spacing)*16)] flex-col gap-0 overflow-hidden p-0 ring-border sm:max-w-[55rem]"
        >
          <div className="flex flex-none items-start gap-3 border-b border-border py-4 pr-12 pl-6">
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-lg font-semibold tracking-titre">{titre}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {[soldeDit, expiration ? t('page.expirent', { count: expiration.credits, date: f.jourMois(expiration.date) }) : null].filter(Boolean).join(' · ')}
              </DialogDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{corps}</div>
          <div className="flex flex-none items-center justify-end gap-2 border-t border-border bg-muted/40 px-6 py-3">
            <span data-slot="resume" className="mr-auto min-w-0 truncate text-sm text-muted-foreground">
              {offre && bien ? t('flux.resume', { offre: nomDeLOffre(offre), bien: bien.titre }) : null}
              {ditRestera ? <span className="ml-2 font-medium text-foreground">{ditRestera}</span> : null}
            </span>
            <Button type="button" variant="ghost" onClick={onFermer}>
              {t('flux.fermer')}
            </Button>
            {bouton}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <PanneauDroit
      open
      formulaire
      onOpenChange={(o) => (o ? undefined : onFermer())}
      titre={titre}
      sousTitre={soldeDit}
      pied={
        <div>
          {ditRestera ? (
            <p data-slot="resume" className="mb-2.5 text-center text-sm text-muted-foreground">
              {ditRestera}
            </p>
          ) : null}
          {bouton}
        </div>
      }
    >
      {corps}
    </PanneauDroit>
  );
}
