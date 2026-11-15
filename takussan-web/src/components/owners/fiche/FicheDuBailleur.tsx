'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote, ChevronLeft, ChevronRight, Download, FileText, Loader2, Mail, MapPin, Pencil, Phone, Send, ShieldCheck } from 'lucide-react';

import { PageHeader, StatusBadge } from '@/components/console';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { FormInput, FormSelect } from '@/components/forms';
import { FormAmountInput } from '@/components/forms/FormAmountInput';
import { FormDatePicker } from '@/components/forms/FormDatePicker';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { EcrireA } from '@/components/messages/EcrireA';
import { CreatePayoutDialog } from '@/components/payments/CreatePayoutDialog';
import { MontantDuBien, PuceEtatDuMois, VignetteDuBien, lieuDuBien } from '@/components/property-dashboard/GestionDuBien';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { SheetClose } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { ligneOccupant } from '@/lib/biens/etat-locatif';
import { nomCompletDe } from '@/lib/identite';
import { bornesDuMois, dateDuMois, moisPrecedent } from '@/lib/finances/mois';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { AUCUN, MOYENS_DE_VERSEMENT, changementsDuMandat, jourValide, valeursDuMandat, type ValeursDuMandat } from '@/lib/owners/mandat';
import { lireLAvisDeVersement, lireLeReleve, remettreLeReleve } from '@/lib/owners/releve';
import { useAssignableStaff } from '@/lib/queries/maintenance';
import { updateOwnerMandate, type OwnerMandate, type OwnerProfileDetail } from '@/lib/queries/owners';
import { usePayouts } from '@/lib/queries/payments';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import type { Payout } from '@/types/invoice';
import type { PropertyListItem } from '@/types/property';

import { AvatarDuBailleur, TON_DU_STATUT, type LectureDuBailleur } from '../carnet/pieces';
import { AccesEtDepart } from './AccesEtDepart';
import { PiecesDuBailleur, clePiecesDuBailleur } from './PiecesDuBailleur';

// TCK-2910 — l'ajout au coffre ne se charge qu'à l'ouverture (« Ajouter » de la carte Documents).
const AjoutAuCoffre = dynamic(() => import('@/components/documents/coffre/ajout/AjoutAuCoffre').then((m) => m.AjoutAuCoffre));

/**
 * TCK-2641 — la fiche-compte d'un bailleur (`/app/owners/[id]`, maquette `app-bailleurs` a, écran
 * « Fiche du bailleur »), centrée sur l'argent du mandat.
 *
 *  · Téléphone : identité (Appeler · WhatsApp · Message), le mois (« Reste à verser » en tête), ses
 *    biens, les réglages du mandat, les documents, l'accès ; « Envoyer le relevé » et « Créer le
 *    reversement » dans la barre collée du bas.
 *  · Bureau (dès `lg`) : deux colonnes — à gauche l'identité, les réglages et les documents ; à droite
 *    le relevé du mois, les biens et les derniers reversements. « Créer le reversement » se pose dans
 *    la case « Reste à verser ».
 *
 * Un seul DOM pour les deux : au téléphone, les deux colonnes s'effacent (`contents`) et `order-*`
 * rend l'ordre de la maquette du téléphone.
 *
 * Chaque montant est celui de l'API (`figures` de `GET /api/owners/{id}?period=`, le relevé servi :
 * TCK-2640) ; rien n'est recalculé ici.
 */
export interface DroitsSurLaFiche {
  /** `owners.update` : le plafond de travaux et (TCK-2910) les termes du mandat s'écrivent ; sinon ils se lisent. */
  readonly plafond: boolean;
  /**
   * `payouts.create` : « Créer le reversement », et l'argent de la fiche — la carte du mois et
   * « Envoyer le relevé » (vérification adverse de TCK-2641, d1). C'est la règle d'argent de l'API
   * (`OwnerDirectory::readsMoney`) pour qui atteint cette page : sans elle, l'API rend `figures` et
   * `last_payout` à `null` et le relevé en 403.
   */
  readonly reversement: boolean;
  /** `team.suspend` : « Suspendre l'accès » / « Réactiver ». */
  readonly suspension: boolean;
  /** TCK-2753 — `OwnerProfilePolicy::depart` : « Retirer de l'agence », l'administrateur actif de l'agence. */
  readonly depart?: boolean;
  /** `OwnerProfilePolicy::viewSensitive` : « Afficher » les identifiants. */
  readonly sensible: boolean;
}

export interface FicheDuBailleurProps {
  readonly owner: OwnerProfileDetail;
  readonly period: string;
  /** Le mois civil en cours (Dakar) : le sélecteur ne va pas au-delà. */
  readonly moisCourant: string;
  readonly biens: readonly PropertyListItem[];
  readonly agencyId: number;
  readonly droits: DroitsSurLaFiche;
}

/** Le geste d'en-tête d'une carte (« Modifier », « Ajouter ») : 44 px de toucher, sans grandir la ligne. */
const GESTE_DE_CARTE =
  '-my-2.5 -mr-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';

/** TCK-2910 — les catégories du dépôt sur le profil : le mandat d'abord ; jamais une pièce KYC (422). */
const CATEGORIES_DU_PROFIL = ['management_mandate', 'insurance', 'other'] as const;

function moisSuivant(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

function lectureDe(owner: OwnerProfileDetail): LectureDuBailleur {
  const personne = owner.contact.full_name ?? nomCompletDe(owner.contact) ?? '';
  const societe = owner.owner_type === 'company' && Boolean(owner.company_name);
  return {
    nom: (societe ? owner.company_name : personne) || owner.contact.email || '—',
    prenom: owner.contact.first_name ?? '',
    contact: societe ? personne || null : null,
    societe,
    email: owner.contact.email,
    telephone: owner.contact.phone,
  };
}

/** Une carte de la fiche, avec son titre et son action éventuelle (« Modifier », « Voir dans Biens »). */
function Carte({
  titre,
  action,
  children,
  className,
  id,
  ancre,
}: {
  readonly titre?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
  /** TCK-2910 — l'ancre de la carte, que le « ⋯ » du téléphone fait défiler jusqu'à elle. */
  readonly ancre?: string;
}) {
  return (
    <section id={ancre} aria-labelledby={titre && id ? id : undefined} className={cn('scroll-mt-20 overflow-hidden rounded-xl border border-border bg-card', className)}>
      {titre ? (
        <div className="flex min-h-12 items-center gap-3 border-b border-border px-4 py-2">
          <h2 id={id} className="min-w-0 flex-1 text-base font-semibold">
            {titre}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function FicheDuBailleur({ owner, period, moisCourant, biens, agencyId, droits }: FicheDuBailleurProps) {
  const t = useTranslations('owners.fiche');
  const tCarnet = useTranslations('owners.carnet');
  const tStatut = useTranslations('owners.page.status');
  const tConsole = useTranslations('console.pageHeader');
  const f = useFormatteurs();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lecture = lectureDe(owner);
  const [reverser, setReverser] = useState(false);
  // TCK-2910 — l'édition des réglages vit ici : « Modifier le mandat » du « ⋯ » l'ouvre aussi.
  const [edition, setEdition] = useState(false);
  const [ajout, setAjout] = useState(false);

  const depuis = owner.joined_at ? f.date(owner.joined_at, { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
  const sousTitre = [
    depuis ? t('depuis', { date: depuis }) : null,
    tCarnet('occupation', {
      biens: owner.properties_count,
      occupes: owner.occupied_properties_count,
      tous: owner.properties_count > 0 && owner.occupied_properties_count === owner.properties_count ? 'oui' : 'non',
    }),
  ]
    .filter(Boolean)
    .join(' · ');

  // `CreatePayoutDialog` ne propose que les bailleurs `active` et `inactive` (P120.04) : ni un
  // brouillon, ni un accès suspendu.
  const litLArgent = droits.reversement;
  const reversementPossible = litLArgent && owner.user_id !== null && (owner.status === 'active' || owner.status === 'inactive');
  const bornes = bornesDuMois(period);
  const statut = <StatusBadge tone={TON_DU_STATUT[owner.status]} label={tStatut(owner.status)} className="whitespace-nowrap" />;
  const sectionAcces = droits.suspension || droits.depart || owner.status === 'inactive';

  // TCK-2910 — le « ⋯ » de l'en-tête du téléphone : les gestes secondaires (modifier le mandat, accès et
  // départ). Rendu par la coque, hors de la frontière i18n de la page : les libellés partent traduits d'ici.
  // Le défilement attend la fermeture de la feuille : son verrou de défilement l'annulerait sinon.
  const aller = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  const gesteDuMenu = 'h-12 w-full justify-start gap-3';
  const actionsDuTelephone =
    droits.plafond || sectionAcces ? (
      <div className="flex flex-col items-stretch gap-2 pb-2" data-slot="actions-du-telephone">
        {droits.plafond ? (
          <SheetClose
            render={<Button type="button" variant="outline" className={gesteDuMenu} />}
            onClick={() => {
              setEdition(true);
              aller('reglages-du-mandat-carte');
            }}
          >
            <Pencil className="size-5" aria-hidden="true" />
            {t('menu.modifierLeMandat')}
          </SheetClose>
        ) : null}
        {sectionAcces ? (
          <SheetClose render={<Button type="button" variant="outline" className={gesteDuMenu} />} onClick={() => aller('acces-et-depart-de-la-fiche')}>
            <ShieldCheck className="size-5" aria-hidden="true" />
            {t('menu.accesEtDepart')}
          </SheetClose>
        ) : null}
      </div>
    ) : undefined;

  return (
    <PagePleineLargeur data-slot="fiche-du-bailleur" className="max-md:pb-6">
      <DeclarerEnTete forme="detail" titre={lecture.nom} repli="/app/owners" actions={actionsDuTelephone} />

      <div className="max-md:hidden">
        <PageHeader
          fil={{ label: tConsole('breadcrumb'), etapes: [{ label: tCarnet('titre'), href: '/app/owners' }, { label: lecture.nom }] }}
          title={lecture.nom}
          description={sousTitre}
          actions={
            <>
              <BoutonMessage owner={owner} nom={lecture.nom} variante="contour" />
              {owner.user_id !== null && litLArgent ? <EnvoyerLeReleve period={period} landlordId={owner.user_id} nom={lecture.nom} variante="contour" /> : null}
            </>
          }
        />
      </div>

      <div className="flex flex-col gap-4 px-4 pt-4 md:px-0 md:pt-6 lg:grid lg:grid-cols-[calc(var(--spacing)*103.33)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="contents lg:block lg:space-y-5">
          <IdentiteDuBailleur owner={owner} lecture={lecture} depuis={depuis} statut={statut} className="order-1" />
          <ReglagesDuMandat owner={owner} agencyId={agencyId} modifiable={droits.plafond} edition={edition} onEdition={setEdition} className="order-4" />
          <Carte
            titre={t('pieces.titre')}
            id="fiche-documents"
            className="order-5"
            action={
              // TCK-2910 — « Ajouter » dépose sur le profil du bailleur (`owner_profile`, TCK-2909) : le
              // personnel de l'agence du profil y dépose, et cette fiche n'est ouverte qu'à son admin.
              <button type="button" onClick={() => setAjout(true)} className={GESTE_DE_CARTE}>
                {t('pieces.ajouter')}
              </button>
            }
          >
            <PiecesDuBailleur owner={owner} peutAfficher={droits.sensible} />
          </Carte>
        </div>
        <div className="contents lg:block lg:space-y-5">
          {litLArgent ? (
            <ReleveDuMois
              owner={owner}
              period={period}
              moisCourant={moisCourant}
              onReverser={reversementPossible ? () => setReverser(true) : undefined}
              className="order-2"
            />
          ) : null}
          <BiensDuBailleur owner={owner} biens={biens} className="order-3" />
          {owner.user_id !== null && droits.reversement ? <DerniersReversements landlordId={owner.user_id} className="order-6" /> : null}
        </div>
      </div>

      {sectionAcces ? (
        <div id="acces-et-depart-de-la-fiche" className="scroll-mt-20 px-4 pt-6 md:px-0">
          <AccesEtDepart owner={owner} agencyId={agencyId} peutSuspendre={droits.suspension} peutRetirer={droits.depart === true} devise={owner.figures?.currency ?? 'XOF'} nom={lecture.nom} />
        </div>
      ) : null}

      {owner.user_id !== null && litLArgent ? (
        <BarreDAction taille="action">
          <EnvoyerLeReleve period={period} landlordId={owner.user_id} nom={lecture.nom} variante="contour" />
          {reversementPossible ? (
            <Button onClick={() => setReverser(true)}>{t('creerReversement')}</Button>
          ) : null}
        </BarreDAction>
      ) : null}

      {ajout ? (
        <AjoutAuCoffre
          open={ajout}
          onOpenChange={setAjout}
          impose={{ type: 'owner_profile', id: owner.id, nom: lecture.nom, categories: CATEGORIES_DU_PROFIL, categorie: 'management_mandate' }}
          onAjoute={() => {
            void queryClient.invalidateQueries({ queryKey: clePiecesDuBailleur(owner.id) });
            // La ligne du mandat vient de la fiche (`mandate_document`) : la page serveur la relit.
            router.refresh();
          }}
        />
      ) : null}

      {reversementPossible && owner.user_id !== null ? (
        <CreatePayoutDialog
          open={reverser}
          onOpenChange={setReverser}
          bailleurInitial={owner.user_id}
          periodeInitiale={bornes}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['payouts'] });
            router.refresh();
          }}
        />
      ) : null}
    </PagePleineLargeur>
  );
}

function IdentiteDuBailleur({ owner, lecture, depuis, statut, className }: { readonly owner: OwnerProfileDetail; readonly lecture: LectureDuBailleur; readonly depuis: string | null; readonly statut: ReactNode; readonly className?: string }) {
  const t = useTranslations('owners.fiche');
  const tGestes = useTranslations('owners.carnet.gestes');
  const telephone = lecture.telephone;
  const joignable = isReachable(telephone);
  const adresse = owner.contact.address?.trim() || null;
  // TCK-2910 — « suivi par Awa Diop » : le référent du mandat (TCK-2909) ; parti de l'agence, il est signalé.
  const suivi = owner.mandate?.referent ?? null;
  const nomDuReferent = suivi ? nomCompletDe(suivi) : null;
  const referent = suivi && nomDuReferent ? (suivi.is_active ? t('suiviPar', { nom: nomDuReferent }) : t('suiviParAncien', { nom: nomDuReferent })) : null;
  const contact = 'inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring lg:h-11';
  return (
    <section aria-label={t('identite')} data-slot="identite-du-bailleur" className={cn('rounded-xl border border-border bg-card p-4 lg:p-5', className)}>
      <div className="flex items-center gap-3">
        <AvatarDuBailleur lecture={lecture} taille="fiche" />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="truncate font-display text-xl font-semibold tracking-titre lg:text-lg">{lecture.nom}</p>
          {/* Téléphone : depuis quand ; bureau : la nature du bailleur (la tête de page dit déjà « depuis »). */}
          <p className="truncate text-ui text-muted-foreground lg:hidden">
            {[lecture.societe ? lecture.contact : null, depuis ? t('depuis', { date: depuis }) : null].filter(Boolean).join(' · ')}
          </p>
          <p className="truncate text-ui text-muted-foreground max-lg:hidden" data-slot="nature-et-referent">
            {[lecture.societe ? t('societe') : t('particulier'), lecture.societe ? lecture.contact : null, referent].filter(Boolean).join(' · ')}
          </p>
        </div>
        {statut}
      </div>
      <div className="mt-3 text-sm lg:mt-4 lg:space-y-2.5">
        <p className="flex items-center gap-2.5">
          <Phone className="size-4 flex-none text-muted-foreground max-lg:hidden" strokeWidth={1.75} aria-hidden="true" />
          <span className="tabular-nums" data-slot="telephone-du-bailleur">
            {telephone ? formaterTelephone(telephone) : '—'}
          </span>
        </p>
        <p className="flex items-center gap-2.5">
          <Mail className="size-4 flex-none text-muted-foreground max-lg:hidden" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate">{lecture.email ?? '—'}</span>
        </p>
        {/* TCK-2910 — l'adresse du compte (TCK-2909), au bureau comme la maquette ; rien sans elle. */}
        {adresse ? (
          <p className="flex items-center gap-2.5 max-lg:hidden" data-slot="adresse-du-bailleur">
            <MapPin className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">{adresse}</span>
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex gap-2 lg:mt-4">
        {joignable ? (
          <>
            <a href={telHref(telephone)} className={contact} aria-label={tGestes('appelerAria', { nom: lecture.nom })}>
              <Phone className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {t('appeler')}
            </a>
            <a
              href={whatsappHref(telephone, tGestes('message', { prenom: lecture.prenom || lecture.nom }))}
              target="_blank"
              rel="noopener noreferrer"
              className={contact}
              aria-label={tGestes('whatsappAria', { nom: lecture.nom })}
            >
              <IconeWhatsApp className="size-4 text-success" />
              {t('whatsapp')}
            </a>
          </>
        ) : null}
        <BoutonMessage owner={owner} nom={lecture.nom} variante="egal" />
      </div>
    </section>
  );
}

/** « Message » : `EcrireA` (le fil à deux qui existe, sinon un brouillon), au contour ou en geste égal. */
function BoutonMessage({ owner, nom, variante }: { readonly owner: OwnerProfileDetail; readonly nom: string; readonly variante: 'contour' | 'egal' }) {
  const t = useTranslations('owners.fiche');
  return (
    <EcrireA
      personne={{ id: owner.user_id, nom }}
      libelle={t('message')}
      titre={t('messageA', { nom })}
      className={
        variante === 'egal'
          ? 'inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring lg:h-11'
          : buttonVariants({ variant: 'outline' })
      }
    />
  );
}

/** Le PDF du mois, partagé comme fichier au téléphone, téléchargé sinon ; l'échec se dit. */
function useEnvoiDuReleve(period: string, landlordId: number, nom: string) {
  const t = useTranslations('owners.fiche.releve');
  const locale = useLocale();
  const f = useFormatteurs();
  const { token } = useAuth();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const [envoi, setEnvoi] = useState(false);
  const mois = f.date(dateDuMois(period), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const envoyer = async () => {
    if (!token) return;
    setEnvoi(true);
    try {
      const pdf = await lireLeReleve(token, period, landlordId, locale);
      await remettreLeReleve(pdf, `releve-${period}.pdf`, t('titrePartage', { nom, mois }));
    } catch (error) {
      toast.add({ title: t('echec'), description: messageErreur(error), type: 'error' });
    } finally {
      setEnvoi(false);
    }
  };
  return { envoi, envoyer: () => void envoyer() };
}

/** « Envoyer le relevé » (tête de page, barre du bas) ou « PDF » (la carte du relevé, au bureau). */
function EnvoyerLeReleve({ period, landlordId, nom, variante }: { readonly period: string; readonly landlordId: number; readonly nom: string; readonly variante: 'contour' | 'lien' }) {
  const t = useTranslations('owners.fiche.releve');
  const { envoi, envoyer } = useEnvoiDuReleve(period, landlordId, nom);
  if (variante === 'lien') {
    return (
      <button type="button" onClick={envoyer} disabled={envoi} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50">
        {t('pdf')}
        {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" strokeWidth={1.75} aria-hidden="true" />}
      </button>
    );
  }
  return (
    <Button variant="outline" onClick={envoyer} disabled={envoi}>
      {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" strokeWidth={1.75} aria-hidden="true" />}
      {t('envoyer')}
    </Button>
  );
}

/** La ligne « Relevé de gérance de novembre » du téléphone : toute la ligne remet le PDF. */
function LigneDuReleve({ period, landlordId, nom }: { readonly period: string; readonly landlordId: number; readonly nom: string }) {
  const t = useTranslations('owners.fiche.releve');
  const f = useFormatteurs();
  const { envoi, envoyer } = useEnvoiDuReleve(period, landlordId, nom);
  const mois = f.date(dateDuMois(period), { month: 'long', timeZone: 'UTC' });
  return (
    <button
      type="button"
      onClick={envoyer}
      disabled={envoi}
      className="flex min-h-14 w-full items-center gap-3 border-t border-border px-4 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset lg:hidden"
    >
      <FileText className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block truncate font-medium">{t('releveDe', { mois })}</span>
        <span className="block truncate text-ui text-muted-foreground">{t('releveDetail')}</span>
      </span>
      {envoi ? <Loader2 className="size-4 flex-none animate-spin" aria-hidden="true" /> : <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />}
    </button>
  );
}

/**
 * Le relevé du mois : le mois choisi (`?period=`), « Reste à verser à ce jour » en tête, puis Encaissé ·
 * Commission · Déjà versé DU MOIS, sous « En novembre ». Le reste est le solde cumulé au jour (TCK-2760,
 * décision 3) : il ne suit pas le mois, et ne se lit pas comme la différence des trois lignes — il se
 * tient hors de leur groupe, qui se nomme par son mois. Le sélecteur est celui de l'application — un pas de mois en arrière ou en
 * avant, libellé par `useFormatteurs()` (« novembre 2026 » en `fr`, « November 2026 » en `en`,
 * quelle que soit la langue du navigateur) — jamais `<input type="month">` (P2 de l'audit).
 */
function ReleveDuMois({ owner, period, moisCourant, onReverser, className }: { readonly owner: OwnerProfileDetail; readonly period: string; readonly moisCourant: string; readonly onReverser?: () => void; readonly className?: string }) {
  const t = useTranslations('owners.fiche.releve');
  const f = useFormatteurs();
  const { remplacer } = useVueDansLUrl();
  const figures = owner.figures;
  const mois = f.date(dateDuMois(period), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const duMois = t('duMois', { mois: f.date(dateDuMois(period), { month: 'long', timeZone: 'UTC' }) });
  const idDuMois = useId();
  const devise = figures?.currency ?? 'XOF';
  const nom = owner.company_name ?? owner.contact.full_name ?? '';
  const aller = (cible: string) => remplacer({ period: cible === moisCourant ? null : cible });
  const suivantPossible = period < moisCourant;
  const versement = owner.last_payout?.processed_at && owner.last_payout.processed_at.slice(0, 7) === period ? f.jourMois(owner.last_payout.processed_at) : null;
  const taux = owner.agency_commission_rate;
  const moyenBrut = owner.last_payout?.payment_method ?? null;
  const moyenDuVersement = moyenBrut && t.has(`moyens.${moyenBrut}`) ? t(`moyens.${moyenBrut}`) : null;

  const pas = (
    <span className="inline-flex h-11 items-center lg:h-9" data-slot="selecteur-de-mois">
      <button type="button" onClick={() => aller(moisPrecedent(period))} aria-label={t('moisPrecedent')} className="inline-flex size-11 items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring lg:size-9">
        <ChevronLeft className="size-5 lg:size-4" aria-hidden="true" />
      </button>
      <span className="hidden px-1 text-sm font-medium tabular-nums lg:inline" aria-live="polite">
        {mois}
      </span>
      <button
        type="button"
        onClick={() => aller(moisSuivant(period))}
        disabled={!suivantPossible}
        aria-label={t('moisSuivant')}
        className="inline-flex size-11 items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-30 disabled:hover:bg-transparent lg:size-9"
      >
        <ChevronRight className="size-5 lg:size-4" aria-hidden="true" />
      </button>
    </span>
  );

  const reste = owner.balance ? f.montantCourt(owner.balance.remaining_to_pay, devise) : '—'; // TCK-2760 — le solde cumulé au jour, pas l'écart du mois
  const lignes = figures
    ? [
        {
          cle: 'encaisse',
          telephone: t('encaisse'),
          bureau: t('encaisse'),
          valeur: f.montantCourt(figures.collected, devise),
          // TCK-2910 — « 9 encaissements » : les lignes du même relevé que l'encaissé (TCK-2909).
          detail: typeof figures.collections_count === 'number' ? t('encaissements', { n: figures.collections_count }) : null,
        },
        {
          cle: 'commission',
          telephone: t('commissionAgence'),
          bureau: t('commission'),
          valeur: `− ${f.montantCourt(figures.commission, devise)}`,
          detail: taux !== null ? t('tauxDetail', { taux: f.nombre(taux, { maximumFractionDigits: 2 }) }) : null,
        },
        {
          cle: 'verse',
          telephone: versement ? t('dejaVerseLe', { date: versement }) : t('dejaVerse'),
          bureau: t('dejaVerse'),
          valeur: `− ${f.montantCourt(figures.paid_out, devise)}`,
          // TCK-2910 — « le 5 nov., par virement » : le moyen du dernier versement, quand l'API le dit.
          detail: versement ? (moyenDuVersement ? t('leDateParMoyen', { date: versement, moyen: moyenDuVersement }) : t('leDate', { date: versement })) : null,
        },
      ]
    : [];

  return (
    <section aria-labelledby="releve-du-mois" data-slot="releve-du-mois" className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-3 border-b border-border py-0.5 pr-1 pl-4 lg:px-5 lg:py-2">
        <h2 id="releve-du-mois" className="min-w-0 flex-1 text-base font-semibold">
          <span className="lg:hidden">{mois}</span>
          <span className="hidden lg:inline">{t('titre')}</span>
        </h2>
        {pas}
        {owner.user_id !== null ? (
          <span className="hidden lg:inline-flex">
            <EnvoyerLeReleve period={period} landlordId={owner.user_id} nom={nom} variante="lien" />
          </span>
        ) : null}
      </div>

      {figures === null ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{t('sansReleve')}</p>
      ) : (
        <>
          {/* Téléphone : « Reste à verser » en tête, puis les trois lignes. */}
          <div className="px-4 pt-4 pb-2 lg:hidden">
            <p className="text-ui text-muted-foreground">{t('reste')}</p>
            <p className="mt-1 font-display text-3xl leading-none font-semibold tracking-titre tabular-nums" data-slot="reste-a-verser">
              {reste}
            </p>
            <div role="group" aria-labelledby={`${idDuMois}-telephone`} data-slot="mouvements-du-mois" className="mt-4 border-t border-border pt-3">
              <p id={`${idDuMois}-telephone`} className="text-legende text-muted-foreground">
                {duMois}
              </p>
              <dl className="pt-0.5">
                {lignes.map((l) => (
                  <div key={l.cle} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                    <dt className="min-w-0 truncate text-muted-foreground">{l.telephone}</dt>
                    <dd className="font-medium tabular-nums">{l.valeur}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          {/* Bureau : les trois chiffres du mois, nommés par leur mois, puis — hors de leur groupe — la
              case « Reste à verser à ce jour » qui porte le reversement. Mêmes largeurs qu'avant (3 : 1,5). */}
          <div className="hidden lg:grid lg:grid-cols-1 w1440:grid-cols-3">
            <div role="group" aria-labelledby={`${idDuMois}-bureau`} data-slot="mouvements-du-mois-bureau" className="w1440:col-span-2">
              <p id={`${idDuMois}-bureau`} className="px-5 pt-3 text-legende text-muted-foreground">
                {duMois}
              </p>
              <div className="grid grid-cols-3">
                {lignes.map((l, i) => (
                  <div key={l.cle} className={cn('border-border px-5 pt-1 pb-4', i < 2 && 'border-r')}>
                    <p className="text-ui text-muted-foreground">{l.bureau}</p>
                    <p className="mt-1 text-lg font-semibold whitespace-nowrap tabular-nums">{l.valeur}</p>
                    {l.detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.detail}</p> : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 border-t border-border bg-secondary/50 px-5 py-4 w1440:block w1440:border-t-0 w1440:border-l">
              <div className="min-w-0 flex-1">
                <p className="text-ui text-muted-foreground">{t('reste')}</p>
                <p className="mt-1 font-display text-2xl leading-none font-semibold tracking-titre whitespace-nowrap tabular-nums" data-slot="reste-a-verser-bureau">
                  {reste}
                </p>
              </div>
              {onReverser ? (
                <Button className="flex-none w1440:mt-3 w1440:w-full" onClick={onReverser}>
                  <Banknote className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {t('creerReversement')}
                </Button>
              ) : null}
            </div>
          </div>
          {owner.user_id !== null ? <LigneDuReleve period={period} landlordId={owner.user_id} nom={nom} /> : null}
        </>
      )}
    </section>
  );
}

/**
 * Les réglages du mandat : le plafond de travaux sans accord (TCK-2640), la commission, et (TCK-2910) le
 * versement (« Virement, avant le 10 du mois ») et les dates du mandat (TCK-2909). Modifiables sous
 * `owners.update` ; seules les valeurs changées partent (`PATCH /api/owners/{id}`).
 *
 * Aucun champ vide inventé : sans moyen ni jour, la ligne « Versement » n'est pas rendue ; sans dates, la
 * ligne « Mandat » dit « Dates du mandat à renseigner » à qui peut modifier, et n'est pas rendue aux autres.
 */
function ReglagesDuMandat({
  owner,
  agencyId,
  modifiable,
  edition,
  onEdition,
  className,
}: {
  readonly owner: OwnerProfileDetail;
  readonly agencyId: number;
  readonly modifiable: boolean;
  readonly edition: boolean;
  readonly onEdition: (edition: boolean) => void;
  readonly className?: string;
}) {
  const t = useTranslations('owners.fiche.reglages');
  const f = useFormatteurs();
  const router = useRouter();
  const { token } = useAuth();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const form = useForm<ValeursDuMandat>({ defaultValues: valeursDuMandat(owner) });
  // Chaque ouverture (« Modifier » de la carte ou « Modifier le mandat » du « ⋯ ») part des valeurs de la
  // fiche : une saisie annulée ne revient pas, et ne partirait pas à l'enregistrement suivant.
  const { reset } = form;
  useEffect(() => {
    if (edition) reset(valeursDuMandat(owner));
  }, [edition, owner, reset]);
  const versement = useLigneDuVersement(owner.mandate);
  const jour = (iso: string) => f.date(iso, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const debut = owner.mandate?.starts_on ?? null;
  const fin = owner.mandate?.ends_on ?? null;
  const dates = debut && fin ? t('datesDuMandat', { debut: jour(debut), fin: jour(fin) }) : debut ? t('depuisLe', { date: jour(debut) }) : fin ? t('jusquAu', { date: jour(fin) }) : null;

  const enregistrer = form.handleSubmit(async (valeurs) => {
    if (!token) return;
    if (!jourValide(valeurs.jour)) {
      form.setError('jour', { message: t('jourInvalide') });
      return;
    }
    const changements = changementsDuMandat(valeursDuMandat(owner), valeurs);
    // Rien de changé : rien ne part (un corps vide serait un 422).
    if (Object.keys(changements).length === 0) {
      onEdition(false);
      return;
    }
    try {
      await updateOwnerMandate(token, owner.id, changements);
      onEdition(false);
      toast.add({ title: t('enregistre'), type: 'success' });
      router.refresh();
    } catch (error) {
      toast.add({ title: t('echec'), description: messageErreur(error), type: 'error' });
    }
  });

  const taux = owner.agency_commission_rate;
  const autres = owner.lease_commission_rates;
  const plafond = owner.works_approval_threshold;
  const ligne = 'flex items-baseline gap-3 border-t border-border py-1.5 text-sm';

  return (
    <Carte
      titre={t('titre')}
      id="reglages-du-mandat"
      ancre="reglages-du-mandat-carte"
      className={className}
      action={
        modifiable && !edition ? (
          <button
            type="button"
            onClick={() => onEdition(true)}
            // La zone de toucher (44 px, 40 au bureau) déborde de la ligne sans la grandir : l'en-tête de la
            // carte garde la hauteur de la maquette a-1, et le libellé s'aligne sur sa marge droite.
            className={GESTE_DE_CARTE}
          >
            {t('modifier')}
          </button>
        ) : null
      }
    >
      <div className="px-4 py-2.5">
        {edition && modifiable ? (
          <form onSubmit={(e) => void enregistrer(e)} className="space-y-3 py-1.5" data-slot="edition-du-plafond" noValidate>
            <FormAmountInput control={form.control} name="seuil" label={t('plafond')} currency="XOF" unite="F" example={150000} />
            <p className="text-xs leading-snug text-muted-foreground">{t('effet')}</p>
            <ChampsDuMandat form={form} owner={owner} agencyId={agencyId} />
            <div className="flex gap-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {t('enregistrer')}
              </Button>
              <Button type="button" variant="outline" onClick={() => onEdition(false)}>
                {t('annuler')}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-baseline gap-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 text-muted-foreground">{t('plafond')}</span>
              <span className="font-semibold tabular-nums" data-slot="plafond-de-travaux">
                {plafond !== null ? f.montantCourt(plafond) : t('sansPlafond')}
              </span>
            </div>
            <p className="pb-1.5 text-xs leading-snug text-muted-foreground">{plafond !== null ? t('effet') : t('effetSansPlafond')}</p>
          </>
        )}
        <div className={ligne}>
          <span className="min-w-0 flex-1 text-muted-foreground">{t('commission')}</span>
          <span className="tabular-nums">{taux !== null ? t('taux', { taux: f.nombre(taux, { maximumFractionDigits: 2 }) }) : '—'}</span>
        </div>
        {autres.length > 0 ? (
          <p className="pb-1.5 text-xs leading-snug text-muted-foreground">
            {t('tauxDesBaux', { taux: autres.map((x) => `${f.nombre(x, { maximumFractionDigits: 2 })} %`).join(', ') })}
          </p>
        ) : null}
        {!edition && versement ? (
          <div className={ligne} data-slot="versement-du-mandat">
            <span className="flex-none text-muted-foreground">{t('versement')}</span>
            <span className="min-w-0 flex-1 text-right">{versement}</span>
          </div>
        ) : null}
        {edition ? null : dates ? (
          <div className={ligne} data-slot="dates-du-mandat">
            <span className="flex-none text-muted-foreground">{t('mandat')}</span>
            <span className="min-w-0 flex-1 text-right tabular-nums">{dates}</span>
          </div>
        ) : modifiable ? (
          <div className={ligne} data-slot="dates-du-mandat">
            <span className="min-w-0 flex-1 text-muted-foreground">{t('datesARenseigner')}</span>
          </div>
        ) : null}
      </div>
    </Carte>
  );
}

/** TCK-2910 — « Virement, avant le 10 du mois » : le moyen et le jour du mandat, ce qui en est connu. */
function useLigneDuVersement(mandat: OwnerMandate | undefined): string | null {
  const t = useTranslations('owners.fiche.reglages');
  const moyen = useMoyenCourt()(mandat?.payout_method ?? null);
  const jour = mandat?.payout_day ?? null;
  if (moyen && jour !== null) return t('versementMoyenEtJour', { moyen, jour });
  if (moyen) return moyen;
  if (jour !== null) return t('versementJour', { jour });
  return null;
}

/** TCK-2910 — « Virement », « Wave », « Espèces » : le nom court d'un moyen (`PaymentMethod`), sinon sa valeur. */
function useMoyenCourt() {
  const t = useTranslations('owners.fiche.moyens');
  return (moyen: string | null): string | null => (moyen ? (t.has(moyen) ? t(moyen) : moyen) : null);
}

/** TCK-2910 — le moyen, le jour, les dates et le référent, sous le plafond, dans le même formulaire. */
function ChampsDuMandat({ form, owner, agencyId }: { readonly form: ReturnType<typeof useForm<ValeursDuMandat>>; readonly owner: OwnerProfileDetail; readonly agencyId: number }) {
  const t = useTranslations('owners.fiche.reglages');
  const tMoyens = useTranslations('payments.methods');
  const personnel = useAssignableStaff(agencyId);
  const actuel = owner.mandate?.referent ?? null;
  const membres = personnel.data?.data ?? [];
  // Le référent écrit reste choisissable même s'il a quitté l'agence (l'API ne le propose plus).
  const referents = [
    ...membres.map((m) => ({ value: String(m.id), label: nomCompletDe(m) ?? `#${m.id}` })),
    ...(actuel && !membres.some((m) => m.id === actuel.id) ? [{ value: String(actuel.id), label: nomCompletDe(actuel) ?? `#${actuel.id}` }] : []),
  ];
  return (
    <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
      <FormSelect<ValeursDuMandat>
        control={form.control}
        name="moyen"
        label={t('moyen')}
        options={[{ value: AUCUN, label: t('nonPrecise') }, ...MOYENS_DE_VERSEMENT.map((m) => ({ value: m, label: tMoyens.has(m) ? tMoyens(m) : m }))]}
      />
      <FormInput<ValeursDuMandat> control={form.control} name="jour" type="number" min={1} max={28} inputMode="numeric" label={t('jour')} placeholder={t('jourExemple')} />
      <FormDatePicker<ValeursDuMandat> control={form.control} name="debut" label={t('debut')} placeholder={t('nonPrecise')} />
      <FormDatePicker<ValeursDuMandat> control={form.control} name="fin" label={t('fin')} placeholder={t('nonPrecise')} />
      <FormSelect<ValeursDuMandat>
        control={form.control}
        name="referent"
        label={t('referent')}
        containerClassName="sm:col-span-2"
        options={[{ value: AUCUN, label: t('aucunReferent') }, ...referents]}
      />
    </div>
  );
}

/** « Locataire » d'un bien : son nom (TCK-2637, réservé à qui voit le bail), sinon son état. */
function useOccupant() {
  const t = useTranslations('propertyDashboard.gestion.ligne');
  return (b: PropertyListItem, aujourdhui: Date): string | null => {
    const ligne = ligneOccupant(b, aujourdhui);
    if (!ligne) return null;
    return ligne.cle === 'locataire' ? ligne.nom : t(ligne.cle);
  };
}

/**
 * « Ses biens (n) », chacun avec l'état de son mois (TCK-2637, la puce du mode Gestion) : une liste au
 * téléphone (le lieu et le locataire sous le titre), un tableau Bien · Locataire · Loyer · Ce mois au
 * bureau. Les six premiers, retards d'abord ; « Voir dans Biens » mène au portefeuille filtré.
 * La liste n'en garde que trois, comme la maquette retenue du téléphone (ADR-0106) : une seule
 * lecture (`per_page=6`) sert les deux, le tableau (dès `xl`) montre les six ; de 1024 à 1279 px,
 * c'est la liste, et « Voir dans Biens » mène au reste.
 */
const BIENS_DE_LA_LISTE = 3;

function BiensDuBailleur({ owner, biens, className }: { readonly owner: OwnerProfileDetail; readonly biens: readonly PropertyListItem[]; readonly className?: string }) {
  const t = useTranslations('owners.fiche.biens');
  const aujourdhui = useMinuteCourante();
  const occupant = useOccupant();
  const voir =
    owner.user_id !== null ? (
      <Link href={`/app/properties?mode=gestion&user_id=${owner.user_id}`} className="inline-flex h-11 items-center rounded-lg px-2 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
        {t('voir')}
      </Link>
    ) : null;
  const lien = 'outline-none after:absolute after:inset-0 focus-visible:underline';
  return (
    <Carte titre={t('titre', { n: owner.properties_count })} id="biens-du-bailleur" action={voir} className={className}>
      {biens.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{t('aucun')}</p>
      ) : (
        <>
          {/* Le tableau dès `xl` seulement : de 1024 à 1279 px la carte mesure 418 px, et ses trois
              colonnes fixes (180 + 108 + 130) y réduisaient « Bien » à 0 px (mesuré, fr et en). */}
          <ul className="divide-y divide-border xl:hidden">
            {biens.slice(0, BIENS_DE_LA_LISTE).map((b) => (
              <li key={b.id} className="relative flex min-h-14 items-center gap-3 px-4 py-2" data-slot="bien-du-bailleur">
                <span className="min-w-0 flex-1 leading-snug">
                  <Link href={`/app/properties/${b.id}`} className={cn('block truncate font-medium text-foreground', lien)}>
                    {b.title}
                  </Link>
                  <span className="block truncate text-ui text-muted-foreground">{[lieuDuBien(b), occupant(b, aujourdhui)].filter(Boolean).join(' · ')}</span>
                </span>
                <PuceEtatDuMois property={b} aujourdhui={aujourdhui} court />
              </li>
            ))}
          </ul>
          <table className="hidden w-full table-fixed border-collapse text-sm xl:table">
            <caption className="sr-only">{t('titre', { n: owner.properties_count })}</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className="h-9 px-5 text-left text-xs font-medium text-muted-foreground">{t('colonnes.bien')}</th>
                <th scope="col" className="h-9 w-[calc(var(--spacing)*50)] px-3 text-left text-xs font-medium text-muted-foreground">{t('colonnes.locataire')}</th>
                <th scope="col" className="h-9 w-[calc(var(--spacing)*30)] px-3 text-right text-xs font-medium text-muted-foreground">{t('colonnes.loyer')}</th>
                <th scope="col" className="h-9 w-[calc(var(--spacing)*36)] px-3 pr-5 text-left text-xs font-medium text-muted-foreground">{t('colonnes.ceMois')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {biens.map((b) => (
                <tr key={b.id} className="relative hover:bg-secondary/50">
                  <td className="h-12 px-5">
                    <span className="flex items-center gap-3">
                      <VignetteDuBien property={b} taille="ligne" />
                      <Link href={`/app/properties/${b.id}`} className={cn('min-w-0 truncate font-medium text-foreground', lien)}>
                        {[b.title, lieuDuBien(b)].filter(Boolean).join(' · ')}
                      </Link>
                    </span>
                  </td>
                  <td className="truncate px-3">{occupant(b, aujourdhui) ?? '—'}</td>
                  <td className="px-3 text-right">
                    <MontantDuBien property={b} periode="si-autre" />
                  </td>
                  <td className="px-3 pr-5">
                    <PuceEtatDuMois property={b} aujourdhui={aujourdhui} court />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Carte>
  );
}

/**
 * Les trois derniers reversements au bailleur (`GET /api/payouts?filter[landlord_id]=`) : la date, ce
 * que c'était (TCK-2910 : « Acompte de novembre », « Solde d'octobre » — la `nature` de TCK-2909 ;
 * « Reversement de novembre » pour un reversement antérieur, sans nature), le moyen, le montant, et
 * « Reçu » — l'avis de versement en PDF, que l'API ne sert qu'au reversement au bailleur terminé. Un
 * reversement pas encore versé dit son statut à la place.
 */
function DerniersReversements({ landlordId, className }: { readonly landlordId: number; readonly className?: string }) {
  const t = useTranslations('owners.fiche.reversements');
  const tStatut = useTranslations('payments.payoutStatus');
  const moyenCourt = useMoyenCourt();
  const f = useFormatteurs();
  const payouts = usePayouts({ landlord_id: landlordId, per_page: 3 });
  const lignes = payouts.data?.data ?? [];
  const libelle = useLibelleDuReversement();
  return (
    <Carte
      titre={t('titre')}
      id="derniers-reversements"
      className={className}
      action={
        <Link href="/app/payments?tab=payouts" className="inline-flex h-11 items-center rounded-lg px-2 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
          {t('historique')}
        </Link>
      }
    >
      {lignes.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{payouts.isLoading ? t('chargement') : t('aucun')}</p>
      ) : (
        <ul className="divide-y divide-border" data-slot="derniers-reversements">
          {lignes.map((p) => {
            const date = f.date(p.processed_at ?? p.scheduled_at ?? p.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
            const moyen = moyenCourt(p.payment_method);
            const recu = p.status === 'completed' && (p.payee_role ?? 'landlord') === 'landlord';
            return (
              <li key={p.id} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm lg:gap-4 lg:px-5" data-slot="reversement">
                <span className="w-[calc(var(--spacing)*22)] flex-none text-muted-foreground tabular-nums w1440:w-[calc(var(--spacing)*24.44)]">{date}</span>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block truncate font-medium">{libelle(p)}</span>
                  {moyen ? <span className="block truncate text-xs text-muted-foreground w1440:hidden">{moyen}</span> : null}
                </span>
                {moyen ? <span className="hidden w-[calc(var(--spacing)*30)] flex-none truncate text-muted-foreground w1440:block">{moyen}</span> : null}
                <span className="flex-none text-right font-semibold tabular-nums">{f.montantCourt(p.net_amount, p.currency ?? 'XOF')}</span>
                {recu ? (
                  <RecuDuReversement payout={p} date={date} />
                ) : (
                  <StatusBadge tone={p.status === 'completed' ? 'success' : p.status === 'failed' || p.status === 'cancelled' ? 'danger' : 'neutral'} label={tStatut.has(p.status) ? tStatut(p.status) : p.status} className="flex-none whitespace-nowrap" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Carte>
  );
}

/** TCK-2910 — « Acompte de novembre », « Solde d'octobre » (élision devant une voyelle), ou la période. */
function useLibelleDuReversement() {
  const t = useTranslations('owners.fiche.reversements');
  const f = useFormatteurs();
  return (p: Payout): string => {
    const mois = p.period_start ? f.date(dateDuMois(p.period_start.slice(0, 7)), { month: 'long', timeZone: 'UTC' }) : null;
    const voyelle = mois !== null && /^[aeiouyàâäéèêëîïôöùûüh]/i.test(mois) ? 'oui' : 'non';
    switch (p.nature) {
      case 'advance':
        return mois ? t('nature.advance', { mois, voyelle }) : t('nature.advanceSansMois');
      case 'balance':
        return mois ? t('nature.balance', { mois, voyelle }) : t('nature.balanceSansMois');
      case 'deposit_refund':
      case 'refund':
      case 'provider_bill':
        return t(`nature.${p.nature}`);
      default:
        return mois ? t('periode', { mois }) : (p.reference_number ?? '—');
    }
  };
}

/** TCK-2910 — « Reçu » : l'avis de versement (`GET /api/payouts/{id}/notice/pdf`), partagé ou téléchargé. */
function RecuDuReversement({ payout, date }: { readonly payout: Payout; readonly date: string }) {
  const t = useTranslations('owners.fiche.reversements');
  const locale = useLocale();
  const { token } = useAuth();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const [envoi, setEnvoi] = useState(false);
  const remettre = async () => {
    if (!token) return;
    setEnvoi(true);
    try {
      const pdf = await lireLAvisDeVersement(token, payout.id, locale);
      await remettreLeReleve(pdf, `avis-de-versement-${payout.reference_number || payout.id}.pdf`, t('titreDuRecu', { date }));
    } catch (error) {
      toast.add({ title: t('echecDuRecu'), description: messageErreur(error), type: 'error' });
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void remettre()}
      disabled={envoi}
      aria-label={t('recuAria', { date })}
      className="-mr-2 inline-flex h-11 flex-none items-center gap-1 rounded-lg px-2 text-ui font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
    >
      {envoi ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      {t('recu')}
    </button>
  );
}
