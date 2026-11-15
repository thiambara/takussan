'use client';

import { useEffect, useEffectEvent, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useTranslations } from 'next-intl';
import { GripVertical } from 'lucide-react';

import { versLaColonneVoisine } from '@/components/pipeline/etapes/clavier';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Skeleton } from '@/components/ui/skeleton';
import { issueDuDepot } from '@/lib/maintenance/depot';
import { FILES_DE_L_AGENCE, type FileDeLAgence, type InterventionEnFile, type ResumeDesFiles } from '@/lib/maintenance/files';
import { useMaintenanceRequest } from '@/lib/queries/maintenance';
import { useFileDInterventions, type FiltresDesFiles } from '@/lib/queries/maintenance-files';
import { cn } from '@/lib/utils';

import { ChoixDuPrestataire, useChoixDuPrestataire } from '../fiche/ChoixDuPrestataire';
import { CarteDeColonne, lienDeLaFiche } from './CartesDIntervention';

/**
 * TCK-2918 (e0) — le kanban du bureau qu'on manipule (maquette `app-interventions` a, « Agence — files »,
 * bureau) : une poignée sur chaque carte, au pied de chaque colonne la zone « Déposez une carte ici »
 * (« Glissez une carte vers « En cours » pour choisir un prestataire » sous « À dispatcher »).
 *
 * Le dépôt n'invente aucune transition (`issueDuDepot`) : déposer une carte « À dispatcher » ou « En
 * retard » dans « En cours » ouvre le choix du prestataire — le même que « Choisir » de la fiche, sur la
 * fiche de la demande (`can_assign` n'est servi qu'au détail) ; confirmer envoie l'assignation, et la
 * carte change de colonne quand les files se relisent ; annuler la laisse où elle est. Tout autre dépôt
 * est refusé, dit en clair, sans requête.
 *
 * Au pointeur comme au clavier, par la poignée seule (la carte est un lien étiré) : Espace ou Entrée la
 * saisit, ← → la portent d'une colonne à l'autre (`versLaColonneVoisine`, celui du pipeline), Espace ou
 * Entrée la repose, Échap annule ; chaque étape est annoncée aux lecteurs d'écran.
 */
interface Props {
  readonly filtres: FiltresDesFiles;
  readonly comptes: ResumeDesFiles | null;
  readonly parPage: (f: FileDeLAgence) => number;
  readonly voirPlus: (f: FileDeLAgence, total: number) => void;
  readonly maintenant: Date;
}

interface DonneesDeCarte {
  readonly carte: InterventionEnFile;
  readonly file: FileDeLAgence;
}

/** Le refus s'efface seul, comme les pannes du pipeline. */
const DUREE_DU_REFUS_MS = 5000;

export function KanbanDesFiles({ filtres, comptes, parPage, voirPlus, maintenant }: Props) {
  const t = useTranslations('maintenance.files');
  const tK = useTranslations('maintenance.files.kanban');
  const [enVol, setEnVol] = useState<DonneesDeCarte | null>(null);
  const [aConfier, setAConfier] = useState<InterventionEnFile | null>(null);
  const [refus, setRefus] = useState<string | null>(null);

  const effacer = useEffectEvent(() => setRefus(null));
  useEffect(() => {
    if (!refus) return;
    const id = setTimeout(effacer, DUREE_DU_REFUS_MS);
    return () => clearTimeout(id);
  }, [refus]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: versLaColonneVoisine }),
  );

  const nomDeFile = (id: unknown) => ((FILES_DE_L_AGENCE as readonly unknown[]).includes(id) ? t(`noms.${id as FileDeLAgence}`) : '');
  const titreDe = (data: unknown) => (data as DonneesDeCarte | undefined)?.carte.title ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active }) => tK('annonces.saisie', { titre: titreDe(active.data.current) }),
    onDragOver: ({ active, over }) =>
      over ? tK('annonces.survol', { titre: titreDe(active.data.current), file: nomDeFile(over.id) }) : tK('annonces.horsDesFiles', { titre: titreDe(active.data.current) }),
    onDragEnd: ({ active, over }) =>
      over ? tK('annonces.lachee', { titre: titreDe(active.data.current), file: nomDeFile(over.id) }) : tK('annonces.horsDesFiles', { titre: titreDe(active.data.current) }),
    onDragCancel: ({ active }) => tK('annonces.annulee', { titre: titreDe(active.data.current) }),
  };

  const onDragStart = (e: DragStartEvent) => {
    setRefus(null);
    setEnVol((e.active.data.current as DonneesDeCarte | undefined) ?? null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setEnVol(null);
    const donnees = e.active.data.current as DonneesDeCarte | undefined;
    if (!donnees) return;
    const cible = e.over && (FILES_DE_L_AGENCE as readonly unknown[]).includes(e.over.id) ? (e.over.id as FileDeLAgence) : null;
    const issue = issueDuDepot(donnees.file, cible);
    if (issue === 'choisir') setAConfier(donnees.carte);
    else if (issue === 'refus' && cible) setRefus(tK('refus', { titre: donnees.carte.title, file: t(`noms.${cible}`) }));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setEnVol(null)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: tK('instructions') } }}
    >
      <div className="grid min-w-[calc(var(--spacing)*244.44)] grid-cols-5 gap-3 xl:min-w-0">
        {FILES_DE_L_AGENCE.map((f) => (
          <Colonne key={f} file={f} filtres={filtres} compte={comptes?.[f]} parPage={parPage(f)} voirPlus={voirPlus} maintenant={maintenant} />
        ))}
      </div>
      <DragOverlay>
        {enVol ? (
          <div className="translate-x-4 rotate-2 rounded-lg border border-primary bg-card p-3 text-sm leading-snug font-semibold shadow-xl">{enVol.carte.title}</div>
        ) : null}
      </DragOverlay>
      {refus ? (
        <div role="alert" data-slot="depot-refuse" className="fixed right-24 bottom-4 z-50 max-w-sm rounded-lg border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive shadow-lg">
          {refus}
        </div>
      ) : null}
      <ConfierAuDepot carte={aConfier} maintenant={maintenant} onFermer={() => setAConfier(null)} />
    </DndContext>
  );
}

interface ColonneProps {
  readonly file: FileDeLAgence;
  readonly filtres: FiltresDesFiles;
  readonly compte: number | undefined;
  readonly parPage: number;
  readonly voirPlus: (f: FileDeLAgence, total: number) => void;
  readonly maintenant: Date;
}

function Colonne({ file, filtres, compte, parPage, voirPlus, maintenant }: ColonneProps) {
  const t = useTranslations('maintenance.files');
  const tK = useTranslations('maintenance.files.kanban');
  const lu = useFileDInterventions(file, filtres, parPage);
  const { setNodeRef, isOver } = useDroppable({ id: file });
  const lignes = lu.data?.data ?? [];
  const total = lu.data?.meta.total ?? compte ?? 0;
  const autres = total - lignes.length;
  return (
    <section
      ref={setNodeRef}
      data-file={file}
      aria-labelledby={`colonne-${file}`}
      className={cn('min-w-0 rounded-xl p-2 transition-[box-shadow] duration-150', file === 'en_retard' ? 'bg-destructive/6' : 'bg-muted/50', isOver && 'ring-2 ring-primary/50')}
    >
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
        ) : (
          lignes.map((i) => <CarteGlissable key={i.id} i={i} file={file} maintenant={maintenant} />)
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
        {/* Le pied de la colonne (maquette) : la zone de dépôt, qui dit aussi la file vide. */}
        <p data-slot="zone-de-depot" className={cn('rounded-lg border border-dashed px-2 py-3 text-center text-xs text-muted-foreground', isOver ? 'border-primary/60 bg-card' : 'border-border')}>
          {file === 'a_dispatcher' ? tK('glissez') : tK('deposez')}
        </p>
      </div>
    </section>
  );
}

function CarteGlissable({ i, file, maintenant }: { readonly i: InterventionEnFile; readonly file: FileDeLAgence; readonly maintenant: Date }) {
  const tK = useTranslations('maintenance.files.kanban');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: i.id, data: { carte: i, file } satisfies DonneesDeCarte });
  const style: CSSProperties = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {};
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'opacity-40')} data-slot="carte-glissable">
      <CarteDeColonne
        i={i}
        maintenant={maintenant}
        poignee={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={tK('saisir', { titre: i.title })}
            data-slot="poignee"
            className="flex cursor-grab touch-none rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}

/**
 * Le choix du prestataire ouvert par un dépôt dans « En cours » : la fiche de la demande d'abord
 * (`abilities.can_assign` n'est servi qu'au détail) ; sans ce droit, la feuille le dit et renvoie à la
 * fiche. Fermer la feuille sans envoyer laisse la carte dans sa colonne.
 */
function ConfierAuDepot({ carte, maintenant, onFermer }: { readonly carte: InterventionEnFile | null; readonly maintenant: Date; readonly onFermer: () => void }) {
  const tK = useTranslations('maintenance.files.kanban');
  return (
    <FeuilleDuBas open={carte !== null} onOpenChange={(o) => (o ? undefined : onFermer())} titre={carte ? tK('confier.titre', { titre: carte.title }) : ''}>
      {carte ? <ChoixAuDepot key={carte.id} id={carte.id} maintenant={maintenant} onEnvoye={onFermer} /> : null}
    </FeuilleDuBas>
  );
}

function ChoixAuDepot({ id, maintenant, onEnvoye }: { readonly id: number; readonly maintenant: Date; readonly onEnvoye: () => void }) {
  const tK = useTranslations('maintenance.files.kanban');
  const fiche = useMaintenanceRequest(id);
  const d = (fiche.data?.data ?? null) as InterventionEnFile | null;
  if (fiche.isPending) return <Skeleton className="h-64 rounded-xl" />;
  if (!d) return <p className="text-sm text-destructive">{tK('confier.erreur')}</p>;
  if (d.abilities?.can_assign !== true) {
    return (
      <p className="text-sm text-muted-foreground">
        {tK('confier.interdit')}{' '}
        <Link href={lienDeLaFiche(d.id)} className="font-medium text-primary-deep underline-offset-2 hover:underline">
          {tK('confier.voirLaFiche')}
        </Link>
      </p>
    );
  }
  return <Choix request={d} maintenant={maintenant} onEnvoye={onEnvoye} />;
}

function Choix({ request, maintenant, onEnvoye }: { readonly request: InterventionEnFile; readonly maintenant: Date; readonly onEnvoye: () => void }) {
  const t = useTranslations('maintenance.fiche.choix');
  const etat = useChoixDuPrestataire(request, maintenant, onEnvoye);
  return (
    <div className="[&>section]:border-0 [&>section]:p-0">
      <ChoixDuPrestataire request={request} etat={etat} maintenant={maintenant} titre={t('titre')} />
    </div>
  );
}
