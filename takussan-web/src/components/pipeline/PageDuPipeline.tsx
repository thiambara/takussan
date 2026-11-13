'use client';

import dynamic from 'next/dynamic';
import { useEffect, useEffectEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { type CrmTagOption } from '@/components/customer-dashboard/CustomerListFilters';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { ETAPES_VIVANTES, type EtapeVivante, type LecteurDuPipeline, type PorteeDuPipeline, lirePipeline, porteeEnUrl } from '@/lib/crm/pipeline';
import { initiales } from '@/lib/fiche-publique';
import { fetchAgencyAgents } from '@/lib/queries/agent-crm';
import { type CanalDeContactClient, useEnregistrerContactClient } from '@/lib/queries/customer-gestures';
import { updateTask } from '@/lib/queries/pipeline';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import { BarreDuPipeline, IndicateursDuPipeline, SegmentsDuPipeline } from './bureau/BarreDuPipeline';
import { ListeDuBureau } from './bureau/ListeDuBureau';
import { KanbanDuPipeline } from './etapes/KanbanDuPipeline';
import { useLecteurDuProspect } from './lecture';
import { MotifDuPipeline } from './MotifDuPipeline';
import { EtapesDuTelephone } from './telephone/EtapesDuTelephone';
import { ETAPE_SUIVANTE, RelancesDuTelephone } from './telephone/RelancesDuTelephone';
import { TeteDuTelephone } from './telephone/TeteDuTelephone';
import { useChangementDEtape, useColonnesDuPipeline, useListeDuPipeline, usePlusTard, useStatsDuPipeline } from './usePipeline';

/** TCK-1038 (P70.01) — la création courte n'entre dans le JS de la page qu'à sa première ouverture. */
const CreationDuClient = dynamic(() => import('@/components/customer-form/creation/CreationDuClient').then((m) => m.CreationDuClient));

export interface PageDuPipelineProps {
  readonly lecteur: LecteurDuPipeline;
  /** Le nom du lecteur (initiales de « Moi »). */
  readonly moi: string;
  readonly agence: { readonly id: number; readonly nom: string | null } | null;
  readonly crmTags: readonly CrmTagOption[];
}

/**
 * TCK-2592 — le pipeline (maquette `app-pipeline` a, « Relances d'abord, kanban en vue »).
 *
 *  · Téléphone (sous `lg`) : « Mes prospects », la bascule Liste | Étapes et la portée, le portefeuille ;
 *    Liste : « À relancer » triée par retard, « À jour » repliée ; Étapes : l'étape choisie, carte par carte.
 *  · Bureau (dès `lg`) : Liste — segments À relancer / À jour / Tous, filtres, le tableau trié par retard ;
 *    Étapes — quatre indicateurs cliquables, filtres, quatre colonnes vivantes et Gagné / Perdu en bandeaux.
 *
 * Tout l'état vit dans l'URL (`lib/crm/pipeline`) ; la page serveur fournit le lecteur. L'agent ouvre
 * sur « Moi », l'admin sur « Agence ».
 */
export function PageDuPipeline({ lecteur, moi, agence, crmTags }: PageDuPipelineProps) {
  const t = useTranslations('crm.pipeline');
  const tPage = useTranslations('dashboard.pages.customers');
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { params, remplacer } = useVueDansLUrl();
  const etat = lirePipeline(Object.fromEntries(params.entries()), lecteur);
  const maintenant = useMinuteCourante();
  const lire = useLecteurDuProspect(maintenant);
  const stats = useStatsDuPipeline(etat);
  const etapes = useChangementDEtape();
  const plusTard = usePlusTard();
  const [creer, setCreer] = useState(false);
  const [creationMontee, setCreationMontee] = useState(false);
  if (creer && !creationMontee) setCreationMontee(true);
  const [alerte, setAlerte] = useState<string | null>(null);
  const tGestes = useTranslations('crm.list.gestes');
  const enregistrement = useEnregistrerContactClient();
  // Le geste part quoi qu'il arrive (le lien tel: ou WhatsApp est déjà suivi) ; un refus de l'API ne
  // retient pas l'appel, il se dit en alerte, comme dans la liste des clients (P228.06).
  const noter = lecteur.personnel
    ? (id: number) => (channel: CanalDeContactClient) => enregistrement.mutate({ id, channel }, { onError: () => setAlerte(tGestes('nonNote')) })
    : undefined;

  // Les agents de l'agence, pour isoler l'un d'eux (lecture de l'agence seulement ; un 403 laisse Moi et Agence).
  const agents = useQuery({
    queryKey: ['crm-pipeline-agents', agence?.id],
    queryFn: () => fetchAgencyAgents(token as string, agence?.id as number),
    enabled: !!token && lecteur.agence && agence !== null,
    staleTime: 5 * 60_000,
  });

  const portees: { readonly portee: PorteeDuPipeline; readonly libelle: string }[] | null = etat.portee
    ? [
        { portee: { type: 'moi' }, libelle: t('portee.moi') },
        ...(lecteur.agence
          ? [{ portee: { type: 'agence' } as const, libelle: t('portee.agence') }, ...(agents.data ?? []).map((a) => ({ portee: { type: 'agent', id: a.id } as const, libelle: a.name }))]
          : []),
      ]
    : null;
  const p = etat.portee;
  const nomDeLAgent = p?.type === 'agent' ? (agents.data?.find((a) => a.id === p.id)?.name ?? `#${p.id}`) : null;
  const porteeLibelle = p === null ? null : p.type === 'moi' ? t('portee.moi') : p.type === 'agence' ? t('portee.agence') : nomDeLAgent;
  const porteeInitiales = p === null || p.type === 'agence' ? null : initiales(p.type === 'moi' ? moi : (nomDeLAgent ?? ''));
  const titre = p?.type === 'moi' ? t('titre.moi') : t('titre.agence');
  const porteeDuSousTitre = p === null ? null : p.type === 'agence' ? t('sousTitre.agence') : p.type === 'moi' ? t('sousTitre.moi') : nomDeLAgent;

  const poser = (cle: string, valeur: string | null) => remplacer({ [cle]: valeur });
  const choisirPortee = (x: PorteeDuPipeline) => remplacer({ portee: porteeEnUrl(x, lecteur) });

  // Les lectures : les colonnes vivantes (bureau Étapes, téléphone Étapes), les listes (relances, Liste).
  const listeDuTelephone = useListeDuPipeline(etat, 'a-relancer', { actif: lecteur.personnel });
  const aJour = useListeDuPipeline(etat, lecteur.personnel ? 'a-jour' : 'tous');
  const listeDuBureau = useListeDuPipeline(etat, etat.segment);
  const compteRelancer = useListeDuPipeline(etat, 'a-relancer', { parPage: 1, actif: lecteur.personnel });
  const compteAJour = useListeDuPipeline(etat, 'a-jour', { parPage: 1, actif: lecteur.personnel });
  const compteTous = useListeDuPipeline(etat, 'tous', { parPage: 1 });
  const etapeDuTelephone: EtapeVivante = etat.etape ?? 'lead';
  const sectionsDuTelephone: readonly CustomerPipelineStage[] = etat.sorties ? ['converted', 'lost'] : [etapeDuTelephone];
  const colonnesDuTelephone = useColonnesDuPipeline(etat, sectionsDuTelephone);

  const actifs = ETAPES_VIVANTES.reduce((s, e) => s + (stats.data?.stage_counts?.[e] ?? 0), 0);

  const dire = (texte: string | null) => setAlerte(texte);
  // Les pannes hors dialogue — un changement d'étape, un « Charger plus » — se disent en alerte, une à la
  // fois, lues là où elles sont tenues ; l'alerte s'efface seule après 4 s, avec la panne qu'elle disait.
  const pannes = [etapes, colonnesDuTelephone, listeDuTelephone, aJour, listeDuBureau] as const;
  const message = alerte ?? pannes.find((x) => x.erreur)?.erreur ?? null;
  const effacer = useEffectEvent(() => {
    setAlerte(null);
    for (const x of pannes) x.effacerErreur();
  });
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(effacer, 4000);
    return () => clearTimeout(id);
  }, [message]);

  const plusTardSur = (x: PipelineCustomerCard) =>
    plusTard.mutate(x, {
      onError: (err) => dire(err.status === 409 ? t('suggestion.ecartee') : t('errors.moveFailed')),
    });

  const etapeSuivante = (x: PipelineCustomerCard) => {
    const to = ETAPE_SUIVANTE[x.pipeline_stage];
    if (to) etapes.changer(x, to);
  };
  // « Reporter » : la tâche en retard passe à demain, 9 h (Dakar, UTC) ; rien d'autre ne se reporte.
  const peutReporter = (x: PipelineCustomerCard) => x.follow_up?.reason === 'overdue_task' && x.next_action?.type === 'task' && x.next_action.overdue;
  const reporter = async (x: PipelineCustomerCard) => {
    if (!token || !peutReporter(x) || !x.next_action) return;
    const demain = new Date(Date.parse(`${jourADakar(maintenant)}T09:00:00Z`) + 86_400_000).toISOString();
    try {
      await updateTask(token, x.next_action.id, { due_at: demain });
      void queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY.root() });
    } catch {
      dire(t('errors.moveFailed'));
    }
  };

  const ouvrirSorties = (ouvert: boolean) => remplacer({ sorties: ouvert ? '1' : null });
  const deplies = etat.sorties ? (['converted', 'lost'] as const) : ([] as const);

  const basculeDuBureau = (
    <div role="group" aria-label={t('vue.aria')} className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {(['liste', 'etapes'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={etat.vue === v}
          onClick={() => poser('vue', v === (lecteur.personnel ? 'liste' : 'etapes') ? null : v)}
          className={cn('inline-flex h-7 items-center rounded-md px-2.5 text-ui font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring', etat.vue === v ? 'bg-card text-foreground shadow-actif' : 'text-muted-foreground hover:text-foreground')}
        >
          {t(`vue.${v}`)}
        </button>
      ))}
    </div>
  );

  const ajouter = lecteur.personnel ? (
    <button type="button" onClick={() => setCreer(true)} className={buttonVariants()}>
      <Plus className="size-4" aria-hidden="true" />
      {tPage('add')}
    </button>
  ) : null;

  const sousTitre = [agence?.nom, porteeDuSousTitre].filter(Boolean);
  const description =
    etat.vue === 'etapes'
      ? t('sousTitre.etapes', { portee: sousTitre.join(' · ') })
      : t('sousTitre.liste', { portee: sousTitre.join(' · '), actifs, relancer: compteRelancer.total ?? 0 });

  return (
    <div data-slot="page-du-pipeline">
      {/* L'en-tête du téléphone ne porte que le titre (maquette a-0/a-1 : recherche et cloche de la coque) ;
          « Ajouter un client » vit au bureau, et sur la liste des clients au téléphone. */}
      <DeclarerEnTete titre={titre} />

      {/* ─────────── Téléphone (sous lg) ─────────── */}
      <div className="-mx-4 -mt-6 pb-6 md:-mx-6 md:-mt-8 lg:hidden" data-slot="pipeline-telephone">
        <TeteDuTelephone
          etat={etat}
          stats={stats.data}
          basculer={(v) => poser('vue', v === (lecteur.personnel ? 'liste' : 'etapes') ? null : v)}
          portees={portees}
          porteeLibelle={porteeLibelle}
          porteeInitiales={porteeInitiales}
          choisirPortee={choisirPortee}
          choisirEtape={(e) => remplacer({ etape: e, sorties: null })}
          ouvrirSorties={() => remplacer({ vue: etat.vue === 'etapes' && !lecteur.personnel ? null : 'etapes', sorties: '1' })}
          etapeActive={etat.vue === 'etapes' ? (etat.sorties ? null : etapeDuTelephone) : etat.etape}
        />
        {etat.vue === 'liste' ? (
          <RelancesDuTelephone
            personnel={lecteur.personnel}
            relances={{ lignes: listeDuTelephone.lignes, total: listeDuTelephone.total, isLoading: !!token && listeDuTelephone.isPending, isError: listeDuTelephone.isError, onRetry: () => void listeDuTelephone.refetch(), onLoadMore: () => void listeDuTelephone.chargerPlus(), isLoadingMore: listeDuTelephone.chargeant }}
            aJour={{ lignes: aJour.lignes, total: aJour.total, onLoadMore: () => void aJour.chargerPlus(), isLoadingMore: aJour.chargeant }}
            lire={lire}
            noter={noter}
            onEtapeSuivante={etapeSuivante}
            onReporter={(x) => void reporter(x)}
            peutReporter={peutReporter}
          />
        ) : (
          <EtapesDuTelephone
            sections={sectionsDuTelephone.map((s) => ({
              stage: s,
              cartes: colonnesDuTelephone.cartes(s),
              total: stats.data?.stage_counts?.[s],
              mediane: etat.sorties ? undefined : stats.data?.median_days_in_stage?.[s],
              ...colonnesDuTelephone.etatDe(s),
              onLoadMore: () => void colonnesDuTelephone.chargerPlus(s),
              isLoadingMore: colonnesDuTelephone.chargeant === s,
            }))}
            lire={lire}
            noter={noter}
            changer={etapes.changer}
            plusTard={plusTardSur}
          />
        )}
      </div>

      {/* ─────────── Bureau (dès lg) ─────────── */}
      <div className={cn('hidden lg:flex lg:flex-col', etat.vue === 'etapes' && 'lg:-my-8 lg:h-dvh lg:py-8')} data-slot="pipeline-bureau">
        <PageHeader
          title={titre}
          description={description}
          actions={
            <>
              {basculeDuBureau}
              {ajouter}
            </>
          }
          dessous={
            etat.vue === 'etapes' ? (
              <div className="space-y-4">
                <IndicateursDuPipeline
                  stats={stats.data}
                  onActifs={() => remplacer({ relance: null, sorties: null })}
                  onPassages={() => remplacer({ vue: null, segment: null, relance: null })}
                  onConversion={() => ouvrirSorties(!etat.sorties)}
                  onMediane={() => remplacer({ sorties: null })}
                  sortiesOuvertes={etat.sorties}
                />
                <BarreDuPipeline etat={etat} vue="etapes" portees={portees} porteeLibelle={porteeLibelle} choisirPortee={choisirPortee} crmTags={crmTags} poser={poser} />
              </div>
            ) : (
              <BarreDuPipeline
                etat={etat}
                vue="liste"
                portees={portees}
                porteeLibelle={porteeLibelle}
                choisirPortee={choisirPortee}
                crmTags={crmTags}
                poser={poser}
                segments={
                  lecteur.personnel ? (
                    <SegmentsDuPipeline actif={etat.segment} comptes={{ 'a-relancer': compteRelancer.total, 'a-jour': compteAJour.total, tous: compteTous.total }} choisir={(s) => poser('segment', s === 'tous' ? null : s)} />
                  ) : null
                }
              />
            )
          }
        />
        <div className={cn('mt-6', etat.vue === 'etapes' && 'flex min-h-[calc(var(--spacing)*120)] flex-1 flex-col')}>
          {etat.vue === 'etapes' ? (
            <KanbanDuPipeline etat={etat} stats={stats.data} lire={lire} changer={etapes.changer} plusTard={plusTardSur} noter={noter} deplies={deplies} onDeplier={(_s, o) => ouvrirSorties(o)} />
          ) : (
            <ListeDuBureau
              lignes={listeDuBureau.lignes}
              total={listeDuBureau.total}
              isLoading={!!token && listeDuBureau.isPending}
              isError={listeDuBureau.isError}
              onRetry={() => void listeDuBureau.refetch()}
              onLoadMore={() => void listeDuBureau.chargerPlus()}
              isLoadingMore={listeDuBureau.chargeant}
              lire={lire}
              changer={etapes.changer}
              noter={noter}
            />
          )}
        </div>
      </div>

      <MotifDuPipeline
        motif={etapes.motif}
        lecture={etapes.motif ? lire(etapes.motif.prospect) : null}
        onAnnuler={etapes.annulerMotif}
        onEnregistrer={etapes.enregistrerMotif}
        erreur={etapes.erreurDuMotif}
        enCours={etapes.enCours}
      />

      {message ? (
        <div role="alert" className="fixed inset-x-4 bottom-[var(--floating-dock-base)] z-50 rounded-lg border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive shadow-lg sm:left-auto sm:right-24 sm:max-w-sm md:bottom-4">
          {message}
        </div>
      ) : null}

      {lecteur.personnel && creationMontee ? <CreationDuClient open={creer} onClose={() => setCreer(false)} /> : null}
    </div>
  );
}
