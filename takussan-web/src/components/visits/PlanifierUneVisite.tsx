'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { PhoneInput } from '@/components/ui/phone-input';
import { Textarea } from '@/components/ui/textarea';
import type { CustomerDuplicateMatch } from '@/app/actions/dashboard-customers';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { useMyProfiles } from '@/hooks/useProfiles';
import { ApiError } from '@/lib/api';
import { jourDeLApi, decalerJour } from '@/lib/jour-de-l-api';
import { useCreneauxDeVisite, usePlanVisit, type PlanVisitPayload } from '@/lib/queries/visits';
import { instantADakar } from '@/lib/visites/heure-de-dakar';
import { creneauxProposes, etiquetteDuJour, joursProposes, jourEnClair } from '@/lib/visites/planification';
import { smsRetenu } from '@/lib/visites/sort-du-sms';
import { cn } from '@/lib/utils';
import {
  CarteDeLaDemande,
  ChoixDuBien,
  ChoixDuClient,
  EncartConfirmee,
  GestesDuSucces,
  NoteDeLaDemande,
  PastilleDeChoix,
  SuccesDeLaPlanification,
  TitreDeSection,
  type BienAPlanifier,
  type ClientAPlanifier,
  type VisitePlanifiee,
} from '@/components/visits/planification/PiecesDeLaPlanification';

export type { BienAPlanifier, ClientAPlanifier } from '@/components/visits/planification/PiecesDeLaPlanification';

/** La demande d'où naît la visite (TCK-2582) : son demandeur est repris, verrouillé. */
export interface DemandeAPlanifier {
  readonly id: number;
  readonly nom: string;
  readonly prenom?: string | null;
  readonly telephone?: string | null;
  /** La demande est déjà rattachée à une fiche : la case « Créer la fiche » n'a plus d'objet. */
  readonly ficheId?: number | null;
}

interface PreRemplissage {
  /** Depuis la fiche d'un bien, une demande ou une visite terminée : le bien est posé. */
  readonly property?: BienAPlanifier;
  /** Depuis la fiche client ou une visite terminée : le client est posé. */
  readonly customer?: ClientAPlanifier;
  /** Depuis une demande : `contact_lead_id`, et la fiche qui naît d'elle (`create_customer`). */
  readonly demande?: DemandeAPlanifier;
  /** Depuis l'agenda : le jour (`AAAA-MM-JJ`, Dakar) et l'heure (`HH:MM`) du créneau touché. */
  readonly jour?: string;
  readonly heure?: string;
}

const sansAbonnement = () => () => {};

interface PlanifierUneVisiteProps extends PreRemplissage {
  /**
   * L'agence du bien, quand on la connaît (fiche bien). `null` : bien sans agence, qui n'a aucun
   * personnel. Omise : l'agence du profil actif (fiche client, calendrier).
   */
  readonly agencyId?: number | null;
  readonly className?: string;
  /**
   * TCK-2639 (AC5) — la page sait déjà, au rendu serveur, que l'appelant est du personnel : tant que
   * ses profils se lisent, le bouton occupe sa place (invisible), pour que l'en-tête ne bouge pas à
   * son arrivée. Sans elle, rien n'est rendu avant la lecture (un bailleur n'a pas de place vide).
   */
  readonly placeReservee?: boolean;
  /**
   * TCK-2589 (maquette a-1) — `default` : le bouton plein de la fiche client. Défaut `outline`, le
   * rendu de tous les autres appelants.
   */
  readonly variant?: 'outline' | 'default';
}

/**
 * TCK-590 — « Planifier une visite » depuis la fiche bien, la fiche client, l'agenda et les Visites.
 *
 * L'API n'offrait au personnel aucune création qui ait un sens : `POST /property-visits` posait
 * `visitor_id = l'appelant`, et l'agent qui planifiait pour le prospect qui venait d'appeler
 * devenait lui-même le visiteur. La visite naît désormais CONFIRMÉE et le client est prévenu ;
 * sans fiche client, le prospect se donne par nom + téléphone.
 *
 * Réservé au PERSONNEL (agent, admin) : l'API ne laisse planifier pour un tiers que le personnel
 * actif de l'agence du bien (vérification adverse, B1/B2). Un bailleur qui l'ouvrirait réserverait
 * pour lui-même sans le savoir — le bouton ne lui est pas montré.
 *
 * Passe 2 (n4) — la garde lisait les rôles GLOBAUX (`isAgent(user.roles)`) : un agent SUSPENDU,
 * ou dont le profil actif est celui d'une autre agence, voyait le bouton, et l'API, qui le traite
 * en non-personnel, le faisait réserver pour lui-même. Elle lit désormais le profil actif.
 */
export function PlanifierUneVisite({ agencyId, className, placeReservee = false, variant = 'outline', ...preRemplissage }: PlanifierUneVisiteProps) {
  const t = useTranslations('visitPlanning.plan');
  // TCK-2639 — lu APRÈS l'hydratation, comme `VisitesParLeTemps` : le serveur ne connaît pas les
  // profils, la coque hydratée avant cette frontière les a souvent déjà lus. Rendre le vrai bouton au
  // premier passage du client, c'était hydrater la place réservée (même balise, même texte) en gardant
  // ses attributs serveur — `invisible`, `aria-hidden` — pour de bon (relevé au navigateur, 2 sur 4).
  const hydrate = useSyncExternalStore(sansAbonnement, () => true, () => false);
  const personnelLu = usePersonnelActif(agencyId);
  const personnel = hydrate && personnelLu;
  const profils = useMyProfiles();
  const [ouvert, setOuvert] = useState(false);
  if (!personnel) {
    return placeReservee && (!hydrate || profils.isPending) ? (
      <Button type="button" variant={variant} aria-hidden tabIndex={-1} data-slot="place-reservee" className={cn('invisible h-10 gap-2 sm:h-8', className)}>
        <CalendarPlus className="size-4" aria-hidden />
        {t('cta')}
      </Button>
    ) : null;
  }
  return (
    <>
      <Button type="button" variant={variant} className={cn('h-10 gap-2 sm:h-8', className)} onClick={() => setOuvert(true)}>
        <CalendarPlus className="size-4" aria-hidden />
        {t('cta')}
      </Button>
      {ouvert ? <PlanifierDialog {...preRemplissage} onClose={() => setOuvert(false)} /> : null}
    </>
  );
}

const TYPES = ['in_person', 'virtual', 'self_guided', 'hybrid'] as const;
type TypeDeVisite = (typeof TYPES)[number];

/** L'heure choisie : une pastille (son instant exact, rendu par le serveur) ou l'heure libre. */
type HeureChoisie = { readonly sorte: 'creneau'; readonly start: string; readonly label: string } | { readonly sorte: 'libre'; readonly label: string };

type Erreurs = Partial<Record<'property' | 'customer' | 'name' | 'phone' | 'jour' | 'heure' | 'general', string>>;

/** Les champs de l'API → la section de la feuille où l'erreur s'affiche. */
const CHAMP_DE_L_ERREUR: Record<string, keyof Erreurs> = {
  property_id: 'property',
  customer_id: 'customer',
  contact_lead_id: 'customer',
  visitor_name: 'name',
  visitor_phone: 'phone',
  scheduled_at: 'heure',
  duration_minutes: 'heure',
};

/**
 * La feuille seule, sans son bouton (TCK-2586) : plein écran au téléphone (en-tête de formulaire,
 * bouton collant qui redit le choix), panneau latéral de 480 px dès `xl` (`PanneauDroit`). TCK-2581
 * l'ouvre depuis « Planifier une 2ᵉ visite » (client et bien de la visite posés) et apprend la
 * réussite par `onPlanifiee`.
 */
export function PlanifierDialog({
  property,
  customer,
  demande,
  jour: jourInitial,
  heure: heureInitiale,
  onClose,
  onPlanifiee,
}: PreRemplissage & { readonly onClose: () => void; readonly onPlanifiee?: () => void }) {
  const t = useTranslations('visitPlanning.plan');
  const tType = useTranslations('visits.type');
  const locale = useLocale();
  const messageErreur = useMessageErreurApi();
  const plan = usePlanVisit();

  // P230.05 — le premier jour est celui de l'API (Dakar est à UTC+0), jamais celui du navigateur.
  const [maintenant] = useState(() => new Date());
  const premierJour = jourDeLApi(maintenant);
  const jours = joursProposes(maintenant);

  const [bien, setBien] = useState<BienAPlanifier | null>(property ?? null);
  const [client, setClient] = useState<ClientAPlanifier | null>(customer ?? null);
  const [sansFiche, setSansFiche] = useState(false);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [jour, setJour] = useState<string | null>(jourInitial ?? null);
  // Depuis une demande, quatre pastilles de jour (a-1) ; ailleurs, cinq (a-5).
  const joursMontres = demande ? jours.slice(0, 4) : jours;
  const [autreDate, setAutreDate] = useState(jourInitial !== undefined && !joursMontres.includes(jourInitial));
  const [heure, setHeure] = useState<HeureChoisie | null>(heureInitiale ? { sorte: 'libre', label: heureInitiale } : null);
  const [autreHeure, setAutreHeure] = useState(false);
  // « Autre heure… » porte le focus sur le champ qu'il fait apparaître (le champ se monte après le geste).
  const focaliserLHeure = useRef(false);
  const [type, setType] = useState<TypeDeVisite>('in_person');
  const [note, setNote] = useState('');
  const [creerFiche, setCreerFiche] = useState(true);
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [doublons, setDoublons] = useState<readonly CustomerDuplicateMatch[] | null>(null);
  const [resultat, setResultat] = useState<VisitePlanifiee | null>(null);

  const creneaux = useCreneauxDeVisite(bien?.id ?? null, jour);
  const proposes = creneauxProposes(creneaux.data?.data.slots ?? [], maintenant);

  // L'heure de l'agenda (`heureInitiale`) devient la pastille du même créneau s'il est libre ; sinon
  // elle reste l'heure libre, que la saisie « Autre heure… » montre.
  const pastilleDeLHeure = heure?.sorte === 'libre' ? proposes.find((c) => c.label === heure.label && c.sort === 'libre') : undefined;
  if (pastilleDeLHeure && heure?.sorte === 'libre' && !autreHeure) {
    setHeure({ sorte: 'creneau', start: pastilleDeLHeure.start, label: pastilleDeLHeure.label });
  }
  const heureLibreVisible = autreHeure || (heure?.sorte === 'libre' && creneaux.isSuccess && !pastilleDeLHeure);

  const changerDeBien = (suivant: BienAPlanifier | null) => {
    setBien(suivant);
    // Un autre bien, d'autres créneaux : l'heure choisie ne vaut plus.
    if (suivant?.id !== bien?.id) setHeure(null);
    setErreurs((e) => ({ ...e, property: undefined, heure: undefined }));
  };
  const changerDeJour = (suivant: string | null) => {
    setJour(suivant);
    if (suivant !== jour) setHeure(null);
    setErreurs((e) => ({ ...e, jour: undefined, heure: undefined }));
  };

  const prenomDuVisiteur =
    demande?.prenom ?? demande?.nom.split(' ')[0] ?? (client ? client.libelle.split(' ')[0] : sansFiche && nom.trim() ? nom.trim().split(' ')[0] : null);
  const resume = jour && heure ? `${jourEnClair(jour, locale)} ${heure.label}` : null;

  function verifier(): Erreurs {
    const manque: Erreurs = {};
    if (bien === null) manque.property = t('requiredProperty');
    if (jour === null) manque.jour = t('requiredDay');
    if (heure === null) manque.heure = t('requiredTime');
    if (!demande && client === null) {
      if (!sansFiche) manque.customer = t('requiredCustomer');
      else {
        if (nom.trim() === '') manque.name = t('requiredName');
        if (telephone === '') manque.phone = t('requiredPhone');
      }
    }
    return manque;
  }

  function corps(options: { readonly forcer?: boolean; readonly ficheChoisie?: number } = {}): PlanVisitPayload | null {
    if (bien === null || jour === null || heure === null) return null;
    const scheduled_at = heure.sorte === 'creneau' ? heure.start : instantADakar(jour, heure.label);
    const base: PlanVisitPayload = { property_id: bien.id, scheduled_at, type, ...(note.trim() ? { notes: note.trim() } : {}) };
    if (demande) {
      const fiche = options.ficheChoisie ?? demande.ficheId ?? null;
      if (fiche !== null) return { ...base, contact_lead_id: demande.id, customer_id: fiche };
      if (creerFiche) {
        return { ...base, contact_lead_id: demande.id, create_customer: true, ...(options.forcer ? { allow_duplicate: true } : {}) };
      }
      return {
        ...base,
        contact_lead_id: demande.id,
        visitor_name: demande.nom,
        ...(demande.telephone ? { visitor_phone: demande.telephone } : {}),
      };
    }
    if (client) return { ...base, customer_id: client.id };
    return { ...base, visitor_name: nom.trim(), visitor_phone: telephone };
  }

  async function envoyer(options: { readonly forcer?: boolean; readonly ficheChoisie?: number } = {}) {
    const manque = verifier();
    setErreurs(manque);
    if (Object.keys(manque).length > 0) return;
    const charge = corps(options);
    if (charge === null || jour === null || heure === null || bien === null) return;
    setDoublons(null);
    try {
      const reponse = await plan.mutateAsync(charge);
      const ficheId =
        options.ficheChoisie ?? demande?.ficheId ?? reponse.data?.customer_id ?? (client ? client.id : null) ?? null;
      setResultat({
        id: reponse.data.id,
        jour,
        heure: heure.label,
        bien,
        visiteur: demande?.nom ?? client?.libelle ?? (nom.trim() || null),
        prenom: prenomDuVisiteur,
        telephone: demande?.telephone ?? client?.telephone ?? (telephone || null),
        smsRetenu: smsRetenu(reponse),
        ficheId: typeof ficheId === 'number' ? ficheId : null,
        ficheCreee: Boolean(demande && charge.create_customer),
      });
      onPlanifiee?.();
    } catch (err) {
      const existants = doublonsDe(err);
      if (existants) {
        setDoublons(existants);
        return;
      }
      const parChamp = err instanceof ApiError ? err.validationErrors : undefined;
      if (parChamp && Object.keys(parChamp).length > 0) {
        const suivantes: Erreurs = {};
        for (const [champ, messages] of Object.entries(parChamp)) {
          const cle = CHAMP_DE_L_ERREUR[champ] ?? 'general';
          suivantes[cle] ??= messages[0];
        }
        setErreurs(suivantes);
        return;
      }
      // `visit.slot_overlap` (422 sans champ) : le créneau vient d'être pris — l'erreur va sous
      // « Quelle heure ? », et les créneaux sont relus. `visit.agent_overlap` (TCK-2744) : l'agent
      // a déjà une visite confirmée à cette heure, dans quelque agence que ce soit — même place,
      // même relecture. Les autres 422 sans champ (`lead.not_convertible`,
      // `lead.without_agency`) vont au bas de la feuille.
      const code = err instanceof ApiError && err.status === 422 ? codeDe(err) : null;
      if (code === 'visit.slot_overlap' || code === 'visit.agent_overlap') {
        setErreurs({ heure: messageErreur(err, t('requiredTime')) });
        void creneaux.refetch();
        return;
      }
      setErreurs({ general: messageErreur(err, t('genericError')) });
    }
  }

  const depuisUneDemande = demande !== undefined;
  const titre = demande ? t('titleWith', { name: prenomDuVisiteur ?? demande.nom }) : t('title');

  if (resultat) {
    const gestes = (
      <GestesDuSucces
        visite={resultat}
        depuisUneDemande={depuisUneDemande}
        messageWhatsApp={t('whatsAppMessage', {
          name: resultat.prenom ?? '',
          property: resultat.bien.libelle,
          when: `${jourEnClair(resultat.jour, locale)} ${resultat.heure}`,
        })}
        onFermer={onClose}
        onAutreVisite={() => {
          setResultat(null);
          setHeure(null);
          setNote('');
        }}
      />
    );
    // a-6 : les gestes sous la carte, sans pied ; a-2 (depuis une demande) : les gestes au pied.
    return (
      <PanneauDroit
        open
        formulaire
        onOpenChange={(o) => !o && onClose()}
        titre={titre}
        sousTitre={depuisUneDemande ? t('doneStep') : undefined}
        pied={depuisUneDemande ? gestes : undefined}
      >
        <SuccesDeLaPlanification visite={resultat} depuisUneDemande={depuisUneDemande} />
        {depuisUneDemande ? null : gestes}
      </PanneauDroit>
    );
  }

  return (
    <PanneauDroit
      open
      formulaire
      onOpenChange={(o) => !o && onClose()}
      titre={titre}
      sousTitre={depuisUneDemande ? t('fromLeadStep') : undefined}
      pied={
        <>
          <Button type="button" variant="ghost" className="max-xl:hidden" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="planifier-une-visite"
            size="xl"
            disabled={plan.isPending}
            className="xl:h-controle xl:px-3.5 xl:text-sm"
          >
            {resume ? t('submitWith', { when: resume }) : t('submit')}
          </Button>
        </>
      }
    >
      <form
        id="planifier-une-visite"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer();
        }}
        className={depuisUneDemande ? 'space-y-5' : 'space-y-6'}
      >
        {demande ? (
          <>
            {bien === null ? <ChoixDuBien bien={null} onChoisir={changerDeBien} erreur={erreurs.property} /> : null}
            <CarteDeLaDemande bien={bien} onChangerDeBien={() => changerDeBien(null)} nom={demande.nom} telephone={demande.telephone} />
          </>
        ) : (
          <ChoixDuBien bien={bien} onChoisir={changerDeBien} erreur={erreurs.property} />
        )}

        {demande ? null : (
          <ChoixDuClient
            client={client}
            onChoisir={(c) => {
              setClient(c);
              setErreurs((e) => ({ ...e, customer: undefined }));
            }}
            sansFiche={sansFiche}
            onSansFiche={(coche) => {
              setSansFiche(coche);
              if (coche) setClient(null);
            }}
            erreur={erreurs.customer}
            champsSansFiche={
              <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="plan-name" className="block text-sm font-medium text-foreground">
                    {t('name')}
                  </label>
                  <Input
                    id="plan-name"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    aria-invalid={erreurs.name ? true : undefined}
                    aria-describedby={erreurs.name ? 'plan-name-erreur' : undefined}
                  />
                  {erreurs.name ? (
                    <p id="plan-name-erreur" role="alert" className="text-sm text-destructive">
                      {erreurs.name}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="plan-phone" className="block text-sm font-medium text-foreground">
                    {t('phone')}
                  </label>
                  <PhoneInput
                    id="plan-phone"
                    value={telephone}
                    onValueChange={setTelephone}
                    aria-invalid={erreurs.phone ? true : undefined}
                    aria-describedby={erreurs.phone ? 'plan-phone-erreur' : undefined}
                  />
                  {erreurs.phone ? (
                    <p id="plan-phone-erreur" role="alert" className="text-sm text-destructive">
                      {erreurs.phone}
                    </p>
                  ) : null}
                </div>
              </div>
            }
          />
        )}

        <div role="group" aria-labelledby="plan-day-titre">
          <TitreDeSection id="plan-day-titre" fort={depuisUneDemande} className="mb-2">
            {t('whichDay')}
          </TitreDeSection>
          {/* a-5 : cinq jours en pastilles qui se suivent ; a-1 (demande) : quatre, avec le mois, sur trois colonnes. */}
          <div className={depuisUneDemande ? 'grid grid-cols-3 gap-2' : 'flex flex-wrap gap-2'}>
            {joursMontres.map((j, i) => (
              <PastilleDeChoix
                key={j}
                actif={!autreDate && jour === j}
                onChoisir={() => {
                  setAutreDate(false);
                  changerDeJour(j);
                }}
                className={depuisUneDemande ? 'px-2' : undefined}
              >
                {i === 0 ? t('today') : i === 1 ? t('tomorrow') : depuisUneDemande ? capitaliser(jourEnClair(j, locale)) : etiquetteDuJour(j, locale)}
              </PastilleDeChoix>
            ))}
            <PastilleDeChoix actif={autreDate} onChoisir={() => setAutreDate(true)} className={depuisUneDemande ? 'px-2' : undefined}>
              {t('otherDate')}
            </PastilleDeChoix>
          </div>
          {autreDate ? (
            <div className="mt-2 space-y-1.5">
              <label htmlFor="plan-date" className="block text-sm font-medium text-foreground">
                {t('date')}
              </label>
              <Input
                id="plan-date"
                type="date"
                min={premierJour}
                max={decalerJour(premierJour, 60)}
                value={jour ?? ''}
                onChange={(e) => changerDeJour(e.target.value || null)}
              />
            </div>
          ) : null}
          {erreurs.jour ? (
            <p role="alert" className="mt-1.5 text-sm text-destructive">
              {erreurs.jour}
            </p>
          ) : null}
        </div>

        <div role="group" aria-labelledby="plan-time-titre">
          <TitreDeSection id="plan-time-titre" fort={depuisUneDemande} droite={depuisUneDemande ? undefined : t('slotsHint')}>
            {t('whichTime')}
          </TitreDeSection>
          <CreneauxDuJour
            enGrille={depuisUneDemande}
            etat={bien === null || jour === null ? 'en-attente' : creneaux.isError ? 'erreur' : creneaux.isPending ? 'chargement' : 'pret'}
            proposes={proposes}
            heure={heure}
            autreHeure={heureLibreVisible}
            onChoisir={(c) => {
              setAutreHeure(false);
              setHeure({ sorte: 'creneau', start: c.start, label: c.label });
              setErreurs((e) => ({ ...e, heure: undefined }));
            }}
            onAutreHeure={() => {
              focaliserLHeure.current = true;
              setAutreHeure(true);
              setHeure(null);
            }}
            onRelire={() => void creneaux.refetch()}
          />
          {heureLibreVisible ? (
            <div className="mt-2 space-y-1.5">
              <label htmlFor="plan-time" className="block text-sm font-medium text-foreground">
                {t('time')} <span className="font-normal text-muted-foreground">({t('dakarTime')})</span>
              </label>
              <Input
                id="plan-time"
                ref={(champ) => {
                  if (champ && focaliserLHeure.current) {
                    focaliserLHeure.current = false;
                    champ.focus();
                  }
                }}
                type="time"
                step={300}
                value={heure?.sorte === 'libre' ? heure.label : ''}
                onChange={(e) => setHeure(e.target.value ? { sorte: 'libre', label: e.target.value } : null)}
                className="tabular-nums"
              />
            </div>
          ) : null}
          {erreurs.heure ? (
            <p role="alert" className="mt-1.5 text-sm text-destructive">
              {erreurs.heure}
            </p>
          ) : null}
        </div>

        {demande ? null : (
          <div role="group" aria-labelledby="plan-type-titre">
            <TitreDeSection id="plan-type-titre" className="mb-2">
              {t('visitType')}
            </TitreDeSection>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((tp) => (
                <PastilleDeChoix key={tp} actif={type === tp} onChoisir={() => setType(tp)}>
                  {tType(tp)}
                </PastilleDeChoix>
              ))}
            </div>
          </div>
        )}

        {demande ? null : (
          <div>
            <label htmlFor="plan-note" className="mb-1.5 block text-sm font-medium">
              {t('note')} <span className="font-normal text-muted-foreground">{t('optional')}</span>
            </label>
            <Textarea id="plan-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
          </div>
        )}

        {demande && !demande.ficheId ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3.5">
            <Checkbox checked={creerFiche} onCheckedChange={(c) => setCreerFiche(c === true)} className="mt-0.5" />
            <span className="min-w-0 flex-1 text-corps leading-snug font-medium">
              {t('createCustomer')}
              <span className="mt-0.5 block text-ui font-normal text-muted-foreground">{t('createCustomerHint')}</span>
            </span>
          </label>
        ) : null}

        {doublons ? (
          <div role="status" className="space-y-2 rounded-xl border border-border bg-card p-3.5 text-sm">
            <p className="font-medium">{t('duplicateTitle')}</p>
            <ul className="space-y-2">
              {doublons.map((d, i) => (
                <li key={d.id ?? `cachee-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{d.name ?? t('duplicateHidden')}</span>
                  {d.id !== null ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void envoyer({ ficheChoisie: d.id ?? undefined })}>
                      {t('duplicateUse')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <Button type="button" variant="ghost" size="sm" onClick={() => void envoyer({ forcer: true })}>
              {t('duplicateCreateAnyway')}
            </Button>
          </div>
        ) : null}

        {erreurs.general ? (
          <p role="alert" className="text-sm text-destructive">
            {erreurs.general}
          </p>
        ) : null}

        {depuisUneDemande ? (
          <NoteDeLaDemande>{t('bornConfirmedFromLead', { name: prenomDuVisiteur ?? demande.nom })}</NoteDeLaDemande>
        ) : (
          <EncartConfirmee>{prenomDuVisiteur ? t('bornConfirmed', { name: prenomDuVisiteur }) : t('bornConfirmedAnonymous')}</EncartConfirmee>
        )}
      </form>
    </PanneauDroit>
  );
}

function capitaliser(texte: string): string {
  return texte.charAt(0).toLocaleUpperCase() + texte.slice(1);
}

function codeDe(e: ApiError): string | null {
  const data = e.data as { code?: unknown } | null;
  return data && typeof data.code === 'string' ? data.code : null;
}

/** TCK-1343 — les fiches existantes d'un 409 `customer.duplicate`, sinon `null`. */
function doublonsDe(e: unknown): CustomerDuplicateMatch[] | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const data = e.data as { code?: unknown; existing?: unknown } | null;
  if (!data || data.code !== 'customer.duplicate' || !Array.isArray(data.existing)) return null;
  return data.existing as CustomerDuplicateMatch[];
}

/**
 * « Quelle heure ? » : les créneaux libres du jour en pastilles, les pris barrés et non
 * sélectionnables (AC2), une heure passée jamais proposée ; « Autre heure… » ouvre la saisie libre —
 * la console n'est pas bornée à la grille. Trois états : en attente (ni bien ni jour), chargement,
 * erreur (relire) ; une journée sans aucun créneau le dit.
 */
function CreneauxDuJour({
  enGrille,
  etat,
  proposes,
  heure,
  autreHeure,
  onChoisir,
  onAutreHeure,
  onRelire,
}: {
  /** Depuis une demande (a-1) : quatre colonnes, et la règle des créneaux dite dessous. */
  readonly enGrille: boolean;
  readonly etat: 'en-attente' | 'chargement' | 'erreur' | 'pret';
  readonly proposes: ReturnType<typeof creneauxProposes>;
  readonly heure: HeureChoisie | null;
  readonly autreHeure: boolean;
  readonly onChoisir: (c: { readonly start: string; readonly label: string }) => void;
  readonly onAutreHeure: () => void;
  readonly onRelire: () => void;
}) {
  const t = useTranslations('visitPlanning.plan');
  if (etat === 'en-attente') return <p className="text-ui text-muted-foreground">{t('slotsWaiting')}</p>;
  if (etat === 'chargement') {
    return (
      <p className="text-ui text-muted-foreground" aria-busy="true">
        {t('slotsLoading')}
      </p>
    );
  }
  if (etat === 'erreur') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-ui text-destructive">
        {t('slotsError')}
        <Button type="button" variant="outline" size="sm" onClick={onRelire}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  const unPris = proposes.some((c) => c.sort === 'pris');
  return (
    <>
      <div className={enGrille ? 'grid grid-cols-4 gap-2' : 'flex flex-wrap gap-2'}>
        {proposes.map((c) => (
          <PastilleDeChoix
            key={c.start}
            actif={!autreHeure && heure?.sorte === 'creneau' && heure.start === c.start}
            pris={c.sort === 'pris'}
            onChoisir={() => onChoisir(c)}
            className={enGrille ? 'px-0' : 'px-3.5'}
            aria-label={c.sort === 'pris' ? t('slotTaken', { time: c.label }) : undefined}
          >
            {c.label}
          </PastilleDeChoix>
        ))}
        <PastilleDeChoix actif={autreHeure} onChoisir={onAutreHeure} className={enGrille ? 'col-span-2 px-0' : 'px-3.5'}>
          {t('otherTime')}
        </PastilleDeChoix>
      </div>
      {proposes.length === 0 ? <p className="mt-2 text-ui text-muted-foreground">{t('slotsNone')}</p> : null}
      {enGrille ? (
        <p className="mt-2 text-ui text-muted-foreground">{t('slotsHintLead')}</p>
      ) : unPris ? (
        <p className="mt-2 text-ui text-muted-foreground">{t('slotsTakenHint')}</p>
      ) : null}
    </>
  );
}
