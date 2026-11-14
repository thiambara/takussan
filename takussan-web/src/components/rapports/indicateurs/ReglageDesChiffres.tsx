'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createKpiConfigAction, deleteKpiConfigAction, updateKpiConfigAction } from '@/app/actions/kpis';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { PuceDeFiltre } from '@/components/ui/puce-de-filtre';
import { Switch } from '@/components/ui/switch';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { KpiConfig } from '@/lib/queries/kpis';
import { deplacer, ecrituresDuReglage, formatParDefaut, inverse, ordonner, type ChiffreRegle, type Ecriture } from '@/lib/rapports/indicateurs';
import { cn } from '@/lib/utils';

const FORMATS = ['number', 'currency', 'percent'] as const;

/** Les métriques du catalogue de l'API (`KpiConfig::METRICS`) qui ont un libellé. */
const METRIQUES_NOMMEES = new Set([
  'properties_total', 'properties_rented', 'properties_available', 'leases_active',
  'customers_count', 'members_count', 'bookings_pending', 'maintenance_open', 'revenue_month',
  'commission_month', 'overdue_count', 'overdue_amount', 'unpaid_rate_percent',
  'occupancy_rate_percent',
]);

interface ReglageProps {
  readonly configs: readonly KpiConfig[];
  readonly catalog: readonly string[];
  /** L'aperçu de la valeur de chaque métrique (`apercusDuResume`) ; absent : pas d'aperçu. */
  readonly apercus?: Readonly<Record<string, number | null>>;
}

/** Écrire une liste d'écritures ; en cas d'échec d'UNE, rendre aux autres ce qu'elles étaient. */
async function ecrire(ecritures: readonly Ecriture[], avant: readonly ChiffreRegle[]): Promise<boolean> {
  const envoyer = ({ id, ...corps }: Ecriture) => updateKpiConfigAction(id, corps);
  const resultats = await Promise.all(ecritures.map(envoyer));
  if (resultats.every((r) => r.ok)) return true;
  await Promise.all(ecritures.filter((_, i) => resultats[i]!.ok).map((e) => envoyer(inverse(e, avant))));
  return false;
}

/**
 * TCK-2629 — le réglage des chiffres de la vue d'ensemble (maquette `app-rapports`, « Personnaliser les
 * chiffres ») : une poignée pour ordonner (glisser, ou « Monter / Descendre » au clavier), un interrupteur
 * pour masquer, l'aperçu de la valeur, la suppression, et « Ajouter un chiffre » (métrique, libellé,
 * format).
 *
 * Ajouter et supprimer s'écrivent tout de suite (`POST`, `DELETE`), comme sur l'ancienne page. L'ordre et
 * le masquage s'écrivent à « Terminé » : `PATCH kpi-configs/{id}` pour les seules lignes changées
 * (`ecrituresDuReglage`). Un échec rend l'ordre d'avant — à l'écran ET à l'API, les écritures déjà passées
 * sont défaites — et le dit.
 */
export function useReglageDesChiffres({ configs }: Pick<ReglageProps, 'configs'>) {
  const router = useRouter();
  const [enregistres, setEnregistres] = useState<ChiffreRegle[]>(() => ordonner(configs));
  const [lignes, setLignes] = useState<ChiffreRegle[]>(enregistres);
  const [echec, setEchec] = useState(false);
  const [isPending, startTransition] = useTransition();

  const terminer = (apres: () => void) => {
    const ecritures = ecrituresDuReglage(enregistres, lignes);
    setEchec(false);
    if (ecritures.length === 0) {
      apres();
      return;
    }
    startTransition(async () => {
      const ok = await ecrire(ecritures, enregistres);
      if (!ok) {
        setLignes(enregistres);
        setEchec(true);
        return;
      }
      const suivants = lignes.map((c, rang) => ({ ...c, sort_order: rang }));
      setEnregistres(suivants);
      setLignes(suivants);
      router.refresh();
      apres();
    });
  };

  return {
    lignes,
    setLignes,
    echec,
    isPending,
    terminer,
    annuler: () => {
      setLignes(enregistres);
      setEchec(false);
    },
    /** Après un ajout ou une suppression (écrits tout de suite) : les deux états suivent. */
    ajoutee: (c: KpiConfig) => {
      setEnregistres((e) => [...e, c]);
      setLignes((l) => [...l, c]);
      router.refresh();
    },
    supprimee: (id: number) => {
      setEnregistres((e) => e.filter((c) => c.id !== id));
      setLignes((l) => l.filter((c) => c.id !== id));
      router.refresh();
    },
  };
}

type Reglage = ReturnType<typeof useReglageDesChiffres>;

/** Le corps du réglage : affichés, puis « À ajouter ». */
export function ListeDuReglage({ reglage, catalog, apercus }: { readonly reglage: Reglage } & Omit<ReglageProps, 'configs'>) {
  const t = useTranslations('rapports.reglage');
  const tK = useTranslations('dashboard.kpis');
  const f = useFormatteurs();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [ajout, setAjout] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const { lignes, setLignes } = reglage;

  const libelleMetrique = (code: string) => (METRIQUES_NOMMEES.has(code) ? tK(`metrics.${code}`) : code);
  const apercu = (metric: string, format: KpiConfig['format']) => {
    const v = apercus?.[metric];
    if (apercus === undefined || v === undefined) return null;
    if (v === null) return '—';
    return format === 'currency' ? f.montantAbrege(v, 'XOF') : format === 'percent' ? f.pourcentage(v / 100, { maximumFractionDigits: 1 }) : f.nombre(v);
  };
  const affiches = lignes.filter((c) => c.is_enabled).length;
  const configurees = new Set(lignes.map((c) => c.metric));
  const aAjouter = catalog.filter((m) => !configurees.has(m));

  const surFin = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    setLignes((l) => deplacer(l, l.findIndex((c) => c.id === active.id), l.findIndex((c) => c.id === over.id)));
  };

  const supprimer = (c: ChiffreRegle) => {
    setErreur(null);
    startTransition(async () => {
      const res = await deleteKpiConfigAction(c.id);
      if (res.ok) reglage.supprimee(c.id);
      else setErreur(t('suppressionEchec'));
    });
  };

  return (
    <div data-slot="reglage-des-chiffres">
      <p className="text-ui font-semibold text-muted-foreground">{t('affiches', { n: affiches, total: lignes.length })}</p>
      {lignes.length === 0 ? (
        <p className="mt-2 rounded-xl border border-border p-4 text-sm text-pretty text-muted-foreground" data-testid="reglage-vide">
          {t('vide')}
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={surFin}>
          <ol className="mt-2 divide-y divide-border rounded-xl border border-border" aria-label={t('ordreAria')}>
            {lignes.map((c, i) => (
              <LigneDuReglage
                key={c.id}
                chiffre={c}
                rang={i}
                total={lignes.length}
                apercu={apercu(c.metric, c.format)}
                metrique={libelleMetrique(c.metric)}
                enCours={isPending || reglage.isPending}
                onDeplacer={(a) => setLignes((l) => deplacer(l, i, a))}
                onBasculer={(on) => setLignes((l) => l.map((x) => (x.id === c.id ? { ...x, is_enabled: on } : x)))}
                onSupprimer={() => supprimer(c)}
              />
            ))}
          </ol>
        </DndContext>
      )}
      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      {aAjouter.length > 0 ? (
        <>
          <p className="mt-5 text-ui font-semibold text-muted-foreground">{t('aAjouter')}</p>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {aAjouter.map((m) => (
              <li key={m}>
                <div className="flex min-h-12 items-center gap-2 pr-1 pl-4">
                  <span className="min-w-0 flex-1 truncate text-corps">{libelleMetrique(m)}</span>
                  <span className="flex-none text-sm tabular-nums text-muted-foreground">{apercu(m, formatParDefaut(m))}</span>
                  <button
                    type="button"
                    aria-label={t('ajouterAria', { metrique: libelleMetrique(m) })}
                    aria-expanded={ajout === m}
                    onClick={() => setAjout((a) => (a === m ? null : m))}
                    className="inline-flex size-11 flex-none items-center justify-center rounded-md text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <Plus className="size-5" aria-hidden="true" />
                  </button>
                </div>
                {ajout === m ? (
                  <AjoutDUnChiffre
                    metric={m}
                    libelleParDefaut={libelleMetrique(m)}
                    onAjoute={(c) => {
                      reglage.ajoutee(c);
                      setAjout(null);
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-3 text-xs text-pretty text-muted-foreground">{t('aide')}</p>
      {reglage.echec ? (
        <p role="alert" className="mt-3 text-sm text-pretty text-destructive" data-testid="reglage-echec">
          {t('echec')}
        </p>
      ) : null}
    </div>
  );
}

function LigneDuReglage({
  chiffre,
  rang,
  total,
  apercu,
  metrique,
  enCours,
  onDeplacer,
  onBasculer,
  onSupprimer,
}: {
  readonly chiffre: ChiffreRegle;
  readonly rang: number;
  readonly total: number;
  readonly apercu: string | null;
  readonly metrique: string;
  readonly enCours: boolean;
  readonly onDeplacer: (a: number) => void;
  readonly onBasculer: (on: boolean) => void;
  readonly onSupprimer: () => void;
}) {
  const t = useTranslations('rapports.reglage');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: chiffre.id });
  const { setNodeRef: setDepotRef, isOver } = useDroppable({ id: chiffre.id });
  const style = transform ? { transform: `translate3d(0, ${transform.y}px, 0)` } : undefined;
  return (
    <li
      ref={setDepotRef}
      data-chiffre={chiffre.metric}
      className={cn('bg-card first:rounded-t-xl last:rounded-b-xl', isOver && 'bg-muted', isDragging && 'relative z-10 shadow-sm')}
    >
      <div ref={setNodeRef} style={style} className="flex min-h-12 items-center gap-1 pr-1 pl-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          onPointerDown={(e) => listeners?.onPointerDown?.(e)}
          onKeyDown={(e) => listeners?.onKeyDown?.(e)}
          aria-label={t('glisserAria', { libelle: chiffre.label })}
          className="inline-flex size-11 flex-none cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <span className="min-w-0 flex-1 leading-tight">
          <span className={cn('block truncate text-corps font-medium', !chiffre.is_enabled && 'text-muted-foreground')}>{chiffre.label}</span>
          {chiffre.label !== metrique ? <span className="block truncate text-xs text-muted-foreground">{metrique}</span> : null}
        </span>
        {apercu !== null ? <span className="flex-none text-sm tabular-nums text-muted-foreground" data-slot="apercu">{apercu}</span> : null}
        <button
          type="button"
          disabled={rang === 0 || enCours}
          onClick={() => onDeplacer(rang - 1)}
          aria-label={t('monterAria', { libelle: chiffre.label })}
          className="inline-flex size-11 flex-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-40 lg:size-9"
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={rang === total - 1 || enCours}
          onClick={() => onDeplacer(rang + 1)}
          aria-label={t('descendreAria', { libelle: chiffre.label })}
          className="inline-flex size-11 flex-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-40 lg:size-9"
        >
          <ArrowDown className="size-4" aria-hidden="true" />
        </button>
        <Switch
          checked={chiffre.is_enabled}
          onCheckedChange={(on) => onBasculer(on)}
          disabled={enCours}
          aria-label={t('afficherAria', { libelle: chiffre.label })}
          className="mx-1.5 flex-none"
        />
        <button
          type="button"
          disabled={enCours}
          onClick={onSupprimer}
          aria-label={t('supprimerAria', { libelle: chiffre.label })}
          className="inline-flex size-11 flex-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-40 lg:size-9"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** « Ajouter un chiffre » : la métrique choisie, son libellé et son format ; écrit tout de suite. */
function AjoutDUnChiffre({
  metric,
  libelleParDefaut,
  onAjoute,
}: {
  readonly metric: string;
  readonly libelleParDefaut: string;
  readonly onAjoute: (c: KpiConfig) => void;
}) {
  const t = useTranslations('rapports.reglage');
  const tK = useTranslations('dashboard.kpis');
  const id = useId();
  const [label, setLabel] = useState(libelleParDefaut);
  const [format, setFormat] = useState<KpiConfig['format']>(formatParDefaut(metric));
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ajouter = () => {
    if (!label.trim()) {
      setErreur(tK('validation'));
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const res = await createKpiConfigAction({ metric, label: label.trim(), format });
      if (!res.ok) {
        setErreur(res.message || tK('createError'));
        return;
      }
      onAjoute(res.data);
    });
  };

  return (
    <div className="space-y-3 border-t border-border bg-muted/40 p-3" data-slot="ajout-d-un-chiffre">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-libelle`}>{tK('label')}</Label>
        <Input id={`${id}-libelle`} value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div role="group" aria-labelledby={`${id}-format`}>
        <p id={`${id}-format`} className="mb-1.5 text-sm font-medium text-foreground">
          {tK('format')}
        </p>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((v) => (
            <PuceDeFiltre key={v} active={format === v} onClick={() => setFormat(v)}>
              {tK(`formats.${v}`)}
            </PuceDeFiltre>
          ))}
        </div>
      </div>
      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
      <Button type="button" onClick={ajouter} disabled={isPending} className="w-full">
        {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {t('ajouter')}
      </Button>
    </div>
  );
}

const REQUETE_DU_BUREAU = '(width >= 64rem)';

/**
 * « Personnaliser » de la vue d'ensemble : le réglage SUR LA PAGE, dans une feuille du bas au téléphone
 * (« Terminé ») et un panneau droit au bureau (« Annuler », « Enregistrer »), maquette `app-rapports`.
 */
export function PersonnaliserLesChiffres(props: ReglageProps) {
  const t = useTranslations('rapports.reglage');
  const tR = useTranslations('rapports');
  const bureau = useMatchesMedia(REQUETE_DU_BUREAU);
  const [ouvert, setOuvert] = useState(false);
  const reglage = useReglageDesChiffres(props);
  const fermer = () => setOuvert(false);
  const changer = (o: boolean) => {
    if (!o) reglage.annuler();
    setOuvert(o);
  };
  const enregistrer = (
    <Button type="button" className={cn(!bureau && 'h-11 w-full')} disabled={reglage.isPending} onClick={() => reglage.terminer(fermer)}>
      {reglage.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {bureau ? t('enregistrer') : t('termine')}
    </Button>
  );
  const corps = <ListeDuReglage reglage={reglage} catalog={props.catalog} apercus={props.apercus} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        {tR('personnaliser')}
      </button>
      {bureau ? (
        <PanneauDroit
          open={ouvert}
          onOpenChange={changer}
          titre={t('titre')}
          pied={
            <>
              <Button type="button" variant="outline" onClick={() => changer(false)}>
                {t('annuler')}
              </Button>
              {enregistrer}
            </>
          }
        >
          {corps}
        </PanneauDroit>
      ) : (
        <FeuilleDuBas open={ouvert} onOpenChange={changer} titre={t('titre')} pied={enregistrer}>
          {corps}
        </FeuilleDuBas>
      )}
    </>
  );
}

/** `/app/reports/indicators` (l'ancienne adresse des indicateurs) : le même réglage, posé sur la page. */
export function ReglageEnPage(props: ReglageProps) {
  const t = useTranslations('rapports.reglage');
  const reglage = useReglageDesChiffres(props);
  const [enregistre, setEnregistre] = useState(false);
  return (
    <div className="max-w-2xl space-y-4">
      <ListeDuReglage reglage={reglage} catalog={props.catalog} apercus={props.apercus} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={reglage.isPending} onClick={() => reglage.terminer(() => setEnregistre(true))}>
          {reglage.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {t('enregistrer')}
        </Button>
        {enregistre && !reglage.echec ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('enregistre')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
