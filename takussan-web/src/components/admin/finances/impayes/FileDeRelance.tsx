'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { isReachable } from '@/components/crm/contact';
import { Button } from '@/components/ui/button';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import type { PaymentHistoryRow } from '@/types/invoice';

import { useLectureDImpaye } from './lecture';
import { ComposerLaRelance, OuvrirWhatsApp } from './RelanceDUnImpaye';
import { useRelanceDUnImpaye } from './useRelanceDUnImpaye';

/**
 * TCK-2682 (ADR-0105, amendement du 2026-11-10) — LA FILE GUIDÉE : relancer une sélection d'impayés,
 * une conversation WhatsApp après l'autre. Takussan n'envoie rien : chaque message part du WhatsApp
 * de l'admin, ouvert par `wa.me` (la même aide que la relance unitaire, `useRelanceDUnImpaye`).
 *
 * · Le lien de paiement d'une échéance se demande QUAND elle s'affiche, jamais en lot au départ.
 * · « Ouvrir WhatsApp » note la relance de CETTE échéance et passe à la suivante ; si la note est
 *   refusée, la file avance quand même et le récapitulatif le dit (« relance non notée »).
 * · « Passer » ne note rien. Une échéance sans numéro (aucun lien demandé) ou dont le lien rend 409
 *   est SAUTÉE : sa raison s'affiche, « Suivant » avance, le récapitulatif la compte et la nomme.
 * · « Arrêter » (ou la croix, ou Échap) referme la file : les relances notées restent, la sélection
 *   est intacte. « Terminer » ne garde sélectionnées que les échéances passées et sautées.
 */
export type RaisonDeSaut = 'sansTelephone' | 'lienRefuse';

export type IssueDUneEcheance =
  | { readonly genre: 'relance'; readonly note: 'en-cours' | 'prise' | 'refusee' }
  | { readonly genre: 'passe' }
  | { readonly genre: 'saute'; readonly raison: RaisonDeSaut };

export interface EtatDeLaFile {
  /** Le tour : une note qui revient après « Arrêter » ne s'inscrit pas dans la file suivante. */
  readonly tour: number;
  readonly rows: readonly PaymentHistoryRow[];
  readonly index: number;
  readonly issues: ReadonlyMap<number, IssueDUneEcheance>;
}

export function useFileDeRelance() {
  const [file, setFile] = useState<EtatDeLaFile | null>(null);
  // Le compteur des tours vit HORS de la file : après « Arrêter », `file` est nul, et un tour lu dans
  // la file repartirait toujours de 1 — une note de la file arrêtée s'inscrirait dans la suivante.
  const tours = useRef(0);

  const inscrire = (tour: number, id: number, issue: IssueDUneEcheance, avancer: boolean) =>
    setFile((f) => {
      if (!f || f.tour !== tour) return f;
      if (avancer && f.rows[f.index]?.id !== id) return f;
      return { ...f, index: avancer ? f.index + 1 : f.index, issues: new Map(f.issues).set(id, issue) };
    });

  return {
    file,
    /** L'échéance présentée (`null` au récapitulatif). */
    enCours: file && file.index < file.rows.length ? file.rows[file.index] : null,
    demarrer: (rows: readonly PaymentHistoryRow[]) => {
      if (rows.length === 0) return;
      tours.current += 1;
      setFile({ tour: tours.current, rows, index: 0, issues: new Map() });
    },
    /**
     * WhatsApp s'est ouvert : la relance compte, et la file avance — APRÈS le clic. Le navigateur suit
     * le lien APRÈS le gestionnaire ET ses microtâches, où React valide le rendu : avancer dans le
     * gestionnaire même réécrirait l'`href` de la même ancre au numéro du locataire SUIVANT avant
     * qu'il ne soit suivi (mesuré le 2026-11-12, vrai clic : sans ce délai ni la `key` de l'ancre,
     * l'`href` suivi est celui de la 2ᵉ échéance). La `key` par échéance est la seconde garde : une
     * ancre détachée navigue encore, vers SON `href`.
     */
    ouvert: (id: number, note: Promise<boolean>) => {
      const tour = file?.tour ?? 0;
      window.setTimeout(
        () =>
          setFile((f) => {
            if (!f || f.tour !== tour || f.rows[f.index]?.id !== id) return f;
            // La note a pu revenir avant l'avance : son issue reste.
            const issues = f.issues.has(id) ? f.issues : new Map(f.issues).set(id, { genre: 'relance', note: 'en-cours' } as const);
            return { ...f, index: f.index + 1, issues };
          }),
        0,
      );
      void note.then((prise) =>
        setFile((f) =>
          f && f.tour === tour ? { ...f, issues: new Map(f.issues).set(id, { genre: 'relance', note: prise ? 'prise' : 'refusee' }) } : f,
        ),
      );
    },
    passer: (id: number) => inscrire(file?.tour ?? 0, id, { genre: 'passe' }, true),
    sauter: (id: number, raison: RaisonDeSaut) => inscrire(file?.tour ?? 0, id, { genre: 'saute', raison }, true),
    arreter: () => setFile(null),
  };
}

export type FileDeRelanceApi = ReturnType<typeof useFileDeRelance>;

/** Le compte du récapitulatif, et les échéances à garder sélectionnées (passées et sautées). */
export function bilanDeLaFile(file: EtatDeLaFile) {
  const relances: PaymentHistoryRow[] = [];
  const passes: PaymentHistoryRow[] = [];
  const sautes: { row: PaymentHistoryRow; raison: RaisonDeSaut }[] = [];
  const nonNotees: PaymentHistoryRow[] = [];
  for (const row of file.rows) {
    const issue = file.issues.get(row.id);
    if (!issue) continue;
    if (issue.genre === 'relance') {
      relances.push(row);
      if (issue.note === 'refusee') nonNotees.push(row);
    } else if (issue.genre === 'passe') passes.push(row);
    else sautes.push({ row, raison: issue.raison });
  }
  return { relances, passes, sautes, nonNotees, aGarder: [...passes.map((r) => r.id), ...sautes.map((s) => s.row.id)] };
}

export function FileDeRelance({ api, onTerminer }: { readonly api: FileDeRelanceApi; readonly onTerminer: (aGarder: readonly number[]) => void }) {
  const t = useTranslations('admin.finances.impayes');
  const l = useLectureDImpaye();
  const { file, enCours } = api;
  const joignable = isReachable(enCours?.payer?.phone ?? null);
  // Aucun lien n'est demandé pour une échéance sans numéro : elle sera sautée sans rien créer.
  const relance = useRelanceDUnImpaye(enCours, enCours !== null && joignable);
  const raisonId = useId();
  if (!file) return null;

  const total = file.rows.length;
  const saut: RaisonDeSaut | null = !enCours ? null : !joignable ? 'sansTelephone' : relance.etatDuLien === 'refuse' ? 'lienRefuse' : null;
  const bilan = bilanDeLaFile(file);
  const terminer = () => {
    onTerminer(bilan.aGarder);
    api.arreter();
  };
  const position = enCours ? t('lot.file.position', { n: file.index + 1, total }) : undefined;

  const pied = enCours ? (
    <div className="flex w-full flex-col gap-2 xl:flex-row-reverse xl:items-center">
      {saut ? (
        <Button type="button" size="xl" onClick={() => api.sauter(enCours.id, saut)} className="xl:h-controle xl:px-3.5 xl:text-sm">
          {t('lot.file.suivant')}
        </Button>
      ) : (
        <OuvrirWhatsApp
          // Une ancre PAR échéance : jamais le lien du locataire suivant sous le doigt.
          key={enCours.id}
          relance={relance}
          onOuvert={(note) => api.ouvert(enCours.id, note)}
          className="w-full xl:h-controle xl:w-auto xl:px-3.5 xl:text-sm"
        />
      )}
      <div className="flex gap-2 *:flex-1 xl:*:flex-none">
        <Button type="button" variant="ghost" onClick={api.arreter}>
          {t('lot.file.arreter')}
        </Button>
        {saut ? null : (
          <Button type="button" variant="outline" onClick={() => api.passer(enCours.id)}>
            {t('lot.file.passer')}
          </Button>
        )}
      </div>
    </div>
  ) : (
    <Button type="button" size="xl" onClick={terminer} className="w-full xl:h-controle xl:w-auto xl:px-3.5 xl:text-sm">
      {t('lot.recap.terminer')}
    </Button>
  );

  return (
    <PanneauDroit
      open
      formulaire
      onOpenChange={(ouvert) => {
        if (ouvert) return;
        // La croix ou Échap : « Arrêter » pendant la file, « Terminer » au récapitulatif.
        if (enCours) api.arreter();
        else terminer();
      }}
      titre={enCours ? t('relancer.titre', { nom: l.nom(enCours) }) : t('lot.recap.titre')}
      sousTitre={position}
      pied={pied}
    >
      <div data-slot="file-de-relance" data-echeance={enCours?.id}>
        {enCours ? (
          <>
            <p className="mb-3 hidden text-ui font-medium text-muted-foreground tabular-nums xl:block" data-slot="position-dans-la-file">
              {position}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{l.montantDu(enCours)}</span> · {l.periode(enCours)} ·{' '}
              {t('relancer.retard', { count: enCours.days_late ?? 0 })}
            </p>
            {saut ? (
              <p id={raisonId} role="status" data-slot="raison-du-saut" className="mt-4 rounded-xl bg-warning/10 px-3.5 py-3 text-sm text-foreground">
                {saut === 'sansTelephone' ? t('lot.file.sauteSansTelephone') : t('lot.file.sauteLienRefuse')}
              </p>
            ) : (
              <div className="mt-4">
                <ComposerLaRelance key={enCours.id} row={enCours} relance={relance} />
              </div>
            )}
          </>
        ) : (
          <Recapitulatif bilan={bilan} />
        )}
      </div>
    </PanneauDroit>
  );
}

function Recapitulatif({ bilan }: { readonly bilan: ReturnType<typeof bilanDeLaFile> }) {
  const t = useTranslations('admin.finances.impayes.lot.recap');
  const l = useLectureDImpaye();
  return (
    <div data-slot="recapitulatif">
      <p className="font-display text-xl font-semibold tabular-nums" role="status">
        {t('compte', { relances: bilan.relances.length, passes: bilan.passes.length, sautes: bilan.sautes.length })}
      </p>
      {bilan.sautes.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-sm font-medium">{t('sautes')}</h3>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {bilan.sautes.map(({ row, raison }) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium">{l.nom(row)}</span>
                <span className="flex-none text-muted-foreground">{t(`raison.${raison}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {bilan.nonNotees.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-sm font-medium">{t('nonNotees')}</h3>
          <p className="mt-1 text-ui text-muted-foreground">{t('nonNoteeAide')}</p>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {bilan.nonNotees.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium">{l.nom(row)}</span>
                <span className="flex-none text-destructive">{t('nonNotee')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {bilan.aGarder.length > 0 ? <p className="mt-5 text-ui text-muted-foreground">{t('garde')}</p> : null}
    </div>
  );
}
