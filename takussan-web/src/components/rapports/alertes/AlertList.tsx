'use client';

import { useId, useState, useTransition } from 'react';
import { BellRing, Loader2, MoreHorizontal, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createThresholdAlertAction, deleteThresholdAlertAction, updateThresholdAlertAction } from '@/app/actions/alerts';
import { StatusBadge, type StatusTone } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { pourcentMesure, pourcentSaisi } from '@/lib/rapports/pourcentages';
import type { ThresholdAlert } from '@/lib/queries/alerts';
import {
  METRIQUES_D_ALERTE,
  dernierDeclenchement,
  formeDeLaMetrique,
  jaugeDeLAlerte,
  type Jauge,
  type MetriqueDAlerte,
} from '@/lib/rapports/alertes';
import { cn } from '@/lib/utils';

import { Segmente } from '../Segmente';

/** La valeur envoyée à l'API, et la clé de son libellé (`>` n'est pas une clé de dictionnaire). */
const OPERATORS = [
  { value: '>', key: 'gt' },
  { value: '>=', key: 'gte' },
  { value: '<', key: 'lt' },
  { value: '<=', key: 'lte' },
] as const;

const SEVERITIES = ['info', 'warning', 'critical'] as const;
type Severity = (typeof SEVERITIES)[number];

/** Le ton de pastille de chaque sévérité — la table de la console, pas une couleur locale. */
const SEVERITY_TONE: Record<Severity, StatusTone> = { info: 'info', warning: 'attention', critical: 'danger' };

const SYMBOLE: Record<string, string> = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' };

const REQUETE_DU_BUREAU = '(width >= 64rem)';

interface AlertListProps {
  readonly initialAlerts: ThresholdAlert[];
}

/** Les lectures d'une alerte, dans la langue de la page. */
function useLectureDAlerte() {
  const t = useTranslations('rapports.alertes');
  const tA = useTranslations('dashboard.alerts');
  const tMetric = useTranslations('dashboard.kpis.metrics');
  const f = useFormatteurs();
  const metrique = (code: string) => ((METRIQUES_D_ALERTE as readonly string[]).includes(code) ? tMetric(code) : code);
  // TCK-2801 — la valeur MESURÉE à une décimale (« 3,9 % », comme la tuile), plus si l'arrondi tombait de l'autre
  // côté du seuil (`pourcentMesure(f, n, seuil)`) ; le seuil SAISI tel quel.
  const chiffre = (metric: string, v: number | string | null | undefined, { saisi = false, seuil }: { saisi?: boolean; seuil?: number | string } = {}) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const forme = formeDeLaMetrique(metric);
    return forme === 'pourcent'
      ? (saisi ? pourcentSaisi(f, n) : pourcentMesure(f, n, seuil === undefined ? undefined : Number(seuil)))
      : forme === 'montant'
        ? f.montantAbrege(n, 'XOF')
        : f.nombre(n);
  };
  const quand = (a: ThresholdAlert) => {
    const at = dernierDeclenchement(a);
    return at ? t('declencheeLe', { date: f.jourMois(at) }) : t('jamais');
  };
  const destinataires = (a: ThresholdAlert) => {
    const r = a.recipients;
    if (!r) return '—';
    if (r.users.length > 0) return r.users.map((u) => u.name ?? t('sansNom')).join(', ');
    return t('destinatairesCompte', { n: r.count });
  };
  const canal = (a: ThresholdAlert) => {
    const c = (a.channels ?? []).map((x) => (x === 'email' || x === 'inapp' ? t(`canaux.${x}`) : x));
    return c.length > 0 ? new Intl.ListFormat(f.locale, { type: 'conjunction' }).format(c) : '—';
  };
  const severite = (s: string) => ((SEVERITIES as readonly string[]).includes(s) ? tA(`severities.${s}`) : s);
  const ton = (s: string): StatusTone => ((SEVERITIES as readonly string[]).includes(s) ? SEVERITY_TONE[s as Severity] : 'neutral');
  return {
    metrique,
    chiffre,
    quand,
    destinataires,
    canal,
    severite,
    ton,
    titre: (a: ThresholdAlert) => `${metrique(a.metric)} ${SYMBOLE[a.operator] ?? a.operator} ${chiffre(a.metric, a.threshold, { saisi: true })}`,
    actuel: (a: ThresholdAlert) => chiffre(a.metric, a.current_value, { seuil: a.threshold }),
    seuil: (a: ThresholdAlert) => t('seuil', { valeur: chiffre(a.metric, a.threshold, { saisi: true }) }),
    delai: (a: ThresholdAlert) => t('delai', { h: a.cooldown_hours }),
  };
}

/**
 * TCK-2629 — l'onglet « Alertes » de Rapports (maquette `app-rapports`, écrans « Alertes » et « Nouvelle
 * alerte ») : une ligne par alerte qui DIT SON ÉTAT — la valeur actuelle (`current_value`) sur une jauge
 * dont le trait est le seuil, le dernier déclenchement (« jamais » ou une date), qui est prévenu, par quel
 * canal, et le délai entre deux alertes. Au téléphone une carte par alerte, au bureau un tableau.
 *
 * Création ET modification dans le même formulaire (feuille du bas au téléphone, panneau droit au bureau) :
 * métrique, condition, seuil, sévérité, délai (24 h par défaut). Les destinataires (les admins actifs de
 * l'agence, `recipients`) et les canaux (ceux de l'événement) se LISENT : leur choix est hors périmètre.
 * « Évaluées toutes les heures » est dit à l'écran.
 */
export function AlertList({ initialAlerts }: AlertListProps) {
  const t = useTranslations('rapports.alertes');
  const tA = useTranslations('dashboard.alerts');
  const l = useLectureDAlerte();
  const f = useFormatteurs();
  const bureau = useMatchesMedia(REQUETE_DU_BUREAU);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [edition, setEdition] = useState<{ readonly alerte: ThresholdAlert | null; readonly ouverte: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [erreurSuppression, setErreurSuppression] = useState(false);

  const declenchees = alerts.filter((a) => jaugeDeLAlerte(a)?.sonne).length;
  const recents = alerts
    .flatMap((a) => (a.triggers ?? []).filter((x) => x.at).map((x) => ({ alerte: a, at: x.at as string, value: x.value })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  function removeAlert(id: number) {
    setErreurSuppression(false);
    startTransition(async () => {
      const res = await deleteThresholdAlertAction(id);
      if (res.ok) setAlerts((prev) => prev.filter((a) => a.id !== id));
      else setErreurSuppression(true);
    });
  }

  const ouvrir = (alerte: ThresholdAlert | null) => setEdition({ alerte, ouverte: true });
  const fermer = () => setEdition((e) => (e ? { ...e, ouverte: false } : e));
  const enregistree = (a: ThresholdAlert) => {
    setAlerts((prev) => (prev.some((x) => x.id === a.id) ? prev.map((x) => (x.id === a.id ? a : x)) : [a, ...prev]));
    fermer();
  };

  const menu = (a: ThresholdAlert) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('menuAria', { titre: l.titre(a) })}
        disabled={isPending}
        className="inline-flex size-11 flex-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring lg:size-9"
      >
        <MoreHorizontal className="size-5 lg:size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => ouvrir(a)}>{t('modifier')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => removeAlert(a.id)} className="text-destructive">
          {tA('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const formulaire = edition ? (
    <FormulaireDAlerte key={edition.alerte?.id ?? 'nouvelle'} alerte={edition.alerte} onEnregistree={enregistree} />
  ) : null;
  const titreDuFormulaire = edition?.alerte ? t('modifierTitre') : t('nouvelle');

  return (
    <div className="space-y-4" data-slot="alertes-du-rapport">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ui text-muted-foreground">
          {t('resume', { n: alerts.length, declenchees })}
        </p>
        <Button type="button" onClick={() => ouvrir(null)}>
          <Plus aria-hidden="true" />
          {t('nouvelle')}
        </Button>
      </div>

      {erreurSuppression ? (
        <p role="alert" className="text-sm text-destructive">
          {t('suppressionEchec')}
        </p>
      ) : null}

      {alerts.length === 0 ? (
        <EmptyState icon={<BellRing className="size-8" aria-hidden="true" />} title={tA('empty')} description={t('videDescription')} />
      ) : (
        <>
          <ul className="space-y-3 lg:hidden" data-slot="cartes-alertes">
            {alerts.map((a) => {
              const jauge = jaugeDeLAlerte(a);
              return (
                <li key={a.id} className="rounded-xl border border-border bg-card p-4" data-alerte={a.id}>
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-corps font-semibold">{l.titre(a)}</p>
                    <StatusBadge label={l.severite(a.severity)} tone={l.ton(a.severity)} />
                    <span className="-my-2.5 -mr-3">{menu(a)}</span>
                  </div>
                  <p className="mt-3 flex items-baseline justify-between gap-3 text-ui">
                    <span>
                      <span className="text-muted-foreground">{t('actuel')} </span>
                      <b className={cn('text-corps font-semibold tabular-nums', jauge?.sonne && 'text-destructive')} data-slot="valeur-actuelle">
                        {l.actuel(a)}
                      </b>
                      <span className="text-muted-foreground"> · {l.seuil(a)}</span>
                    </span>
                    <span className={cn('flex-none', jauge?.sonne ? 'font-medium text-destructive' : 'text-muted-foreground')} data-slot="dernier-declenchement">
                      {l.quand(a)}
                    </span>
                  </p>
                  <JaugeDuSeuil jauge={jauge} className="mt-2" />
                  <p className="mt-3 truncate text-ui text-foreground">{t('previent', { qui: l.destinataires(a), canal: l.canal(a) })}</p>
                  <p className="mt-0.5 text-ui text-muted-foreground">{t('auPlusUne', { delai: l.delai(a) })}</p>
                </li>
              );
            })}
          </ul>

          <div className="overflow-x-auto rounded-xl border border-border bg-card max-lg:hidden">
            <table className="w-full min-w-[59rem] text-sm" data-slot="table-alertes">
              <caption className="sr-only">{t('caption')}</caption>
              <thead className="bg-muted/40 text-ui text-muted-foreground">
                <tr>
                  {(['alerte', 'actuelle', 'declenchement', 'destinataires', 'canal', 'delai'] as const).map((c) => (
                    <th key={c} scope="col" className="px-4 py-2.5 text-left font-medium">
                      {t(`colonnes.${c}`)}
                    </th>
                  ))}
                  <th scope="col" className="w-12 px-2 py-2.5">
                    <span className="sr-only">{t('colonnes.gestes')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alerts.map((a) => {
                  const jauge = jaugeDeLAlerte(a);
                  return (
                    <tr key={a.id} data-alerte={a.id}>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium">{l.titre(a)}</span>
                          <StatusBadge label={l.severite(a.severity)} tone={l.ton(a.severity)} />
                        </span>
                      </th>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <b className={cn('w-16 flex-none font-semibold tabular-nums', jauge?.sonne && 'text-destructive')}>{l.actuel(a)}</b>
                          <JaugeDuSeuil jauge={jauge} className="min-w-16 flex-1" />
                        </span>
                        <span className="sr-only">{l.seuil(a)}</span>
                      </td>
                      <td className={cn('px-4 py-3', jauge?.sonne ? 'font-medium text-destructive' : 'text-muted-foreground')}>{l.quand(a)}</td>
                      <td className="px-4 py-3 text-foreground">
                        <span className="line-clamp-2">{l.destinataires(a)}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{l.canal(a)}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{l.delai(a)}</td>
                      <td className="px-2 py-1 text-right">{menu(a)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-pretty text-muted-foreground">{t('note')}</p>

      {recents.length > 0 ? (
        <section aria-labelledby="alertes-recentes" className="pt-3 max-lg:hidden">
          <h2 id="alertes-recentes" className="mb-2.5 text-corps font-semibold">
            {t('recents')}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {recents.map((r) => (
              <li key={`${r.alerte.id}-${r.at}`} className="flex min-h-11 items-center gap-4 px-4">
                <span className="w-28 flex-none tabular-nums text-muted-foreground">{f.jourMois(r.at)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{l.titre(r.alerte)}</span>
                <span className="w-24 flex-none text-right font-semibold tabular-nums">{l.chiffre(r.alerte.metric, r.value, { seuil: r.alerte.threshold })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {edition && bureau ? (
        <PanneauDroit open={edition.ouverte} onOpenChange={(o) => (o ? null : fermer())} titre={titreDuFormulaire}>
          {formulaire}
        </PanneauDroit>
      ) : null}
      {edition && !bureau ? (
        <FeuilleDuBas open={edition.ouverte} onOpenChange={(o) => (o ? null : fermer())} titre={titreDuFormulaire}>
          {formulaire}
        </FeuilleDuBas>
      ) : null}
    </div>
  );
}

/** Le trait vertical est le seuil (maquette `JaugeSeuil`) ; sans valeur actuelle, pas de jauge. */
function JaugeDuSeuil({ jauge, className }: { readonly jauge: Jauge | null; readonly className?: string }) {
  if (!jauge) return <span className={cn('block h-1.5', className)} aria-hidden="true" />;
  return (
    <span className={cn('relative block h-1.5 rounded-full bg-muted', className)} aria-hidden="true" data-slot="jauge" data-part={Math.round(jauge.part)}>
      <span className={cn('absolute inset-y-0 left-0 rounded-full', jauge.sonne ? 'bg-destructive' : 'bg-success')} style={{ width: `${jauge.part}%` }} />
      <span className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground" style={{ left: `${jauge.seuil}%` }} data-slot="trait-du-seuil" />
    </span>
  );
}

/** Créer ou modifier une alerte : les cinq champs de l'API ; qui est prévenu et comment, en lecture. */
function FormulaireDAlerte({
  alerte,
  onEnregistree,
}: {
  readonly alerte: ThresholdAlert | null;
  readonly onEnregistree: (a: ThresholdAlert) => void;
}) {
  const t = useTranslations('rapports.alertes');
  const tA = useTranslations('dashboard.alerts');
  const tMetric = useTranslations('dashboard.kpis.metrics');
  const id = useId();
  const [metric, setMetric] = useState<MetriqueDAlerte>(
    (METRIQUES_D_ALERTE as readonly string[]).includes(alerte?.metric ?? '') ? (alerte!.metric as MetriqueDAlerte) : 'unpaid_rate_percent',
  );
  const [operator, setOperator] = useState<ThresholdAlert['operator']>(alerte?.operator ?? '>');
  const [threshold, setThreshold] = useState(alerte ? String(alerte.threshold) : '10');
  const [severity, setSeverity] = useState<Severity>(
    alerte && (SEVERITIES as readonly string[]).includes(alerte.severity) ? alerte.severity : 'warning',
  );
  const [cooldownHours, setCooldownHours] = useState(String(alerte?.cooldown_hours ?? 24));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const metricItems = METRIQUES_D_ALERTE.map((m) => ({ value: m, label: tMetric(m) }));
  const operatorItems = OPERATORS.map((o) => ({ value: o.value, label: tA(`operators.${o.key}`) }));

  function enregistrer() {
    setError(null);
    const parsed = Number(threshold);
    if (threshold.trim() === '' || Number.isNaN(parsed)) {
      setError(tA('invalidThreshold'));
      return;
    }
    const input = { metric, operator, threshold: parsed, severity, cooldown_hours: Number(cooldownHours) || 24 };
    startTransition(async () => {
      const res = alerte ? await updateThresholdAlertAction(alerte.id, input) : await createThresholdAlertAction(input);
      if (!res.ok) {
        setError(res.message || (alerte ? t('modificationEchec') : tA('createError')));
        return;
      }
      onEnregistree(res.data);
    });
  }

  return (
    <form
      className="space-y-4"
      data-slot="formulaire-alerte"
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-metric`}>{tA('metric')}</Label>
        <Select value={metric} onValueChange={(v) => setMetric((v ?? metric) as MetriqueDAlerte)} items={metricItems}>
          <SelectTrigger id={`${id}-metric`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {metricItems.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-operator`}>{t('condition')}</Label>
          <Select value={operator} onValueChange={(v) => setOperator((v ?? operator) as ThresholdAlert['operator'])} items={operatorItems}>
            <SelectTrigger id={`${id}-operator`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operatorItems.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-threshold`}>{tA('threshold')}</Label>
          <Input
            id={`${id}-threshold`}
            type="number"
            inputMode="decimal"
            // Sans `step`, le `<form>` refuse 7.5 à l'Entrée (pas implicite de 1) — l'API accepte tout `numeric`.
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="tabular-nums"
          />
        </div>
      </div>
      <div>
        <p id={`${id}-severity`} className="mb-1.5 text-sm font-medium text-foreground">
          {tA('severity')}
        </p>
        {/* TCK-2801 — une sévérité, et une seule : le contrôle segmenté de la maquette, plus des puces. */}
        <Segmente
          idDuLibelle={`${id}-severity`}
          valeur={severity}
          onChange={setSeverity}
          options={SEVERITIES.map((s) => ({ valeur: s, libelle: tA(`severities.${s}`) }))}
        />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{t('quiEstPrevenu')}</p>
        <p className="text-sm text-pretty text-muted-foreground">{t('quiEstPrevenuValeur')}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-cooldown`}>{tA('cooldown')}</Label>
        {/* TCK-2801 — « 24 heures » (maquette) : l'unité écrite à côté du champ, plus dans son libellé. */}
        <div className="flex items-center gap-2">
          <Input
            id={`${id}-cooldown`}
            type="number"
            min="1"
            max="720"
            inputMode="numeric"
            value={cooldownHours}
            onChange={(e) => setCooldownHours(e.target.value)}
            aria-describedby={`${id}-cooldown-unite ${id}-cooldown-hint`}
            className="w-24 tabular-nums"
          />
          <span id={`${id}-cooldown-unite`} className="text-sm text-foreground">
            {t('uniteHeures')}
          </span>
        </div>
        <p id={`${id}-cooldown-hint`} className="text-xs text-pretty text-muted-foreground">
          {t('relueToutesLesHeures')}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {alerte ? t('enregistrer') : tA('create')}
      </Button>
    </form>
  );
}
