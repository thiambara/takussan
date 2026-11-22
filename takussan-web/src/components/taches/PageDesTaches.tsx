'use client';

import { useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, ListTodo, Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Etiquette } from '@/components/journee/pieces';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/context/AuthContext';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import { echeanceDuReport, type Report } from '@/lib/journee/journee';
import { useComptesDesTaches, useListeDesTaches, useMembresAssignables, useModifierTache, type TacheDeLaPage } from '@/lib/queries/taches';
import {
  basculer,
  estActive,
  estFaite,
  grouper,
  grouperParRattachement,
  rechercheDe,
  type EtatDesTaches,
  type FiltreDeRattachement,
  type Groupe,
  type Pastille,
  type Regroupement,
  type Selection,
} from '@/lib/taches/taches';
import { cn } from '@/lib/utils';
import { ChoixDansUneListe } from './ChoixDansUneListe';
import { FicheDeTache, PiedDeFicheDeTache, peutModifier } from './FicheDeTache';
import { LigneDeTache } from './LigneDeTache';
import { EnvoiDeNouvelleTache, NouvelleTache, type EtatDEnvoi, type Rattachement } from './NouvelleTache';
import { TableauDeTaches } from './TableauDeTaches';

const PANNEAU = '(width >= 80rem)';
/** TCK-2857 — le bureau (dès `md`) : les filtres de la tête, « Plus tard » en tableau. */
const BUREAU = '(width >= 48rem)';

/** TCK-2857 — les groupes rendus en tableau au bureau (la maquette y range aussi « Sans échéance »). */
const EN_TABLEAU: readonly Groupe[] = ['plusTard', 'sans'];

const PASTILLES: readonly Pastille[] = ['overdue', 'today', 'upcoming', 'none', 'done', 'all'];

/** Le compte d'un groupe, quand la page n'a pas tout chargé : celui de l'API. */
const COMPTE_DU_GROUPE: Partial<Record<Groupe, 'overdue' | 'today' | 'none' | 'done'>> = { retard: 'overdue', aujourdhui: 'today', sans: 'none', faites: 'done' };

/** Les groupes posés en colonnes au bureau ; les autres suivent en pleine largeur. */
const EN_COLONNES: readonly Groupe[] = ['retard', 'aujourdhui', 'semaine'];

interface PageDesTachesProps {
  readonly etatInitial: EtatDesTaches;
  /** `?nouvelle=1` : la feuille « Nouvelle tâche » s'ouvre (le « + » de « Ma journée »). */
  readonly ouvrirNouvelle?: boolean;
  /** `crm.view_all` dans l'agence active : le filtre « Assignée à » de l'équipe (TCK-2595). */
  readonly equipeVisible?: boolean;
  /** TCK-2857 — `?nouvelle=1&pour=customer:12` : « Rattachée à » prérempli (le libellé relu par la page). */
  readonly rattachement?: Rattachement | null;
}

/**
 * TCK-2596 (lot 2) — « Tâches » (maquette `app-aujourdhui` a, « Toutes les tâches ») : les pastilles
 * comptées (En retard · Aujourd'hui · À venir · Sans échéance · Faites · Toutes), l'ouverture sur En
 * retard + Aujourd'hui, « Assignées à moi », les tâches groupées par échéance — en sections au
 * téléphone, en colonnes au bureau (dès `xl`) — ; toucher une ligne ouvre la tâche (feuille du bas,
 * panneau droit dès `xl`), « + » ouvre « Nouvelle tâche ».
 */
export function PageDesTaches({ etatInitial, ouvrirNouvelle = false, equipeVisible = false, rattachement = null }: PageDesTachesProps) {
  const t = useTranslations('taches');
  const f = useFormatteurs();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const messageErreur = useMessageErreurApi();
  const maintenant = useMinuteCourante();
  const enPanneau = useMatchesMedia(PANNEAU);
  const auBureau = useMatchesMedia(BUREAU);
  const [etat, setEtat] = useState<EtatDesTaches>(etatInitial);
  const [ouverte, setOuverte] = useState<TacheDeLaPage | null>(null);
  // TCK-2857 — « Modifier » du tableau : la fiche s'ouvre, le titre en édition.
  const [enEdition, setEnEdition] = useState(false);
  const [nouvelle, setNouvelle] = useState(ouvrirNouvelle);
  const [envoi, setEnvoi] = useState<EtatDEnvoi>({ pret: false, enCours: false, echeance: 'demain' });
  const [enCours, setEnCours] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const moi = user?.id ?? null;
  const nomDeMoi = user ? nomAffichable(user) : null;
  const membres = useMembresAssignables(user?.agency_id ?? null);
  const liste = useListeDesTaches(etat);
  const comptes = useComptesDesTaches(etat);
  const cocher = useModifierTache();

  const changer = (suivant: EtatDesTaches) => {
    setEtat(suivant);
    const recherche = rechercheDe(suivant);
    router.replace(recherche ? `${pathname}?${recherche}` : pathname, { scroll: false });
  };
  const choisir = (pastille: Pastille) => changer({ ...etat, selection: basculer(etat.selection, pastille) });
  const selection: Selection = etat.selection;

  const basculerFaite = (tache: TacheDeLaPage) => {
    setErreur(null);
    setEnCours(tache.id);
    cocher.mutate(
      { id: tache.id, status: estFaite(tache) ? 'open' : 'done' },
      {
        onError: (e) => setErreur(messageErreur(e, t('echecCoche'))),
        onSettled: () => setEnCours(null),
      },
    );
  };

  // TCK-2857 — « Reporter » en ligne : la nouvelle échéance, sans ouvrir la fiche.
  const reporter = (tache: TacheDeLaPage, r: Report) => {
    setErreur(null);
    setEnCours(tache.id);
    cocher.mutate(
      { id: tache.id, due_at: echeanceDuReport(r, maintenant) },
      {
        onError: (e) => setErreur(messageErreur(e, t('echecCoche'))),
        onSettled: () => setEnCours(null),
      },
    );
  };
  const ouvrir = (tache: TacheDeLaPage, edition = false) => {
    setEnEdition(edition);
    setOuverte(tache);
  };

  const lignes = liste.data?.pages.flatMap((p) => p.data) ?? [];
  const groupes = grouper(lignes, maintenant, selection);
  const toutCharge = !liste.hasNextPage;
  const compteDe = (g: Groupe, n: number) => {
    const cle = COMPTE_DU_GROUPE[g];
    return toutCharge || !cle ? n : (comptes[cle] ?? n);
  };

  const sousTitre = [
    comptes.overdue ? t('resume.retard', { n: comptes.overdue }) : null,
    comptes.today ? t('resume.aujourdhui', { n: comptes.today }) : null,
    comptes.upcoming ? t('resume.aVenir', { n: comptes.upcoming }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const aVenirReplie = selection.mode === 'periodes' && !selection.periodes.includes('upcoming') && (comptes.upcoming ?? 0) > 0;

  const interrupteurAMoi = (classe: string) =>
    etat.equipe ? null : (
      <label className={classe}>
        <span className="flex-1">{t('assigneesAMoi')}</span>
        <Switch checked={etat.aMoi} onCheckedChange={(oui) => changer({ ...etat, aMoi: oui })} />
      </label>
    );

  const ligne = (tache: TacheDeLaPage, dense: boolean) => (
    <LigneDeTache
      key={tache.id}
      tache={tache}
      maintenant={maintenant}
      dense={dense}
      enCours={enCours === tache.id || !peutModifier(tache, moi)}
      onCocher={basculerFaite}
      onOuvrir={ouvrir}
      onReporter={ouvrir}
    />
  );

  const tableau = (taches: readonly TacheDeLaPage[]) => (
    <TableauDeTaches
      taches={taches}
      maintenant={maintenant}
      bloquee={(tache) => enCours === tache.id || !peutModifier(tache, moi)}
      modifiable={(tache) => peutModifier(tache, moi)}
      onCocher={basculerFaite}
      onOuvrir={ouvrir}
      onReporter={reporter}
      onChoisirLaDate={ouvrir}
      onModifier={(tache) => ouvrir(tache, true)}
    />
  );

  // TCK-2857 (maquette e1, l. 503) — l'aide du balayage, au téléphone, sous le premier groupe. Toujours
  // montrée, comme la maquette (pas de préférence « vue une fois »).
  const aideDuBalayage = (
    <p data-slot="aide-du-balayage" className="px-4 pt-2 text-ui text-muted-foreground md:hidden">
      {t('aideBalayage')}
    </p>
  );

  const parRattachement = (
    <div className="space-y-5 md:space-y-6">
      {grouperParRattachement(lignes).map((g, i) => {
        // TCK-617 — un parent supprimé se dit dans l'en-tête du groupe aussi.
        const supprime = g.taches.some((tache) => tache.parent_deleted);
        const titre = g.cible ? (g.cible.label ?? t(supprime ? `ligne.supprime.${g.cible.type}` : `ligne.cache.${g.cible.type}`)) : t('groupe.sansRattachement');
        return (
          <section key={g.cle} data-rattachement={g.cle} aria-label={titre} className="pt-5 md:pt-0">
            <Etiquette className="px-4 pb-1 md:px-0 md:pb-2" compte={g.taches.length}>
              {titre}
            </Etiquette>
            <ul className="divide-y divide-border md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card">{g.taches.map((tache) => ligne(tache, auBureau))}</ul>
            {i === 0 ? aideDuBalayage : null}
          </section>
        );
      })}
    </div>
  );

  const corps = liste.isPending ? (
    <div className="flex items-center justify-center py-10 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-label={t('chargement')} />
    </div>
  ) : liste.isError ? (
    <div className="px-4 py-6 md:px-0">
      <ErrorState message={t('echecChargement')} onRetry={() => void liste.refetch()} retryLabel={t('reessayer')} />
    </div>
  ) : lignes.length === 0 ? (
    <div className="px-4 py-6 md:px-0">
      <EmptyState icon={<ListTodo className="size-8" aria-hidden="true" />} title={t(`vide.${selection.mode === 'periodes' ? (selection.periodes.length === 1 ? selection.periodes[0] : 'plusieurs') : selection.mode}`)} />
    </div>
  ) : etat.grouper === 'rattachement' ? (
    parRattachement
  ) : (
    <div className="xl:grid xl:grid-cols-3 xl:items-start xl:gap-5">
      {[...groupes].map(([g, taches], i) => {
        const colonne = EN_COLONNES.includes(g);
        if (auBureau && EN_TABLEAU.includes(g)) {
          return (
            <section key={g} data-groupe={g} aria-label={t(`groupe.${g}`)} className="pt-8 xl:col-span-3 xl:pt-3">
              <Etiquette className="pb-3" compte={compteDe(g, taches.length)}>
                {t(`groupe.${g}`)}
              </Etiquette>
              {tableau(taches)}
            </section>
          );
        }
        return (
          <section
            key={g}
            data-groupe={g}
            aria-label={t(`groupe.${g}`)}
            className={cn('pt-5 xl:overflow-hidden xl:rounded-xl xl:border xl:border-border xl:bg-card xl:pt-0', !colonne && 'xl:col-span-3')}
          >
            <Etiquette className="px-4 pb-1 xl:hidden" compte={compteDe(g, taches.length)}>
              {t(`groupe.${g}`)}
            </Etiquette>
            {/* Au bureau, la tête de colonne de la maquette : le nom, le compte, « + ». */}
            <div aria-hidden="true" className={cn('flex items-center gap-2 border-b border-border py-1 pl-4 pr-1 max-xl:hidden', g === 'retard' && 'bg-destructive/6')}>
              <span className={cn('text-corps font-semibold', g === 'retard' && 'text-destructive')}>{t(`groupe.${g}`)}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{compteDe(g, taches.length)}</span>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setNouvelle(true)}
                className="ml-auto inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <ul className="divide-y divide-border">{taches.map((tache) => ligne(tache, enPanneau))}</ul>
            {i === 0 ? aideDuBalayage : null}
          </section>
        );
      })}
    </div>
  );

  return (
    <PagePleineLargeur data-slot="page-des-taches" className="max-md:pb-8">
      <DeclarerEnTete
        titre={t('titre')}
        action={<ActionDEnTete libelle={t('nouvelle.titreFeuille')} icone={<Plus className="size-5" aria-hidden />} onClick={() => setNouvelle(true)} primaire />}
      />
      <div className="max-md:hidden">
        <PageHeader
          title={t('titre')}
          description={sousTitre || undefined}
          actions={
            <>
              {interrupteurAMoi('inline-flex h-9 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm')}
              <Button onClick={() => setNouvelle(true)} className="gap-1.5">
                <Plus className="size-4" aria-hidden="true" />
                {t('nouvelle.titreFeuille')}
              </Button>
            </>
          }
        />
      </div>

      <div className="z-10 border-b border-border/70 bg-background max-md:sticky max-md:top-(--haut-colle) md:mt-5 md:border-0">
        <div className="md:flex md:items-center md:gap-2">
          <RangeeDePuces aria-label={t('pastilles.libelle')} className="md:min-w-0 md:flex-1 md:px-0">
            {PASTILLES.map((p) => (
              <PuceDeFiltre key={p} active={estActive(selection, p)} compte={p === 'all' ? undefined : comptes[p]} onClick={() => choisir(p)}>
                {t(`pastilles.${p}`)}
              </PuceDeFiltre>
            ))}
          </RangeeDePuces>
          {/* TCK-2857 (maquette e1, l. 726-727) — « Grouper par » et « Rattachée à », au bureau. */}
          {auBureau ? (
            <div className="flex flex-none items-center gap-2" data-slot="filtres-du-bureau">
              <Filtre
                id="taches-grouper"
                libelle={t('grouper.libelle')}
                valeur={etat.grouper}
                options={(['echeance', 'rattachement'] as const).map((v) => ({ value: v, label: t(`grouper.${v}`) }))}
                onChange={(v) => changer({ ...etat, grouper: v as Regroupement })}
              />
              <Filtre
                id="taches-rattachement"
                libelle={t('rattachement.libelle')}
                valeur={etat.rattachement}
                options={(['tout', 'customer', 'property'] as const).map((v) => ({ value: v, label: t(`rattachement.${v}`) }))}
                onChange={(v) => changer({ ...etat, rattachement: v as FiltreDeRattachement })}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="md:hidden">{interrupteurAMoi('flex h-12 cursor-pointer items-center gap-3 border-b border-border px-4 text-corps')}</div>

      {equipeVisible ? (
        <div className="flex items-center gap-3 px-4 pt-3 md:px-0">
          <label htmlFor="taches-assignee" className="text-sm text-muted-foreground">
            {t('equipe.libelle')}
          </label>
          <ChoixDansUneListe
            id="taches-assignee"
            className="w-auto min-w-44"
            valeur={etat.equipe ? String(etat.agent ?? 'equipe') : 'moi'}
            options={[{ value: 'moi', label: t('equipe.mesTaches') }, { value: 'equipe', label: t('equipe.toute') }, ...(membres.data ?? []).map((m) => ({ value: String(m.id), label: m.name }))]}
            onChange={(v) =>
              changer(v === 'moi' ? { ...etat, equipe: false, agent: null } : { ...etat, equipe: true, aMoi: false, agent: v === 'equipe' ? null : Number.parseInt(v, 10) })
            }
          />
        </div>
      ) : null}

      {erreur ? (
        <p role="alert" className="px-4 pt-3 text-sm text-destructive md:px-0">
          {erreur}
        </p>
      ) : null}

      <div className="xl:pt-6">{corps}</div>

      {liste.hasNextPage ? (
        <div className="flex justify-center px-4 pt-4">
          <Button type="button" variant="outline" disabled={liste.isFetchingNextPage} onClick={() => void liste.fetchNextPage()}>
            {t('voirPlus')}
          </Button>
        </div>
      ) : null}

      {aVenirReplie ? (
        <div className="px-4 pt-6 md:px-0">
          <button
            type="button"
            onClick={() => choisir('upcoming')}
            className="flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-corps outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring"
          >
            <span className="flex-1 text-left font-medium">{t('pastilles.upcoming')}</span>
            <span className="tabular-nums text-muted-foreground">{f.nombre(comptes.upcoming ?? 0)}</span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <Feuille
        panneau={enPanneau}
        open={ouverte !== null}
        onOpenChange={(o) => {
          if (!o) {
            setOuverte(null);
            setEnEdition(false);
          }
        }}
        titre={t('fiche.titreFeuille')}
        pied={ouverte ? <PiedDeFicheDeTache tache={ouverte} moi={moi} onModifiee={setOuverte} /> : null}
      >
        {ouverte ? (
          <FicheDeTache
            key={ouverte.id}
            tache={ouverte}
            maintenant={maintenant}
            moi={moi}
            membres={membres.data ?? []}
            onModifiee={setOuverte}
            onSupprimee={() => setOuverte(null)}
            enEdition={enEdition}
          />
        ) : null}
      </Feuille>

      <Feuille panneau={enPanneau} open={nouvelle} onOpenChange={setNouvelle} titre={t('nouvelle.titreFeuille')} pied={<EnvoiDeNouvelleTache etat={envoi} onAnnuler={() => setNouvelle(false)} />}>
        {nouvelle ? (
          <NouvelleTache
            maintenant={maintenant}
            moi={moi}
            nomDeMoi={nomDeMoi}
            membres={membres.data ?? []}
            rattachement={rattachement}
            onCreee={() => setNouvelle(false)}
            onEtat={setEnvoi}
          />
        ) : null}
      </Feuille>
    </PagePleineLargeur>
  );
}

/** TCK-2857 — un filtre de la tête du bureau : « Grouper par » [Échéance ▾]. */
function Filtre({
  id,
  libelle,
  valeur,
  options,
  onChange,
}: {
  readonly id: string;
  readonly libelle: string;
  readonly valeur: string;
  readonly options: readonly { value: string; label: string }[];
  readonly onChange: (v: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className="whitespace-nowrap text-sm text-muted-foreground">
        {libelle}
      </label>
      <ChoixDansUneListe id={id} className="w-auto min-w-32" valeur={valeur} options={options} onChange={onChange} />
    </span>
  );
}

/** La feuille du bas sous `xl`, le panneau droit dès `xl`. */
function Feuille({
  panneau,
  open,
  onOpenChange,
  titre,
  pied,
  children,
}: {
  readonly panneau: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly titre: string;
  readonly pied: ReactNode;
  readonly children: ReactNode;
}) {
  return panneau ? (
    <PanneauDroit open={open} onOpenChange={(o) => onOpenChange(o)} titre={titre} pied={pied}>
      {children}
    </PanneauDroit>
  ) : (
    <FeuilleDuBas open={open} onOpenChange={(o) => onOpenChange(o)} titre={titre} pied={pied}>
      {children}
    </FeuilleDuBas>
  );
}
