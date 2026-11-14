'use client';

import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { RotateCcw } from 'lucide-react';

import { DataState } from '@/components/console';
import { StatusBadge } from '@/components/console/StatusBadge';
import { ID_DU_BAS_DU_CADRE } from '@/components/admin-agency/fiche/CadreDeLaFiche';
import { DialogueDeSortie, useGardeDeSortie } from '@/components/admin-agency/fiche/garde-de-sortie';
import { classesDuChamp } from '@/components/admin-agency/fiche/pieces';
import { Button } from '@/components/ui/button';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Input } from '@/components/ui/input';
import { ApiError, messageErreurApi } from '@/lib/api';
import {
  useEnregistrerReglageDeBail,
  useReglagesDeBail,
  useRevenirALaPlateforme,
  type CleDeReglageDeBail,
  type ReglageDeBail,
} from '@/lib/queries/reglages-de-bail';
import { cn } from '@/lib/utils';

/** La clé de libellé de chaque réglage, sous `agency.reglagesDeBail.cles`. */
const LIBELLES: Record<CleDeReglageDeBail, 'penalite' | 'grace' | 'indemnite' | 'revision'> = {
  'lease.late_fee_percent': 'penalite',
  'lease.late_fee_grace_days': 'grace',
  'lease.early_termination_penalty_months': 'indemnite',
  'lease.rent_review_max_pct': 'revision',
};

/** L'unité de chaque réglage, sous `agency.reglagesDeBail.unites` (valeur) et `.suffixes` (champ). */
const UNITES: Record<CleDeReglageDeBail, 'pourcent' | 'jours' | 'mois'> = {
  'lease.late_fee_percent': 'pourcent',
  'lease.late_fee_grace_days': 'jours',
  'lease.early_termination_penalty_months': 'mois',
  'lease.rent_review_max_pct': 'pourcent',
};

type Saisies = Partial<Record<CleDeReglageDeBail, string>>;
type Erreurs = Partial<Record<CleDeReglageDeBail, string>>;

/** L'emplacement du cadre ne change pas une fois la page montée : rien à écouter. */
const sansAbonnement = () => () => {};

const enNombre = (saisie: string): number => (saisie.trim() === '' ? Number.NaN : Number(saisie.replace(',', '.')));

/**
 * TCK-2832 — la section « Réglages de bail » de la fiche « Mon agence » (maquette
 * `app-agence-reglages-bail`, approche A) : quatre cartes modifiables en place, UN seul
 * « Enregistrer » (une écriture `POST /api/settings` par valeur modifiée), et sur chaque carte réglée
 * par l'agence « Revenir à la valeur de la plateforme », qui RETIRE la ligne d'agence — jamais une
 * ligne à 0 (TCK-2643 r6). Les bornes affichées et jugées sont celles que l'API renvoie : la règle
 * du catalogue qui valide l'écriture.
 */
export function ReglagesDeBail() {
  const t = useTranslations('agency.reglagesDeBail');
  const tFiche = useTranslations('admin.agencyConfig.fiche');
  const tCommon = useTranslations('common.actions');
  const tRacine = useTranslations();
  const lecture = useReglagesDeBail();
  const enregistrer = useEnregistrerReglageDeBail();
  const revenir = useRevenirALaPlateforme();
  const reglages = lecture.data?.data.settings ?? [];

  const [saisies, setSaisies] = useState<Saisies>({});
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [globale, setGlobale] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const modifies = reglages.filter((r) => saisies[r.key] !== undefined && enNombre(saisies[r.key]!) !== r.value);
  const enErreur = reglages.filter((r) => erreurs[r.key] !== undefined).length;
  const nombre = modifies.length;
  const occupe = envoi || revenir.isPending;

  const annuler = () => {
    setSaisies({});
    setErreurs({});
    setGlobale(null);
  };
  const sortie = useGardeDeSortie(nombre > 0, annuler);
  // La barre du bureau se rend sous la page du cadre (pleine largeur) ; hors du cadre, en place.
  const bas = useSyncExternalStore(sansAbonnement, () => document.getElementById(ID_DU_BAS_DU_CADRE), () => null);

  const avecUnite = (r: ReglageDeBail, valeur: number) => t(`unites.${UNITES[r.key]}`, { valeur });
  const messageDesBornes = (r: ReglageDeBail): string => {
    const params = { min: r.min ?? 0, max: avecUnite(r, r.max ?? 0) };
    return t(r.min_exclusive ? 'bornes.superieurA' : 'bornes.entre', params);
  };
  /** Le refus d'une saisie, jugé sur les bornes que l'API applique ; `null` : admise. */
  const refusDe = (r: ReglageDeBail, valeur: number): string | null => {
    const sujet = t(`cles.${LIBELLES[r.key]}.sujet`);
    if (Number.isNaN(valeur)) return t('refus.nombre');
    if (r.type === 'integer' && !Number.isInteger(valeur)) return t('refus.entier', { sujet });
    if (r.max !== null && valeur > r.max) return t('refus.max', { sujet, max: avecUnite(r, r.max) });
    if (r.min !== null && r.min_exclusive && valeur <= r.min) return t('refus.superieurA', { sujet, min: avecUnite(r, r.min) });
    if (r.min !== null && !r.min_exclusive && valeur < r.min) return t('refus.min', { sujet, min: avecUnite(r, r.min) });
    return null;
  };

  const soumettre = async () => {
    setAnnonce(null);
    setGlobale(null);
    const refus: Erreurs = {};
    for (const r of modifies) {
      const motif = refusDe(r, enNombre(saisies[r.key]!));
      if (motif !== null) refus[r.key] = motif;
    }
    setErreurs(refus);
    if (Object.keys(refus).length > 0) return;

    setEnvoi(true);
    const restantes: Saisies = { ...saisies };
    const rejets: Erreurs = {};
    try {
      for (const r of modifies) {
        try {
          await enregistrer.mutateAsync({ key: r.key, value: enNombre(saisies[r.key]!) });
          delete restantes[r.key];
        } catch (e) {
          // AC5 — le message du champ, tel que la règle du catalogue l'a rendu ; la saisie reste.
          const duChamp = e instanceof ApiError ? e.validationErrors?.value?.[0] : undefined;
          if (duChamp) rejets[r.key] = duChamp;
          else setGlobale(messageErreurApi(e, tRacine, t('erreurEcriture')));
        }
      }
    } finally {
      setEnvoi(false);
    }
    setSaisies(restantes);
    setErreurs(rejets);
    if (Object.keys(rejets).length === 0 && Object.keys(restantes).length === 0) setAnnonce(t('enregistre'));
  };

  const revenirALaPlateforme = async (r: ReglageDeBail) => {
    if (r.setting_id === null) return;
    setAnnonce(null);
    setGlobale(null);
    try {
      await revenir.mutateAsync({ settingId: r.setting_id });
      setSaisies(({ [r.key]: _retiree, ...reste }) => reste);
      setErreurs(({ [r.key]: _retiree, ...reste }) => reste);
      setAnnonce(t('revenu', { reglage: t(`cles.${LIBELLES[r.key]}.titre`) }));
    } catch (e) {
      setGlobale(messageErreurApi(e, tRacine, t('erreurEcriture')));
    }
  };

  const enPortail = (noeud: ReactNode) => (bas ? createPortal(noeud, bas) : noeud);

  const enregistrerBouton = (
    <Button type="button" onClick={() => void soumettre()} disabled={occupe}>
      {envoi ? t('enregistrement') : t('enregistrer')}
    </Button>
  );

  return (
    <>
      {/* Le téléphone a le titre dans son en-tête : le texte de la section s'y lit ici (maquette a-0). */}
      <p className="mb-2 text-sm text-muted-foreground md:hidden">{t('description')}</p>
      <p className="mb-4 text-sm text-muted-foreground md:-mt-3">{t('bauxEnCours')}</p>
      <DataState
        loading={lecture.isLoading}
        error={lecture.error ? messageErreurApi(lecture.error, tRacine, t('erreurLecture')) : null}
        erreurBrute={lecture.error}
        onRetry={() => void lecture.refetch()}
        skeletonRows={4}
        skeletonRowClassName="h-44"
      >
        <div className="space-y-4">
          {globale !== null ? (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3.5 text-sm text-destructive">
              {globale}
            </p>
          ) : null}
          <p aria-live="polite" className={cn('rounded-xl bg-success/10 p-3.5 text-sm text-foreground', annonce === null && 'sr-only')}>
            {annonce}
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            {reglages.map((r) => (
              <CarteDeReglage
                key={r.key}
                reglage={r}
                saisie={saisies[r.key] ?? String(r.value)}
                modifie={modifies.includes(r)}
                erreur={erreurs[r.key] ?? null}
                bornes={messageDesBornes(r)}
                occupe={occupe}
                onSaisie={(valeur) => {
                  setSaisies((s) => ({ ...s, [r.key]: valeur }));
                  setErreurs(({ [r.key]: _retiree, ...reste }) => reste);
                  setAnnonce(null);
                }}
                onRevenir={() => void revenirALaPlateforme(r)}
              />
            ))}
          </div>
        </div>
      </DataState>

      {nombre > 0 ? (
        <>
          {/* Au téléphone : la barre d'action de la coque, comme la fiche. */}
          <BarreDAction>
            <div className="flex w-full items-center gap-3" data-slot="barre-des-reglages-telephone">
              <p className="min-w-0 flex-1 text-ui leading-tight text-muted-foreground" aria-live="polite">
                {enErreur > 0 ? (
                  <>
                    <span className="font-medium text-destructive">{t('barre.aCorriger', { n: enErreur })}</span>
                    <br />
                    {t('barre.rienDEnregistre')}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{tFiche('barre.compte', { n: nombre })}</span>
                    <br />
                    {tFiche('barre.nonEnregistrees', { n: nombre })}
                  </>
                )}
              </p>
              <Button type="button" variant="ghost" className="flex-none px-3" onClick={annuler} disabled={occupe}>
                {tCommon('cancel')}
              </Button>
              <span className="flex-none">{enregistrerBouton}</span>
            </div>
          </BarreDAction>
          {/* Dès `md` : UNE barre collante en bas de la page, comme la fiche. */}
          {enPortail(
          <div
            data-slot="barre-des-reglages"
            className="sticky bottom-0 z-10 -mx-6 mt-6 flex items-center gap-3 border-t border-border bg-card px-6 py-3 shadow-barre-collante max-md:hidden lg:-mx-8 lg:px-8"
          >
            <span className={cn('size-2 flex-none rounded-full', enErreur > 0 ? 'bg-destructive' : 'bg-primary')} aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">
              {enErreur > 0
                ? t('barre.aCorrigerBureau', { n: enErreur })
                : tFiche('barre.bureau', { n: nombre, champs: modifies.map((r) => t(`cles.${LIBELLES[r.key]}.titre`)).join(', ') })}
            </p>
            <Button type="button" variant="ghost" onClick={annuler} disabled={occupe}>
              {tCommon('cancel')}
            </Button>
            {enregistrerBouton}
          </div>,
          )}
        </>
      ) : null}

      <DialogueDeSortie {...sortie} nombre={nombre} />
    </>
  );
}

function CarteDeReglage({
  reglage,
  saisie,
  modifie,
  erreur,
  bornes,
  occupe,
  onSaisie,
  onRevenir,
}: {
  readonly reglage: ReglageDeBail;
  readonly saisie: string;
  readonly modifie: boolean;
  readonly erreur: string | null;
  readonly bornes: string;
  readonly occupe: boolean;
  readonly onSaisie: (valeur: string) => void;
  readonly onRevenir: () => void;
}) {
  const t = useTranslations('agency.reglagesDeBail');
  const tChamp = useTranslations('admin.agencyConfig.fiche.champ');
  const id = useId();
  const cle = LIBELLES[reglage.key];
  const unite = UNITES[reglage.key];
  const valeurAvecUnite = (valeur: number) => t(`unites.${unite}`, { valeur });

  return (
    <section aria-labelledby={`${id}-titre`} className="rounded-xl border border-border bg-card p-4" data-cle={reglage.key}>
      <h3 id={`${id}-titre`} className="text-corps font-medium leading-snug">
        {t(`cles.${cle}.titre`)}
      </h3>
      <p id={`${id}-aide`} className="mt-0.5 text-ui leading-snug text-muted-foreground">
        {t(`cles.${cle}.aide`)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative w-[8.25rem] flex-none">
          <label htmlFor={`${id}-champ`} className="sr-only">
            {t(`cles.${cle}.titre`)}
          </label>
          <Input
            id={`${id}-champ`}
            inputMode={reglage.type === 'integer' ? 'numeric' : 'decimal'}
            value={saisie}
            onChange={(e) => onSaisie(e.target.value)}
            aria-invalid={erreur !== null}
            aria-describedby={`${id}-aide ${id}-bornes`}
            className={cn('pr-14 font-medium tabular-nums', classesDuChamp(modifie && erreur === null, false))}
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ui text-muted-foreground">
            {t(`suffixes.${unite}`, { valeur: Number(saisie) || 0 })}
          </span>
        </div>
        <StatusBadge tone={reglage.source === 'agency' ? 'primary' : 'neutral'} label={reglage.source === 'agency' ? t('source.agence') : t('source.plateforme')} />
        {modifie ? <span className="rounded-full bg-secondary px-1.5 py-px text-legende font-medium text-primary-deep">{tChamp('modifie')}</span> : null}
      </div>
      {erreur !== null ? (
        <p id={`${id}-bornes`} className="mt-1.5 text-ui font-medium text-destructive">
          {erreur}
        </p>
      ) : (
        <p id={`${id}-bornes`} className="mt-1.5 text-xs text-muted-foreground">
          {bornes}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 border-t border-border pt-1.5 text-ui">
        <p className="mr-auto py-2 text-muted-foreground">
          {t('plateforme')} <span className="font-medium tabular-nums text-foreground">{valeurAvecUnite(reglage.platform_value)}</span>
        </p>
        {reglage.setting_id !== null ? (
          <Button type="button" variant="link" className="h-auto min-h-11 gap-1.5 px-0 text-ui font-medium" disabled={occupe} onClick={onRevenir}>
            <RotateCcw className="size-3.5 flex-none" aria-hidden="true" />
            {t('revenir')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
