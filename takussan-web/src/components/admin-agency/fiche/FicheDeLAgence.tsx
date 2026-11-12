'use client';

import { useEffect, useRef, useState, type MouseEvent as EvenementSouris } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { FormProvider, useFormState, useWatch } from 'react-hook-form';
import {
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronRight,
  ExternalLink,
  ListChecks,
  Loader2,
  Receipt,
  Scale,
  Store,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { FormGlobalError, FormSuccess } from '@/components/forms';
import { Button, buttonVariants } from '@/components/ui/button';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { updateAgencyAction } from '@/app/actions/admin-agency';
import { useApiForm } from '@/hooks/useApiForm';
import { ApiError } from '@/lib/api';
import {
  clesModifiees,
  champsModifies,
  completudeDeLaFiche,
  corpsDeLaFiche,
  entreesARemplir,
  erreursSurLeurChamp,
  estSectionDeLaFiche,
  etatDesSections,
  ficheDeLAgenceSchema,
  idDuChamp,
  numerosDuDossier,
  OU_SE_REMPLIT,
  ouSeRemplitLEntree,
  rebaserLaSaisie,
  referenceApresEnregistrement,
  repriseDesNumeros,
  sectionDeLaCle,
  sectionsEnErreur,
  sectionsMontrees,
  valeursDeLAgence,
  verificationAJour,
  type Completude,
  type EntreeAManquer,
  type EtatDeSection,
  type SectionDeLaFiche,
  type ValeursDeLaFiche,
} from '@/lib/agence/fiche';
import { avecGardeDoubleFacteurAction } from '@/lib/double-facteur';
import { fetchAgencyKyc } from '@/lib/queries/kyc';
import { agencyKycKey } from '@/lib/queries/agency-queues';
import { reglagesDeLaFiche } from '@/lib/schemas/agency';
import { CODES_DE_MODULE } from '@/lib/navigation/modules';
import { cn } from '@/lib/utils';
import type { Agency } from '@/types/agency';
import type { KycDossier } from '@/types/super-admin';

import { FournisseurDeLaFiche, type ContexteDeLaFiche } from './contexte';
import { BarreDeCompletude, LogoDeLAgence, PointDEtat } from './pieces';
import { AdresseEnLigne } from './AdresseEnLigne';
import { DialogueDeSortie, useGardeDeSortie } from './garde-de-sortie';
import { SectionFacturation } from './SectionFacturation';
import { SectionFichePublique } from './SectionFichePublique';
import { SectionIdentite } from './SectionIdentite';
import { SectionMenu } from './SectionMenu';
import { SectionPaiement } from './SectionPaiement';
import { SectionRegles } from './SectionRegles';

/** L'`id` du formulaire unique : la barre du téléphone, rendue en portail hors de lui, le nomme. */
export const ID_DU_FORMULAIRE = 'fiche-de-l-agence';

const ICONES: Readonly<Record<SectionDeLaFiche, LucideIcon>> = {
  identite: Building2,
  publique: Store,
  paiement: Wallet,
  facturation: Receipt,
  verification: BadgeCheck,
  regles: Scale,
  menu: ListChecks,
  offre: Briefcase,
};

/**
 * Les deux sections qui sont des PAGES (TCK-2671) : leur ligne y mène, et ces pages posent le même
 * cadre ({@link CadreDeLaFiche}). L'offre est une page pour toute agence : « déjà professionnelle »
 * et son offre pour une agence `standard` (avec son lien vers l'abonnement), le passage en pro pour
 * une `individual`.
 */
export function lienExterne(section: SectionDeLaFiche): string | null {
  if (section === 'verification') return '/app/agency/kyc';
  if (section === 'offre') return '/app/settings/agency/upgrade';
  return null;
}

/** Le titre d'une section : la facturation et l'offre d'une agence individuelle ont le leur. */
export function titreDeLaSection(
  tFiche: ReturnType<typeof useTranslations<'admin.agencyConfig.fiche'>>,
  section: SectionDeLaFiche,
  individuelle: boolean,
): string {
  if (individuelle && section === 'facturation') return tFiche('sections.facturation.titreIndividuelle');
  if (individuelle && section === 'offre') return tFiche('sections.offre.titreIndividuelle');
  return tFiche(`sections.${section}.titre`);
}

/** Le libellé de chaque champ, pour la barre du bureau (« 2 modifications · Téléphone, Site internet »). */
type CleDeLibelle = readonly [espace: 'config' | 'vitrine' | 'paiement' | 'argent' | 'fiche', cle: string];
const LIBELLES_DES_CHAMPS: Readonly<Record<string, CleDeLibelle>> = {
  name: ['config', 'fields.name'],
  slug: ['config', 'fields.slugEditable'],
  license_number: ['config', 'fields.license'],
  description: ['config', 'fields.description'],
  email: ['config', 'fields.email'],
  phone: ['config', 'fields.phone'],
  website: ['config', 'fields.website'],
  commission_rate: ['config', 'fields.commission'],
  currency: ['fiche', 'champ.devise'],
  moderation_required: ['config', 'moderation.label'],
  late_fee_online_collection: ['config', 'lateFeeOnline.label'],
  require_team_two_factor: ['config', 'security.teamTwoFactorLabel'],
  hidden_modules: ['fiche', 'menu.titre'],
  default_tax_rate: ['argent', 'taxRate'],
  payout_approval_threshold: ['argent', 'threshold'],
  legal_name: ['argent', 'legalName'],
  ninea: ['argent', 'ninea'],
  rccm: ['argent', 'rccm'],
  legal_address: ['argent', 'legalAddress'],
  offline_payment_wave_number: ['paiement', 'wave'],
  offline_payment_orange_money_number: ['paiement', 'orangeMoney'],
  offline_payment_bank_details: ['paiement', 'bankDetails'],
  tagline: ['vitrine', 'tagline'],
  highlights: ['vitrine', 'highlights'],
  showcase_property_ids: ['vitrine', 'showcase'],
};

interface FicheDeLAgenceProps {
  readonly agency: Agency;
  /** `peutEcrireLaVitrine` : l'admin principal, ou qui tient `agency.update`. */
  readonly vitrine: boolean;
  /** Le filigrane est allumé pour la plateforme (TCK-633). */
  readonly filigranes: boolean;
  /** L'origine du site public (`origineSite()`), lue côté serveur. */
  readonly origineSite: string;
}

/**
 * TCK-2670 — la fiche de l'agence (`/app/agency`) : un sommaire avec sa complétude, une section par
 * écran au téléphone, deux colonnes au bureau, et UN formulaire pour toutes les sections — d'où une
 * seule barre « N modifications · Annuler · Enregistrer » et un seul `PATCH`, qui ne porte que les clés
 * modifiées (`corpsDeLaFiche`).
 *
 * La section est dans l'URL (`?section=paiement`) et se change par `history.pushState` : le formulaire,
 * monté AU-DESSUS de l'aiguillage, garde la saisie d'une section à l'autre, sans relire la page.
 *
 * Structure, téléphone (< md) : sans section, le sommaire (en-tête, jauge, une ligne par section) ;
 * avec, l'écran de la section, sa flèche de retour (garde de sortie) et la barre d'action de la coque.
 * Dès `md` : l'en-tête de page, la jauge, la navigation des sections (collante dès `xl`, en bandeau
 * au-dessous) et la section courante — `identite` sans section. Un seul arbre, découpé par CSS.
 */
export function FicheDeLAgence({ agency, vitrine, filigranes, origineSite }: FicheDeLAgenceProps) {
  const t = useTranslations('admin.agencyConfig');
  const tFiche = useTranslations('admin.agencyConfig.fiche');
  const locale = useLocale();
  const tCommon = useTranslations('common.actions');
  const tMoney = useTranslations('admin.agencyConfig.moneyOut');
  const router = useRouter();
  const garde = useGardeDoubleFacteur();
  const parametres = useSearchParams();
  const individuelle = agency.kind === 'individual';
  const montrees = sectionsMontrees({ individuelle, vitrine });

  // LA référence : la dernière agence ENREGISTRÉE (réponse de l'API, ou relue par `router.refresh()`).
  const [enregistree, setEnregistree] = useState<Agency>(agency);
  const [succes, setSucces] = useState<string | null>(null);
  // Le champ à focaliser une fois sa section montée : `n` change à chaque demande, même champ compris.
  const [focus, setFocus] = useState<{
    readonly champ: string;
    readonly n: number;
  } | null>(null);
  const indexDesPoints = useRef<readonly number[]>([]);

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } = useApiForm<ValeursDeLaFiche, Agency>({
    schema: ficheDeLAgenceSchema,
    defaultValues: valeursDeLAgence(agency),
    onSubmit: async (valeurs) => {
      const envoi = corpsDeLaFiche(valeurs, enregistree, { vitrine });
      indexDesPoints.current = envoi.indexDesPoints;
      if (Object.keys(envoi.corps).length === 0) return enregistree;
      const resultat = await avecGardeDoubleFacteurAction(() => updateAgencyAction(enregistree.id, envoi.corps), garde);
      if (!resultat.ok) {
        throw new ApiError(resultat.status ?? 500, {
          message: resultat.message,
          errors: erreursSurLeurChamp(resultat.errors, envoi.indexDesPoints),
        });
      }
      return resultat.data as Agency;
    },
    onSuccess: (lue, valeurs) => {
      const nouvelle = referenceApresEnregistrement(enregistree, lue);
      setEnregistree(nouvelle);
      // La réponse fait foi pour l'écran : un numéro rendu en E.164, une modération refusée (TCK-597).
      form.reset(valeursDeLAgence(nouvelle));
      const enAttente =
        nouvelle.pending_payout_threshold_change != null &&
        enregistree.pending_payout_threshold_change?.requested_at !== nouvelle.pending_payout_threshold_change.requested_at;
      if (!individuelle && (nouvelle.moderation_required ?? false) !== valeurs.moderation_required) {
        setSucces(t('moderation.notSaved'));
      } else {
        setSucces(enAttente ? tMoney('thresholdPendingSaved') : t('successSaved'));
      }
      router.refresh();
    },
  });

  // Une agence relue sans avoir été envoyée (logo déposé, seuil confirmé, puis `router.refresh()`) :
  // les champs non touchés suivent, la saisie en cours reste.
  const derniereProp = useRef(agency);
  useEffect(() => {
    if (derniereProp.current === agency) return;
    derniereProp.current = agency;
    relire(agency);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule l'arrivée d'une nouvelle agence compte.
  }, [agency]);

  function relire(lue: Agency) {
    setEnregistree((avant) => {
      const nouvelle = referenceApresEnregistrement(avant, lue);
      form.reset(rebaserLaSaisie(form.getValues(), avant, nouvelle, { vitrine }));
      return nouvelle;
    });
  }

  // La saisie entière, lue par `useWatch` (jamais `form.watch()` pendant le rendu : TCK-571).
  const valeurs = useWatch({ control: form.control }) as ValeursDeLaFiche;
  const corps = corpsDeLaFiche({ ...valeursDeLAgence(enregistree), ...valeurs }, enregistree, { vitrine }).corps;
  const modifiees = clesModifiees(corps);
  const modifies = champsModifies(corps);
  const nombre = modifiees.length;

  const { errors } = useFormState({ control: form.control });
  const clesEnErreur = Object.keys(errors).filter((c) => c !== 'root');
  const enErreur = sectionsEnErreur(Object.fromEntries(clesEnErreur.map((c) => [c, true])));

  // Le dossier de vérification : la jauge le compte, la reprise des numéros le lit.
  const kyc = useQuery({
    queryKey: agencyKycKey(agency.id),
    queryFn: () => fetchAgencyKyc(agency.id),
    staleTime: 60_000,
    retry: false,
  });
  const dossier: KycDossier | null = kyc.data?.data ?? null;
  const verification = kyc.isError ? null : dossier ? verificationAJour(dossier) : kyc.isSuccess ? false : null;
  const completude: Completude | null = kyc.isPending ? null : completudeDeLaFiche(enregistree, verification);
  const etats = completude ? etatDesSections(completude, enErreur, dossier) : null;
  const numeros = numerosDuDossier(dossier);

  // La section courante : celle de l'URL, si la fiche la montre et qu'elle a un écran ici.
  const demandee = parametres?.get('section');
  const section: SectionDeLaFiche | null =
    estSectionDeLaFiche(demandee) && montrees.includes(demandee) && lienExterne(demandee) === null ? demandee : null;
  const affichee: SectionDeLaFiche = section ?? 'identite';

  function allerA(cible: SectionDeLaFiche | null, champ: string | null = null) {
    const url = new URL(window.location.href);
    if (cible) url.searchParams.set('section', cible);
    else url.searchParams.delete('section');
    url.hash = '';
    window.history.pushState(null, '', `${url.pathname}${url.search}`);
    if (champ) demanderLeFocus(champ);
  }

  function demanderLeFocus(champ: string) {
    setFocus((avant) => ({ champ, n: (avant?.n ?? 0) + 1 }));
  }

  // Un lien de la jauge ouvre son champ : focalisé une fois la section montée.
  useEffect(() => {
    if (!focus) return;
    const element = document.getElementById(idDuChamp(focus.champ));
    if (!element) return;
    element.scrollIntoView({ block: 'center' });
    element.focus({ preventScroll: true });
  }, [focus]);

  // Un envoi refusé (schéma ou 422) dont l'erreur est dans une autre section : on y mène, au champ.
  // `getFieldState` lit l'état COURANT du formulaire ; `form.formState`, lu ici, serait celui du rendu
  // qui a créé ce gestionnaire, d'avant l'envoi.
  async function soumettre(ev: React.FormEvent<HTMLFormElement>) {
    await handleSubmit(ev);
    const valeursCourantes = form.getValues();
    const enErreurApres = Object.keys(valeursCourantes).filter((c) => form.getFieldState(c as keyof ValeursDeLaFiche).invalid);
    const premiere = sectionsEnErreur(Object.fromEntries(enErreurApres.map((c) => [c, true])))[0];
    if (!premiere) return;
    const cle = enErreurApres.find((c) => sectionDeLaCle(c) === premiere) ?? null;
    const ligne = cle === 'highlights' ? valeursCourantes.highlights.findIndex((_, i) => form.getFieldState(`highlights.${i}`).invalid) : -1;
    const visee = cle === 'highlights' && ligne >= 0 ? `highlights.${ligne}` : cle;
    if (premiere !== affichee) allerA(premiere, visee);
    else if (visee) demanderLeFocus(visee);
  }

  function annuler() {
    form.reset(valeursDeLAgence(enregistree));
    clearGlobalError();
  }

  const sortie = useGardeDeSortie(nombre > 0, annuler);

  /** Un lien de section : un vrai `<a>`, intercepté pour garder le formulaire monté. */
  function surLienDeSection(cible: SectionDeLaFiche | null, champ: string | null = null) {
    return (ev: EvenementSouris<HTMLAnchorElement>) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
      ev.preventDefault();
      allerA(cible, champ);
    };
  }

  const titreDeSection = (s: SectionDeLaFiche) => titreDeLaSection(tFiche, s, individuelle);

  const libelleDuChamp = (champ: string): string => {
    const cle = LIBELLES_DES_CHAMPS[champ];
    if (!cle) return champ;
    const [espace, chemin] = cle;
    if (espace === 'config') return t(chemin);
    if (espace === 'argent') return tMoney(chemin);
    if (espace === 'paiement') return t(`offlinePayment.${chemin}`);
    if (espace === 'vitrine') return tFiche(`champ.vitrine.${chemin}`);
    return tFiche(chemin);
  };

  const contexte: ContexteDeLaFiche = {
    agence: enregistree,
    individuelle,
    vitrine,
    filigranes,
    adressePublique: `${origineSite.replace(/^https?:\/\//, '')}/agencies/${enregistree.slug}`,
    cheminPublic: `/agencies/${enregistree.slug}`,
    modifies,
    manquants: completude?.manquants ?? [],
    completude,
    numerosDuDossier: numeros,
    surAgenceRelue: relire,
    annoncer: setSucces,
  };

  const detail = (s: SectionDeLaFiche) =>
    detailDeLaSection(s, {
      completude,
      valeurs: { ...valeursDeLAgence(enregistree) },
      individuelle,
      dossier,
      verification,
      numeros,
      tFiche,
      locale,
    });

  const sectionCourante = {
    identite: <SectionIdentite />,
    publique: <SectionFichePublique />,
    paiement: <SectionPaiement />,
    facturation: <SectionFacturation />,
    regles: <SectionRegles />,
    menu: <SectionMenu />,
    verification: null,
    offre: null,
  }[affichee];

  const enregistrer = (
    <Button type="submit" form={ID_DU_FORMULAIRE} disabled={isSubmitting} className="px-6">
      {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {isSubmitting ? t('submit.saving') : tCommon('save')}
    </Button>
  );

  return (
    <FournisseurDeLaFiche value={contexte}>
      <FormProvider {...form}>
        {/* Au téléphone, la fiche pose ses propres marges (16 px, la maquette) : la coque n'en met aucune. */}
        <PagePleineLargeur>
          {/* L'en-tête du téléphone : le nom de la section, sa flèche vers le sommaire ; la barre d'onglets
            s'efface devant « Enregistrer » tant qu'il y a des modifications (TCK-2635). */}
          {section ? (
            <DeclarerEnTete titre={tFiche(`sections.${section}.titreCourt`)} forme="detail" repli="/app/agency" formulaire={nombre > 0} />
          ) : nombre > 0 ? (
            <DeclarerEnTete formulaire />
          ) : null}

          <div className="max-md:hidden">
            <PageHeader
              title={tFiche('titre')}
              description={<AdresseEnLigne adresse={contexte.adressePublique} />}
              actions={
                <a href={contexte.cheminPublic} target="_blank" rel="noopener" className={buttonVariants({ variant: 'outline' })}>
                  <ExternalLink aria-hidden="true" />
                  {tFiche('voirMaFichePublique')}
                </a>
              }
            />
          </div>

          {section === null ? (
            <SommaireDuTelephone
              agence={enregistree}
              adressePublique={contexte.adressePublique}
              cheminPublic={contexte.cheminPublic}
              completude={completude}
              reprise={
                Object.keys(
                  repriseDesNumeros(
                    {
                      ninea: enregistree.ninea ?? '',
                      rccm: enregistree.rccm ?? '',
                    },
                    numeros,
                  ),
                ).length > 0
              }
              montrees={montrees}
              etats={etats}
              titre={titreDeSection}
              detail={detail}
              lien={lienExterne}
              surLien={surLienDeSection}
            />
          ) : null}

          <div className={cn('mt-6 space-y-6 max-md:mt-0 max-md:px-4 max-md:py-4', section === null && 'max-md:hidden')}>
            <JaugeDuBureau completude={completude} surLien={surLienDeSection} />
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
              <NavigationDesSections
                montrees={montrees}
                active={affichee}
                etats={etats}
                titre={titreDeSection}
                lien={lienExterne}
                surLien={surLienDeSection}
              />
              <form id={ID_DU_FORMULAIRE} onSubmit={(ev) => void soumettre(ev)} noValidate className="min-w-0 flex-1">
                {globalError ? (
                  <FormGlobalError className="mb-5">
                    <span className="flex items-center justify-between gap-4">
                      <span>{globalError}</span>
                      <button type="button" onClick={clearGlobalError} className="text-xs underline">
                        {tCommon('close')}
                      </button>
                    </span>
                  </FormGlobalError>
                ) : null}
                {succes && nombre === 0 ? (
                  <FormSuccess className="mb-5">
                    <span className="flex items-center justify-between gap-4">
                      <span>{succes}</span>
                      <button type="button" onClick={() => setSucces(null)} className="text-xs underline">
                        {tCommon('close')}
                      </button>
                    </span>
                  </FormSuccess>
                ) : null}
                {sectionCourante}
              </form>
            </div>
          </div>

          {nombre > 0 ? (
            <>
              {/* Au téléphone : la barre d'action de la coque, à la place de la barre d'onglets. */}
              <BarreDAction>
                <div className="flex w-full items-center gap-3" data-slot="barre-de-la-fiche-telephone">
                  <p className="min-w-0 flex-1 text-ui leading-tight text-muted-foreground" aria-live="polite">
                    <span className="font-medium text-foreground">{tFiche('barre.compte', { n: nombre })}</span>
                    <br />
                    {tFiche('barre.nonEnregistrees', { n: nombre })}
                  </p>
                  <Button type="button" variant="ghost" className="flex-none px-3" onClick={annuler} disabled={isSubmitting}>
                    {tCommon('cancel')}
                  </Button>
                  <span className="flex-none">{enregistrer}</span>
                </div>
              </BarreDAction>
              {/* Dès `md` : UNE barre collante en bas de la page, pour toutes les sections. */}
              <div
                data-slot="barre-de-la-fiche"
                className="sticky bottom-0 z-10 -mx-6 mt-6 flex items-center gap-3 border-t border-border bg-card px-6 py-3 shadow-barre-collante max-md:hidden lg:-mx-8 lg:px-8"
              >
                <span className="size-2 flex-none rounded-full bg-primary" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">
                  {tFiche('barre.bureau', {
                    n: nombre,
                    champs: [...modifies].map(libelleDuChamp).join(', '),
                  })}
                </p>
                <Button type="button" variant="ghost" onClick={annuler} disabled={isSubmitting}>
                  {tCommon('cancel')}
                </Button>
                {enregistrer}
              </div>
            </>
          ) : null}

          <DialogueDeSortie {...sortie} nombre={nombre} />
        </PagePleineLargeur>
      </FormProvider>
    </FournisseurDeLaFiche>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Le sommaire (téléphone), la jauge et la navigation (bureau)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * L'interception d'un lien de section, qui garde le formulaire monté (`history.pushState`). `null`
 * hors de la fiche ({@link CadreDeLaFiche}) : le lien est une navigation vers `/app/agency`.
 */
type SurLien = ((cible: SectionDeLaFiche | null, champ?: string | null) => (ev: EvenementSouris<HTMLAnchorElement>) => void) | null;

/** La racine des liens de section : relative dans la fiche, `/app/agency` depuis une page du cadre. */
const RACINE_DE_LA_FICHE = '/app/agency';

function hrefDe(section: SectionDeLaFiche, champ?: string | null): string {
  return `?section=${section}${champ ? `#${idDuChamp(champ)}` : ''}`;
}

function TitreDeLEntree({ entree }: { readonly entree: EntreeAManquer }) {
  const t = useTranslations('admin.agencyConfig.fiche.elements');
  return <>{t(`${entree}.titre`)}</>;
}

function DetailDeLEntree({ entree, reprise }: { readonly entree: EntreeAManquer; readonly reprise: boolean }) {
  const t = useTranslations('admin.agencyConfig.fiche.elements');
  return <>{entree === 'ninea_et_rccm' && reprise ? t('ninea_et_rccm.detailReprise') : t(`${entree}.detail`)}</>;
}

/** Un lien de la jauge : vers sa section et son champ, ou vers la page de la vérification. */
function LienDEntree({
  entree,
  surLien,
  className,
  children,
}: {
  readonly entree: EntreeAManquer;
  readonly surLien: SurLien;
  readonly className?: string;
  readonly children: React.ReactNode;
}) {
  const { section, champ } = ouSeRemplitLEntree(entree);
  if (section === 'verification') {
    return (
      <Link href="/app/agency/kyc" className={className}>
        {children}
      </Link>
    );
  }
  if (surLien === null) {
    return (
      <Link href={`${RACINE_DE_LA_FICHE}${hrefDe(section, champ)}`} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={hrefDe(section, champ)} onClick={surLien(section, champ)} className={className}>
      {children}
    </a>
  );
}

function SommaireDuTelephone({
  agence,
  adressePublique,
  cheminPublic,
  completude,
  reprise,
  montrees,
  etats,
  titre,
  detail,
  lien,
  surLien,
}: {
  readonly agence: Agency;
  readonly adressePublique: string;
  readonly cheminPublic: string;
  readonly completude: Completude | null;
  readonly reprise: boolean;
  readonly montrees: readonly SectionDeLaFiche[];
  readonly etats: Record<SectionDeLaFiche, EtatDeSection> | null;
  readonly titre: (s: SectionDeLaFiche) => string;
  readonly detail: (s: SectionDeLaFiche) => string;
  readonly lien: (s: SectionDeLaFiche) => string | null;
  readonly surLien: NonNullable<SurLien>;
}) {
  const t = useTranslations('admin.agencyConfig.fiche');
  const entrees = completude ? entreesARemplir(completude.manquants) : [];
  const premieres = entrees.slice(0, 2);
  const suivantes = entrees.slice(2);
  const tElements = useTranslations('admin.agencyConfig.fiche.elements');
  // La langue de l'interface, jamais celle du navigateur (`undefined`) : la liste suit le texte.
  const locale = useLocale();

  return (
    <div className="md:hidden" data-slot="sommaire-de-la-fiche">
      <div className="flex items-center gap-3.5 px-4 pt-4">
        <LogoDeLAgence url={agence.logo_url} nom={agence.name} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-affiche-22 font-semibold leading-tight tracking-titre">{agence.name}</p>
          <AdresseEnLigne adresse={adressePublique} grande className="mt-1" />
        </div>
      </div>

      <div className="p-4">
        <div className="rounded-xl border border-border bg-card">
          {completude ? (
            <>
              <div className="p-4 pb-3">
                <p className="font-display text-lg font-semibold tracking-titre">{t('jauge.titre', { pourcent: completude.pourcentage })}</p>
                <BarreDeCompletude pourcent={completude.pourcentage} className="mt-2.5" />
                <p className="mt-2 text-ui text-muted-foreground">
                  {entrees.length === 0
                    ? t('jauge.complete')
                    : t('jauge.lesDeuxDAbord', {
                        n: completude.manquants.length,
                        affichees: premieres.length,
                      })}
                </p>
              </div>
              {premieres.map((entree) => (
                <LienDEntree
                  key={entree}
                  entree={entree}
                  surLien={surLien}
                  className="flex min-h-14 items-center gap-3 border-t border-border/70 px-4 py-2"
                >
                  <span className="size-2.5 flex-none rounded-full bg-warning" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-corps font-medium text-primary">
                      <TitreDeLEntree entree={entree} />
                    </span>
                    <span className="block text-ui text-muted-foreground">
                      <DetailDeLEntree entree={entree} reprise={reprise} />
                    </span>
                  </span>
                  <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
                </LienDEntree>
              ))}
              {suivantes.length > 0 ? (
                <p className="border-t border-border/70 px-4 py-2.5 text-ui text-muted-foreground">
                  {t('jauge.ensuite', {
                    liste: new Intl.ListFormat(locale, {
                      type: 'conjunction',
                    }).format(suivantes.map((e) => tElements(`${e}.titre`))),
                  })}
                </p>
              ) : null}
            </>
          ) : (
            <div className="space-y-2.5 p-4" aria-busy="true">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
        </div>
      </div>

      <nav aria-label={t('sectionsDeLaFiche')}>
        <ul className="divide-y divide-border/70 border-y border-border/70 bg-card">
          {montrees.map((s) => {
            const Icone = ICONES[s];
            const etat = etats?.[s] ?? 'ok';
            // Le DÉTAIL d'une section à traiter s'écrit en rouge : un message, pas une pastille — la
            // pastille est `PointDEtat`. (Le décideur de ton des statuts reste `StatusBadge`.)
            const detailATraiter = etat === 'alerte';
            const externe = lien(s);
            const contenu = (
              <>
                <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-encre-douce">
                  <Icone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-corps font-medium">{titre(s)}</span>
                  <span className={cn('block truncate text-ui', detailATraiter ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    {detail(s)}
                  </span>
                </span>
                {etat === 'ok' ? null : <PointDEtat etat={etat} />}
                <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
              </>
            );
            const classes = 'flex min-h-[3.75rem] items-center gap-3 px-4 py-2';
            return (
              <li key={s}>
                {externe ? (
                  <Link href={externe} className={classes}>
                    {contenu}
                  </Link>
                ) : (
                  <a href={hrefDe(s)} onClick={surLien(s)} className={classes}>
                    {contenu}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <a
        href={cheminPublic}
        target="_blank"
        rel="noopener"
        className="flex min-h-11 items-center justify-center gap-1.5 px-4 py-5 text-sm font-medium text-primary"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        {t('voirMaFichePublique')}
      </a>
    </div>
  );
}

export function JaugeDuBureau({ completude, surLien }: { readonly completude: Completude | null; readonly surLien: SurLien }) {
  const t = useTranslations('admin.agencyConfig.fiche');
  if (completude === null) {
    return (
      <div className="flex items-center gap-6 rounded-xl border border-border bg-card px-5 py-4 max-md:hidden" aria-busy="true">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-8 flex-1" />
      </div>
    );
  }
  const entrees = entreesARemplir(completude.manquants);
  return (
    <div
      className="flex items-center gap-6 rounded-xl border border-border bg-card px-5 py-4 max-md:hidden max-lg:flex-col max-lg:items-stretch max-lg:gap-3"
      data-slot="jauge-de-la-fiche"
    >
      <div className="w-[14.375rem] flex-none max-lg:w-full">
        <p className="font-display text-lg font-semibold tracking-titre">{t('jauge.titre', { pourcent: completude.pourcentage })}</p>
        <BarreDeCompletude pourcent={completude.pourcentage} className="mt-2" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-ui text-muted-foreground">
          {entrees.length === 0 ? t('jauge.complete') : t('jauge.aRemplir', { n: completude.manquants.length })}
        </p>
        {entrees.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {entrees.map((entree) => (
              <LienDEntree
                key={entree}
                entree={entree}
                surLien={surLien}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-ui font-medium transition-colors hover:bg-muted"
              >
                <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
                <TitreDeLEntree entree={entree} />
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </LienDEntree>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NavigationDesSections({
  montrees,
  active,
  etats,
  titre,
  lien,
  surLien,
}: {
  readonly montrees: readonly SectionDeLaFiche[];
  readonly active: SectionDeLaFiche;
  readonly etats: Record<SectionDeLaFiche, EtatDeSection> | null;
  readonly titre: (s: SectionDeLaFiche) => string;
  readonly lien: (s: SectionDeLaFiche) => string | null;
  readonly surLien: SurLien;
}) {
  const t = useTranslations('admin.agencyConfig.fiche');
  return (
    <nav
      aria-label={t('sectionsDeLaFiche')}
      className="flex w-full gap-1 overflow-x-auto pb-1 max-md:hidden xl:sticky xl:top-6 xl:block xl:w-[17rem] xl:flex-none xl:overflow-visible xl:pb-0"
      data-slot="navigation-des-sections"
    >
      {montrees.map((s) => {
        const Icone = ICONES[s];
        const estActive = s === active;
        const externe = lien(s);
        const classes = cn(
          'flex min-h-11 flex-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-foreground/4',
          estActive ? 'bg-foreground/7 font-semibold' : 'text-encre-douce',
        );
        const contenu = (
          <>
            <Icone
              className={cn('size-icone flex-none', estActive ? 'text-primary' : 'text-muted-foreground')}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{titre(s)}</span>
            {etats ? <PointDEtat etat={etats[s]} /> : null}
          </>
        );
        const courante = estActive ? ('page' as const) : undefined;
        if (externe || surLien === null) {
          return (
            <Link key={s} href={externe ?? `${RACINE_DE_LA_FICHE}${hrefDe(s)}`} aria-current={courante} className={classes}>
              {contenu}
            </Link>
          );
        }
        return (
          <a key={s} href={hrefDe(s)} onClick={surLien(s)} aria-current={courante} className={classes}>
            {contenu}
          </a>
        );
      })}
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Le détail d'une ligne du sommaire
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function detailDeLaSection(
  section: SectionDeLaFiche,
  {
    completude,
    valeurs,
    individuelle,
    dossier,
    verification,
    numeros,
    tFiche,
    locale,
  }: {
    readonly completude: Completude | null;
    readonly valeurs: ValeursDeLaFiche;
    readonly individuelle: boolean;
    readonly dossier: KycDossier | null;
    readonly verification: boolean | null;
    readonly numeros: ReturnType<typeof numerosDuDossier>;
    readonly tFiche: ReturnType<typeof useTranslations<'admin.agencyConfig.fiche'>>;
    readonly locale: string;
  },
): string {
  const manquants = completude?.manquants ?? [];
  const liste = (elements: readonly string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(elements);
  const ici = (s: SectionDeLaFiche) => manquants.filter((e) => OU_SE_REMPLIT[e].section === s);
  switch (section) {
    case 'identite':
      return tFiche('sections.identite.detail');
    case 'publique': {
      const m = ici('publique');
      return m.length === 0
        ? tFiche('sections.publique.detail')
        : tFiche('detail.aRemplir', {
            liste: liste(m.map((e) => tFiche(`elements.${e}.titre`))),
          });
    }
    case 'paiement': {
      const presents = [
        valeurs.offline_payment_wave_number.trim() ? tFiche('detail.wave') : null,
        valeurs.offline_payment_orange_money_number.trim() ? tFiche('detail.orangeMoney') : null,
        valeurs.offline_payment_bank_details.trim() ? tFiche('detail.banque') : null,
      ].filter((x): x is string => x !== null);
      return presents.length === 0 ? tFiche('detail.aucunMoyen') : liste(presents);
    }
    case 'facturation': {
      if (individuelle) return tFiche('sections.facturation.detailIndividuelle');
      const m = ici('facturation');
      if (m.length === 0) return tFiche('sections.facturation.detail');
      const reprise = repriseDesNumeros({ ninea: valeurs.ninea, rccm: valeurs.rccm }, numeros);
      if (Object.keys(reprise).length === 2) return tFiche('detail.nineaRccmAReprendre');
      // Les éléments un à un : « NINEA et RCCM » fusionnés, dans une liste, donnerait « …, NINEA et RCCM et Adresse ».
      return tFiche('detail.aRemplir', {
        liste: liste(m.map((e) => tFiche(`elements.${e}.titre`))),
      });
    }
    case 'verification': {
      if (verification === null) return tFiche('detail.verificationIllisible');
      if (verification) return tFiche('detail.verifiee');
      const statut = dossier?.status ?? 'pending';
      return tFiche(`detail.verification.${statut}`);
    }
    case 'regles':
      return individuelle ? tFiche('sections.regles.detailIndividuelle') : tFiche('sections.regles.detail');
    case 'menu': {
      const total = CODES_DE_MODULE.length;
      const masques = reglagesDeLaFiche({
        hidden_modules: valeurs.hidden_modules,
      }).hidden_modules.length;
      return tFiche('detail.modules', { n: total - masques, total });
    }
    case 'offre':
      return individuelle ? tFiche('sections.offre.detailIndividuelle') : tFiche('sections.offre.detail');
  }
}
