'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, ChevronRight, ChevronUp, CircleAlert, Loader2, UserRoundCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Controller, useFormState, useWatch, type Control } from 'react-hook-form';

import { createCustomerAction, type CustomerDuplicateMatch } from '@/app/actions/dashboard-customers';
import { FormError, FormGlobalError, FormInput, FormSelect } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { PhoneInput } from '@/components/ui/phone-input';
import { useApiForm } from '@/hooks/useApiForm';
import { useAvertissementDepart } from '@/hooks/useAvertissementDepart';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { localeDisplayLabel, type Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import { initiales } from '@/lib/fiche-publique';
import { formaterTelephone } from '@/lib/phone';
import { type DoublonSonde, useSondeDeDoublon } from '@/lib/queries/customer-duplicates';
import {
  CUSTOMER_LOCALE_DEFAULT,
  customerFormSchema,
  customerLocaleValues,
  idTypeValues,
  normaliseCustomerForm,
  pipelineStageValues,
  sansCriteres,
  sansStatut,
  type CustomerFormValues,
} from '@/lib/schemas/customer';
import { cn } from '@/lib/utils';
import type { CustomerDetail } from '@/types/customer';

import { valeursDeCreation } from '../CustomerForm';
import { ChampsDeLaRecherche } from './ChampsDeLaRecherche';

/**
 * TCK-2590 — la création d'un client en deux temps (maquette `app-clients` a, « Nouveau client : qui »
 * et « Nouveau client : sa recherche ») : 1) prénom, nom, téléphone — le doublon paraît pendant la
 * frappe (`GET /api/customers/duplicates`) ; 2) sa recherche : Louer / Acheter, six types courants
 * et « Plus », les quartiers en pastilles, le budget par paliers. « Compléter plus tard » crée la fiche
 * sans sa recherche. Plein écran au téléphone (sous `xl`, deux étapes) ; panneau de 480 px au bureau,
 * d'un seul tenant.
 *
 * Rien ne se perd du formulaire d'avant (`CustomerForm`, qui garde l'édition) : même schéma, mêmes
 * champs — profession, langue, étape, villes, budget minimum, chambres, pièce d'identité sous « Plus
 * de champs » —, le doublon à l'envoi (409) et « Créer quand même », les erreurs 422, la garde de
 * sortie, la redirection vers la fiche, et le préremplissage depuis une visite (TCK-2581, TCK-2716).
 */

export interface CreationDuClientProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** TCK-2581 — « Créer sa fiche » depuis la suite d'une visite : son nom et son téléphone. */
  readonly initial?: { readonly first_name?: string; readonly last_name?: string; readonly phone?: string };
  /** TCK-2716 — la visite d'où naît la fiche, envoyée en `property_visit_id`. */
  readonly visiteDOrigine?: number;
}

const CHAMPS_DE_L_IDENTITE = ['first_name', 'last_name', 'phone', 'email'] as const;
const cleDuContact = (phone: string | undefined, email: string | undefined) => `${(phone ?? '').trim()}|${(email ?? '').trim().toLowerCase()}`;

export function CreationDuClient({ open, onClose, initial, visiteDOrigine }: CreationDuClientProps) {
  const t = useTranslations('crm.creation');
  const tCrm = useTranslations('agentCrm.form');
  const router = useRouter();
  const large = useMatchesMedia('(width >= 80rem)');
  const [etape, setEtape] = useState<1 | 2>(1);
  const [aLaFin, setALaFin] = useState<CustomerDuplicateMatch[] | null>(null);
  // « Créer quand même » vaut pour la saisie d'alors (téléphone et e-mail) : une autre saisie se resonde.
  const autoriserDoublon = useRef<string | null>(null);
  const sansRecherche = useRef(false);
  // Un 409 (doublon à l'envoi) se tranche à l'étape de l'identité, où l'alerte se lit.
  const retourALIdentite = useRef(false);

  const { form, isSubmitting, globalError, handleSubmit } = useApiForm<CustomerFormValues, CustomerDetail>({
    schema: customerFormSchema,
    defaultValues: { ...valeursDeCreation(), ...Object.fromEntries(Object.entries(initial ?? {}).filter(([, v]) => Boolean(v))) },
    onSubmit: async (values) => {
      const normalise = normaliseCustomerForm(values);
      const payload = {
        ...(sansRecherche.current ? sansCriteres(normalise) : normalise),
        ...(autoriserDoublon.current === cleDuContact(values.phone, values.email) ? { allow_duplicate: true } : {}),
      };
      sansRecherche.current = false;
      setALaFin(null);
      const result = await createCustomerAction({
        ...sansStatut(payload),
        ...(visiteDOrigine !== undefined ? { property_visit_id: visiteDOrigine } : {}),
      });
      if (!result.ok) {
        if (result.duplicates) {
          setALaFin(result.duplicates);
          retourALIdentite.current = true;
        }
        throw new ApiError(result.status ?? 500, { message: result.message, errors: result.errors });
      }
      return result.data as CustomerDetail;
    },
    onSuccess: async (cree) => {
      router.push(`/app/customers/${cree.id}`);
      router.refresh();
    },
  });
  const { control } = form;
  const { isDirty } = useFormState({ control });
  useAvertissementDepart(isDirty);

  const [prenom, nom, phone, email] = useWatch({ control, name: ['first_name', 'last_name', 'phone', 'email'] });
  const sonde = useSondeDeDoublon(phone ?? '', email ?? '', open);
  const deuxTemps = !large;

  const envoyer = async (options: { sansRecherche?: boolean; doublon?: boolean } = {}) => {
    sansRecherche.current = options.sansRecherche ?? false;
    retourALIdentite.current = false;
    if (options.doublon) autoriserDoublon.current = cleDuContact(phone, email);
    await handleSubmit();
    // Une erreur sur l'identité (422, doublon) se corrige à la première étape.
    if (deuxTemps && (retourALIdentite.current || CHAMPS_DE_L_IDENTITE.some((c) => form.getFieldState(c).error))) setEtape(1);
  };

  const continuer = async () => {
    if (await form.trigger([...CHAMPS_DE_L_IDENTITE])) setEtape(2);
  };

  // Vérification adverse de TCK-2590 — fermer (« Annuler », Échap, le voile) abandonne la saisie : le
  // panneau reste monté par la liste, et sans `reset()` le brouillon revenait à la réouverture (la
  // frappe s'ajoutait à l'ancienne), avec l'alerte de doublon et l'avertissement de départ encore armés.
  const fermer = () => {
    form.reset();
    setALaFin(null);
    autoriserDoublon.current = null;
    setEtape(1);
    onClose();
  };

  const premier = (prenom ?? '').trim();
  // « Créer la fiche d’Astou », « de Mariama » : l'élision devant une voyelle (le h, aspiré ou non, ne la commande pas ici).
  const titreCreer = premier ? t('creerLaFicheDe', { prenom: premier, elision: /^[aeiouyàâäéèêëîïôöûüœæ]/i.test(premier) ? 'oui' : 'non' }) : t('creerLaFiche');
  const enCours = isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null;

  const pied = !deuxTemps ? (
    <>
      <Button type="button" variant="ghost" onClick={fermer} disabled={isSubmitting}>
        {t('annuler')}
      </Button>
      <Button type="button" onClick={() => void envoyer()} disabled={isSubmitting}>
        {enCours}
        {t('creerLaFiche')}
      </Button>
    </>
  ) : etape === 1 ? (
    // La maquette pose « 20 secondes : le reste se complète plus tard » SOUS le bouton, dans la barre.
    <div className="flex flex-col gap-2">
      <Button type="button" size="xl" className="rounded-xl font-semibold" onClick={() => void continuer()}>
        {t('continuer')}
        <ArrowRight aria-hidden="true" />
      </Button>
      <p className="text-center text-ui leading-normal text-muted-foreground">{t('vingtSecondes')}</p>
    </div>
  ) : (
    // Empilés, comme la maquette : l'action principale, puis « Compléter plus tard » en texte.
    <div className="flex flex-col gap-1">
      <Button type="button" size="xl" className="rounded-xl font-semibold" onClick={() => void envoyer()} disabled={isSubmitting}>
        {enCours}
        {titreCreer}
      </Button>
      <Button type="button" variant="ghost" size="lg" className="font-semibold text-encre-douce" onClick={() => void envoyer({ sansRecherche: true })} disabled={isSubmitting}>
        {t('completerPlusTard')}
      </Button>
    </div>
  );

  const doublons = aLaFin ? (
    <AlerteDoublon
      doublons={aLaFin.map((d) => ({ id: d.id, name: d.name, stage: null }))}
      action={
        <button type="button" onClick={() => void envoyer({ doublon: true })} disabled={isSubmitting} className="text-ui font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline">
          {tCrm('duplicate.createAnyway')}
        </button>
      }
    />
  ) : sonde.doublons.length > 0 ? (
    <AlerteDoublon
      doublons={sonde.doublons}
      memeNumero={Boolean(phone) && !email}
      action={
        <button
          type="button"
          onClick={() => {
            autoriserDoublon.current = cleDuContact(phone, email);
            if (!deuxTemps) void envoyer({ doublon: true });
            else void continuer();
          }}
          className="text-ui font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
        >
          {t('creerQuandMeme')}
        </button>
      }
    />
  ) : null;

  const identite = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Requis sans astérisque, comme la maquette : l'erreur le dit à l'envoi, `aria-required` au lecteur d'écran. */}
        <FormInput control={control} name="first_name" label={t('prenom')} aria-required autoComplete="off" />
        <FormInput control={control} name="last_name" label={t('nom')} aria-required autoComplete="off" />
      </div>
      <ChampsDeContact control={control} emailOuvert={Boolean(email)} doublon={doublons !== null} />
      {doublons}
    </div>
  );

  return (
    <PanneauDroit
      open={open}
      formulaire
      onOpenChange={(o) => !o && fermer()}
      titre={t('titre')}
      sousTitre={deuxTemps ? (etape === 1 ? t('etapeQui') : t('etapeCherche')) : undefined}
      pied={pied}
    >
      <form
        id="creation-du-client"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (deuxTemps && etape === 1) void continuer();
          else void envoyer();
        }}
        // Le corps plein écran du panneau commence à 20 px ; la maquette, à 16.
        className={cn('space-y-4', deuxTemps && '-mt-1')}
      >
        <FormGlobalError>{globalError && !aLaFin ? globalError : null}</FormGlobalError>
        {!deuxTemps ? (
          <>
            {identite}
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-corps font-semibold">{t('ceQuIlCherche')}</p>
              <ChampsDeLaRecherche control={control} />
            </div>
            <PlusDeChamps control={control} />
          </>
        ) : etape === 1 ? (
          <>
            {identite}
            <p className="flex items-start gap-2 text-ui leading-snug text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
              {t('sondeAide')}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
              <span aria-hidden="true" className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-fond-avatar text-ui leading-normal font-semibold text-encre-avatar">
                {initiales(`${prenom ?? ''} ${nom ?? ''}`.trim() || '?')}
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                <span className="block truncate text-sm font-semibold">{`${prenom ?? ''} ${nom ?? ''}`.trim()}</span>
                <span className="block truncate text-ui text-muted-foreground tabular-nums">{phone ? formaterTelephone(phone) : email}</span>
              </span>
              <button type="button" onClick={() => setEtape(1)} className="relative text-ui leading-normal font-medium text-primary outline-none after:absolute after:-inset-3 focus-visible:underline">
                {t('modifier')}
              </button>
            </div>
            <ChampsDeLaRecherche control={control} />
            {/* Sous le pouce, la maquette renvoie le reste à « Modifier » de la fiche, qui porte tous ces champs. */}
            <p className="text-ui text-muted-foreground">{t('plusTardDansModifier')}</p>
          </>
        )}
      </form>
    </PanneauDroit>
  );
}

/** Téléphone (+221 en préfixe) et, sur « ou un e-mail », l'e-mail — l'un des deux suffit. */
function ChampsDeContact({ control, emailOuvert, doublon }: { readonly control: Control<CustomerFormValues>; readonly emailOuvert: boolean; readonly doublon: boolean }) {
  const t = useTranslations('crm.creation');
  const tForm = useTranslations('crm.form');
  const [ouvert, setOuvert] = useState(emailOuvert);
  return (
    <>
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <div className="w-full">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label htmlFor="creation-telephone" className="text-sm font-medium">
                {tForm('phone')}
              </label>
              {ouvert ? null : (
                <button type="button" onClick={() => setOuvert(true)} className="text-sm text-primary outline-none hover:underline focus-visible:underline">
                  {t('ouUnEmail')}
                </button>
              )}
            </div>
            <PhoneInput
              id="creation-telephone"
              value={field.value ?? ''}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              aide={false}
              // Le numéro qui désigne déjà une fiche se cercle comme l'alerte qu'il fait paraître (maquette a-3).
              className={doublon ? 'border-warning' : undefined}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? 'creation-telephone-erreur' : undefined}
            />
            <FormError id="creation-telephone-erreur">{fieldState.error?.message}</FormError>
          </div>
        )}
      />
      {ouvert ? <FormInput control={control} name="email" label={tForm('email')} type="email" autoComplete="off" /> : null}
    </>
  );
}

/** « Déjà dans vos clients » : la fiche (ouvrable si on la lit), son étape, et « Créer quand même ». */
function AlerteDoublon({ doublons, memeNumero, action }: { readonly doublons: readonly DoublonSonde[]; readonly memeNumero?: boolean; readonly action: ReactNode }) {
  const t = useTranslations('crm.creation');
  const tCrm = useTranslations('agentCrm.form');
  const tStage = useTranslations('crm.pipeline.stage');
  return (
    <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <UserRoundCheck className="size-4 text-warning" aria-hidden="true" />
        {t('dejaDansVosClients')}
      </p>
      <ul className="mt-2 space-y-1.5">
        {doublons.map((d, i) => {
          const nom = d.name ?? tCrm('duplicate.hidden');
          const detail = [d.stage && tStage.has(d.stage) ? tStage(d.stage) : null, memeNumero ? t('memeNumero') : null].filter(Boolean).join(' · ');
          const corps = (
            <>
              <span aria-hidden="true" className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-fond-avatar text-ui leading-normal font-semibold text-encre-avatar">
                {d.name ? initiales(d.name) : '?'}
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                <span className="block truncate text-sm font-semibold">{nom}</span>
                {detail ? <span className="block truncate text-ui text-muted-foreground">{detail}</span> : null}
              </span>
              {d.id !== null ? <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" /> : null}
            </>
          );
          return (
            <li key={d.id ?? `masquee-${i}`}>
              {d.id !== null ? (
                <Link href={`/app/customers/${d.id}`} aria-label={t('ouvrirLaFiche', { nom })} className="flex items-center gap-3 rounded-lg bg-card p-2.5 ring-1 ring-border outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
                  {corps}
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-card p-2.5 ring-1 ring-border">{corps}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex">{action}</div>
    </div>
  );
}

/** « Plus de champs » : profession, langue, étape, villes, budget minimum, chambres, pièce d'identité. */
function PlusDeChamps({ control }: { readonly control: Control<CustomerFormValues> }) {
  const t = useTranslations('crm.creation');
  const tForm = useTranslations('crm.form');
  const tCrm = useTranslations('agentCrm.form');
  const tStage = useTranslations('crm.pipeline.stage');
  const tIdType = useTranslations('crm.idTypes');
  const locale = useLocale() as Locale;
  const [ouvert, setOuvert] = useState(false);
  const Chevron = ouvert ? ChevronUp : ChevronDown;
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={ouvert}
        aria-controls="creation-plus"
        onClick={() => setOuvert((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3.5 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        {t('plusDeChamps')}
        <span className="min-w-0 truncate text-muted-foreground">· {t('plusDeChampsDetail')}</span>
        <Chevron className="ml-auto size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </button>
      {ouvert ? (
        <div id="creation-plus" className="space-y-3 border-t border-border p-3.5">
          <FormInput control={control} name="occupation" label={tForm('occupation')} placeholder={t('facultatif')} />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect
              control={control}
              name="locale"
              label={tForm('locale')}
              options={[{ value: CUSTOMER_LOCALE_DEFAULT, label: tForm('localeDefault') }, ...customerLocaleValues.map((v) => ({ value: v, label: localeDisplayLabel(v, locale) }))]}
              placeholder={tForm('localeDefault')}
            />
            <FormInput control={control} name="min_bedrooms" label={t('chambresAuMoins')} placeholder={t('indifferent')} inputMode="numeric" />
            <FormSelect control={control} name="id_type" label={t('pieceDIdentite')} options={idTypeValues.map((v) => ({ value: v, label: tIdType(v) }))} placeholder={tForm('idTypePlaceholder')} />
            <FormInput control={control} name="id_number" label={tForm('idNumber')} placeholder={t('facultatif')} />
            <FormSelect control={control} name="pipeline_stage" label={tForm('pipelineStage')} options={pipelineStageValues.map((v) => ({ value: v, label: tStage(v) }))} />
            <FormInput control={control} name="budget_min" label={tCrm('criteria.budgetMin')} inputMode="decimal" />
          </div>
          <FormInput control={control} name="seeking_cities" label={tCrm('criteria.cities')} placeholder={tCrm('criteria.citiesPlaceholder')} />
        </div>
      ) : null}
    </div>
  );
}
