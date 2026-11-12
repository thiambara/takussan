'use client';

/**
 * TCK-267, TCK-2671 — la demande de passage en pro (`individual → standard`).
 *
 * Un formulaire légal en une étape, PRÉREMPLI (ADR-0104 § 2) :
 *
 * - **Première demande** : la raison sociale, le RCCM, le NINEA et l'adresse du siège viennent des
 *   colonnes de l'agence (`prefill`, la source unique), et l'écran le dit (« Repris de votre fiche »).
 * - **Demande refusée** (`refusee`, ADR-0104 § 5) : le RCCM, la raison sociale, l'adresse et le
 *   nombre d'agents reprennent la demande refusée. Le NINEA et le RIB n'en reviennent jamais en clair
 *   (masqués par l'API) : leurs champs s'ouvrent VIDES, l'écran dit qu'ils sont conservés, et l'envoi
 *   (`renvoyerUneDemandeRefusee`) ne porte que ce qui a changé — sans `ninea` ni `rib_pro` tant que
 *   l'admin ne les retape pas (AC4). Les statuts sont toujours fournis à nouveau.
 *
 * Le brouillon (`agency-upgrade-{agency_id}`, {@link useWizardDraft}) est gardé tel quel :
 * TCK-989 — ni NINEA ni RIB dedans ; TCK-566 — ouvrir la page n'écrit rien. L'état « vierge » qui
 * décide d'écrire est le formulaire tel qu'il s'ouvre, préremplissage compris : sans quoi la seule
 * ouverture d'un formulaire prérempli écrirait un brouillon. Le fichier des statuts n'y est jamais.
 */

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Camera, FileText, Upload } from 'lucide-react';

import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { serialiserEtatBrouillon, useAutosaveBrouillon } from '@/hooks/useAutosaveBrouillon';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import {
  FORMULAIRE_UPGRADE_VIERGE,
  brouillonUpgradeDepuisFormulaire,
  formulaireUpgradeDepuisBrouillon,
  type BrouillonUpgrade,
} from '@/lib/agency-upgrade-brouillon';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { renvoyerUneDemandeRefusee, submitAgencyUpgradeRequest } from '@/lib/queries/agency-upgrade';
import { cn } from '@/lib/utils';
import type { AgencyUpgradeRequest, AgencyUpgradeRequestFormFields } from '@/types/agency-upgrade';

/** Les mentions légales de l'agence, telles que `GET /api/agencies/{agency}` les rend. */
export interface PreremplissageDeLaDemande {
  readonly company_legal_name?: string | null;
  readonly rc?: string | null;
  readonly ninea?: string | null;
  readonly address_fiscale?: string | null;
}

export type UpgradeRequestFormProps = {
  readonly agencyId: number;
  readonly prefill?: PreremplissageDeLaDemande;
  /** La dernière demande, refusée : le formulaire la reprend (`resubmit_of`). */
  readonly refusee?: AgencyUpgradeRequest | null;
};

/** 10 Mo — le `max:10240` de `SubmitAgencyUpgradeRequestRequest` (`statuts_doc`). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** `mimes:pdf,jpg,jpeg,png` du même FormRequest. */
const ACCEPT_MIME = 'application/pdf,image/jpeg,image/png';
const ACCEPT_PHOTO = 'image/jpeg,image/png';

type Champ = keyof AgencyUpgradeRequestFormFields;
const CHAMPS_TEXTE = ['company_legal_name', 'rc', 'ninea', 'rib_pro', 'address_fiscale'] as const;

/** Le formulaire tel qu'il s'ouvre, avant tout brouillon. */
function formulaireDeDepart(prefill: PreremplissageDeLaDemande | undefined, refusee: AgencyUpgradeRequest | null): AgencyUpgradeRequestFormFields {
  if (refusee) {
    return {
      ...FORMULAIRE_UPGRADE_VIERGE,
      rc: refusee.rc ?? '',
      company_legal_name: refusee.company_legal_name ?? '',
      address_fiscale: refusee.address_fiscale ?? '',
      planned_agents_count: refusee.planned_agents_count,
    };
  }
  return {
    ...FORMULAIRE_UPGRADE_VIERGE,
    company_legal_name: prefill?.company_legal_name ?? '',
    rc: prefill?.rc ?? '',
    ninea: prefill?.ninea ?? '',
    address_fiscale: prefill?.address_fiscale ?? '',
  };
}

/** Un brouillon relu complète le départ : un champ vide du brouillon laisse le préremplissage. */
function fusionner(depart: AgencyUpgradeRequestFormFields, brouillon: AgencyUpgradeRequestFormFields): AgencyUpgradeRequestFormFields {
  const texte = Object.fromEntries(CHAMPS_TEXTE.map((c) => [c, brouillon[c] !== '' ? brouillon[c] : depart[c]]));
  return { ...depart, ...texte, planned_agents_count: brouillon.planned_agents_count ?? depart.planned_agents_count };
}

export function UpgradeRequestForm({ agencyId, prefill, refusee = null }: UpgradeRequestFormProps) {
  const t = useTranslations('agency.upgrade.form');
  const td = useTranslations('agency.upgrade.demande');
  const messageErreur = useMessageErreurApi();
  const fmt = useFormatteurs();
  const { token } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const id = useId();
  const formId = `${id}-formulaire`;

  const draftKey = `agency-upgrade-${agencyId}`;
  const { draft, isLoading, save, flush, clear } = useWizardDraft<BrouillonUpgrade>(draftKey);

  const [depart] = useState(() => formulaireDeDepart(prefill, refusee));
  const [form, setForm] = useState<AgencyUpgradeRequestFormFields>(depart);
  const [hydrated, setHydrated] = useState(false);
  const [brouillonServeurExiste, setBrouillonServeurExiste] = useState(false);
  const [statutsDoc, setStatutsDoc] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const fichierRef = useRef<HTMLInputElement | null>(null);

  // TCK-316 — l'hydratation se fait pendant le RENDU, pas dans un effet (aucun remplissage après
  // coup, aucune frappe écrasée). Elle converge : `hydrated` passe à `true` et n'en revient pas.
  if (!hydrated && !isLoading) {
    setHydrated(true);
    setBrouillonServeurExiste(Boolean(draft?.data));
    if (draft?.data) setForm(fusionner(depart, formulaireUpgradeDepuisBrouillon(draft.data)));
  }

  // TCK-566, TCK-989 — l'autosave reçoit le formulaire SANS RIB ni NINEA, et ne compare qu'à l'état
  // d'ouverture : ouvrir la page n'écrit rien, revenir à l'état d'ouverture supprime le brouillon.
  const etatVierge = serialiserEtatBrouillon(0, brouillonUpgradeDepuisFormulaire(depart));
  useAutosaveBrouillon({
    hydrated,
    step: 0,
    data: brouillonUpgradeDepuisFormulaire(form),
    etatVierge,
    brouillonServeurExiste,
    save,
    clear,
  });

  function update<K extends Champ>(key: K, value: AgencyUpgradeRequestFormFields[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErreurGenerale(null);
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function choisir(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFieldErrors((prev) => ({ ...prev, statuts_doc: [t('errors.file_too_large')] }));
      setStatutsDoc(null);
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.statuts_doc;
      return next;
    });
    setStatutsDoc(file);
  }

  const fieldError = (key: string): string | undefined => fieldErrors[key]?.[0];

  /** Ce qui a changé par rapport à la demande refusée ; le NINEA et le RIB, seulement retapés. */
  function modifies(): Partial<AgencyUpgradeRequestFormFields> {
    const sortie: Partial<Record<Champ, string | number | null>> = {};
    for (const champ of CHAMPS_TEXTE) {
      if (form[champ].trim() !== depart[champ].trim()) sortie[champ] = form[champ];
    }
    if (form.planned_agents_count !== depart.planned_agents_count) sortie.planned_agents_count = form.planned_agents_count;
    return sortie as Partial<AgencyUpgradeRequestFormFields>;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setErreurGenerale(null);
    if (!token) {
      setErreurGenerale(t('errors.unauthorized'));
      return;
    }
    if (!statutsDoc) {
      setFieldErrors((prev) => ({ ...prev, statuts_doc: [t('errors.file_required')] }));
      return;
    }

    setSubmitting(true);
    try {
      // TCK-482 — `flush()` REND `{ ok, ecrit }` et ne lève pas : une écriture refusée arrête
      // l'envoi AVANT que `clear()` ne détruise la seule copie des saisies.
      const ecriture = await flush();
      if (!ecriture.ok) {
        toast.add({ title: t('errors.draft_not_saved_title'), description: t('errors.draft_not_saved_body'), type: 'error' });
        return;
      }
      if (refusee) {
        await renvoyerUneDemandeRefusee(token, agencyId, refusee.id, modifies(), statutsDoc);
      } else {
        await submitAgencyUpgradeRequest(token, agencyId, form, statutsDoc);
      }
      const brouillonEfface = await clear();
      toast.add({ title: t('toasts.submitted'), type: 'success' });
      // P237.04 (TCK-2371) — la demande est partie ; seul son brouillon a survécu au DELETE.
      if (!brouillonEfface) {
        toast.add({ title: t('toasts.draft_not_cleared_title'), description: t('toasts.draft_not_cleared_body'), type: 'warning' });
      }
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.validationErrors) {
        const erreurs = error.validationErrors;
        setFieldErrors(erreurs);
        // Une erreur sans champ à l'écran (`resubmit_of` : la demande refusée n'est plus la
        // dernière) se dit au-dessus du bouton, jamais en silence.
        const sansChamp = Object.keys(erreurs).filter((cle) => !(cle in FORMULAIRE_UPGRADE_VIERGE) && cle !== 'statuts_doc');
        if (sansChamp.length > 0) setErreurGenerale(erreurs[sansChamp[0]]?.[0] ?? td('erreurs.envoi'));
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setErreurGenerale(`${t('errors.forbidden')} ${messageErreur(error, '')}`.trim());
        return;
      }
      setErreurGenerale(messageErreur(error, td('erreurs.envoi')));
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('loading')}
      </p>
    );
  }

  /** « Repris de votre fiche » tant que la valeur est celle des mentions légales. */
  const repris = (champ: 'company_legal_name' | 'rc' | 'ninea' | 'address_fiscale'): string | null =>
    !refusee && depart[champ] !== '' && form[champ] === depart[champ] ? td('reprisDeLaFiche') : null;

  const champ = (cle: 'company_legal_name' | 'rc' | 'ninea' | 'rib_pro' | 'address_fiscale', aide: string | null, className?: string) => {
    const idChamp = `${id}-${cle}`;
    const erreur = fieldError(cle);
    const decrit = [aide ? `${idChamp}-aide` : null, erreur ? `${idChamp}-erreur` : null].filter(Boolean).join(' ') || undefined;
    return (
      <div className={cn('space-y-1.5', className)}>
        <label htmlFor={idChamp} className="block text-sm font-medium">
          {td(`champs.${cle}`)}
        </label>
        <Input
          id={idChamp}
          required={!refusee}
          value={form[cle]}
          autoComplete="off"
          className={cn(cle === 'rib_pro' && 'tabular-nums')}
          onChange={(e) => update(cle, e.target.value)}
          aria-invalid={!!erreur}
          aria-describedby={decrit}
        />
        {aide ? (
          <p id={`${idChamp}-aide`} className="text-xs text-muted-foreground">
            {aide}
          </p>
        ) : null}
        {erreur ? (
          <p id={`${idChamp}-erreur`} className="text-xs text-destructive">
            {erreur}
          </p>
        ) : null}
      </div>
    );
  };

  const conserve = (cle: 'ninea' | 'rib_pro'): string | null => {
    if (!refusee || form[cle] !== '') return null;
    const masque = refusee[cle];
    return masque ? td('conserveMasque', { valeur: masque }) : td('conserve');
  };

  const erreurStatuts = fieldError('statuts_doc');
  const libelleEnvoi = submitting ? t('cta.submitting') : t('cta.submit');

  return (
    <>
      <form id={formId} onSubmit={handleSubmit} aria-label={td('aria')} noValidate>
        <div className="mb-4">
          <h2 className="font-display text-titre-court font-semibold tracking-titre">{td('titre')}</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            {refusee ? td('texteReprise', { date: refusee.submitted_at ? fmt.jourMois(refusee.submitted_at) : '—' }) : td('texte')}
          </p>
        </div>
        <div className="space-y-4">
          {champ('company_legal_name', repris('company_legal_name'))}
          <div className="grid items-start gap-4 min-[90rem]:grid-cols-2">
            {champ('rc', repris('rc'))}
            {champ('ninea', conserve('ninea') ?? repris('ninea'))}
          </div>
          {champ('rib_pro', conserve('rib_pro'))}
          {champ('address_fiscale', refusee ? null : (repris('address_fiscale') ?? td('aideAdresse')))}

          <div className="space-y-1.5">
            <label htmlFor={`${id}-agents`} className="block text-sm font-medium">
              {t('fields.planned_agents_count')}
            </label>
            <Input
              id={`${id}-agents`}
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              className="lg:max-w-60"
              value={form.planned_agents_count ?? ''}
              onChange={(e) => update('planned_agents_count', e.target.value === '' ? null : Number(e.target.value))}
              aria-invalid={!!fieldError('planned_agents_count')}
              aria-describedby={`${id}-agents-aide${fieldError('planned_agents_count') ? ` ${id}-agents-erreur` : ''}`}
            />
            <p id={`${id}-agents-aide`} className="text-xs text-muted-foreground">
              {t('hints.planned_agents_count')}
            </p>
            {fieldError('planned_agents_count') ? (
              <p id={`${id}-agents-erreur`} className="text-xs text-destructive">
                {fieldError('planned_agents_count')}
              </p>
            ) : null}
          </div>

          <fieldset aria-describedby={`${id}-statuts-aide${erreurStatuts ? ` ${id}-statuts-erreur` : ''}`}>
            <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              {td('champs.statuts_doc')}
              {refusee ? <span className="rounded-full bg-warning/20 px-1.5 py-px text-legende font-medium">{td('aRemplacer')}</span> : null}
            </legend>
            {/* Deux vrais champs fichier, masqués : la caméra (`capture`) et le sélecteur. */}
            <input
              ref={photoRef}
              type="file"
              accept={ACCEPT_PHOTO}
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-champ="statuts-photo"
              onChange={(e) => {
                choisir(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <input
              ref={fichierRef}
              type="file"
              accept={ACCEPT_MIME}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-champ="statuts-fichier"
              onChange={(e) => {
                choisir(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <div className={cn('space-y-2 rounded-xl border bg-card p-2.5', erreurStatuts ? 'border-destructive/50' : 'border-border')}>
              {statutsDoc ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2" aria-live="polite">
                  <FileText className="size-icone flex-none text-success" strokeWidth={1.75} aria-hidden="true" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-medium">{statutsDoc.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{td('fichierChoisi', { taille: tailleLisible(statutsDoc.size) })}</p>
                  </div>
                  <button
                    type="button"
                    className="flex-none rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => fichierRef.current?.click()}
                  >
                    {td('changer')}
                  </button>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-w-0 px-2"
                  aria-label={td('photoAria')}
                  onClick={() => photoRef.current?.click()}
                >
                  <Camera className="size-4 flex-none" aria-hidden="true" />
                  <span className="truncate">{td('prendrePhoto')}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-w-0 px-2"
                  aria-label={td('fichierAria')}
                  onClick={() => fichierRef.current?.click()}
                >
                  <Upload className="size-4 flex-none" aria-hidden="true" />
                  <span className="truncate">{td('choisirFichier')}</span>
                </Button>
              </div>
            </div>
            <p id={`${id}-statuts-aide`} className="mt-1 text-xs text-muted-foreground">
              {t('hints.statuts_doc')}
            </p>
            {erreurStatuts ? (
              <p id={`${id}-statuts-erreur`} className="mt-1 text-xs text-destructive">
                {erreurStatuts}
              </p>
            ) : null}
          </fieldset>
        </div>

        {erreurGenerale ? (
          <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-pretty">
            {erreurGenerale}
          </p>
        ) : null}

        {/* Au bureau, l'envoi et ce qui suit ; au téléphone, la barre collante du bas. */}
        <div className="mt-5 flex items-center gap-4 max-md:hidden">
          <Button type="submit" size="xl" className="flex-none px-6" aria-busy={submitting || undefined}>
            {libelleEnvoi}
          </Button>
          <p className="min-w-0 flex-1 text-ui text-pretty text-muted-foreground">{td('suivi')}</p>
        </div>
        <p className="mt-4 text-ui text-pretty text-muted-foreground md:hidden">{td('suivi')}</p>
      </form>
      <BarreDAction>
        <Button type="submit" form={formId} aria-busy={submitting || undefined}>
          {libelleEnvoi}
        </Button>
      </BarreDAction>
    </>
  );
}

function tailleLisible(octets: number): string {
  const mo = octets / (1024 * 1024);
  return mo >= 1 ? `${mo.toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;
}
