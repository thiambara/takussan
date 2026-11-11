'use client';

import { useEffect, useId, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { Building2, Info, Search } from 'lucide-react';

import { FormAmountInput, FormTextarea } from '@/components/forms';
import { FormDatePicker } from '@/components/forms/FormDatePicker';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { LigneDeListe } from '@/components/ui/ligne-de-liste';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { useToast } from '@/components/ui/toast';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import { jourDeLApi } from '@/lib/jour-de-l-api';
import { useRecordBookingForCustomer } from '@/lib/queries/bookings';
import {
  corpsDeLaDemande,
  ecartAuPrix,
  erreursDeLaDemande,
  natureDuBien,
  type ChampDeLaDemande,
  type NatureSaisie,
} from '@/lib/reservations/saisie-de-demande';
import { cn } from '@/lib/utils';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Booking } from '@/types/booking';

/** Le client posé d'avance (fiche client, visite) ou choisi par la recherche. */
export interface ClientDeLaDemande {
  readonly id: number;
  readonly nom: string;
  /** La ligne sous le nom : son téléphone, ou « Repris de sa visite ». */
  readonly detail?: string | null;
}

/** Le bien posé d'avance (visite) : la feuille relit elle-même sa nature et son prix. */
export interface BienDeLaDemande {
  readonly id: number;
  readonly titre?: string | null;
}

export interface SaisirUneDemandeProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly client?: ClientDeLaDemande;
  readonly bien?: BienDeLaDemande;
  /**
   * Après l'enregistrement. Défaut : la réservation créée s'ouvre. La suite d'une visite
   * (TCK-2581) le remplace pour revenir à « Et maintenant ? » avec la ligne cochée.
   */
  readonly onSuccess?: (reservation: Booking) => void;
}

/** Le bien tel que la feuille le relit (`GET /api/properties/{id}`). */
interface BienLu {
  readonly id: number;
  readonly title: string;
  readonly contract_type: string | null;
  readonly rent_period: string | null;
  readonly price: number | null;
  readonly currency: string | null;
  readonly main_photo_url?: string | null;
}

interface ValeursDuFormulaire {
  montant: number | null;
  dateEntree: string;
  validite: string;
  message: string;
}

/**
 * TCK-2580 (ADR-0102) — « Saisir une demande » : l'agent enregistre la candidature ou l'offre qu'un
 * client lui a faite de vive voix, sans rechercher à nouveau ni le client ni le bien.
 *
 * Maquette `app-reservations` a-8 (« Saisir une offre ») : au téléphone, la FEUILLE DU BAS (voile,
 * coins de 18 px, bouton plein largeur collé en bas) ; dès 1280, le PANNEAU DROIT de 480 px, sans
 * voile, la liste lisible à côté. De `md` à `xl`, la feuille du bas prend déjà la place et la
 * largeur du panneau (TCK-2688) — modal, voile compris.
 *
 * Chaque ouverture repart des valeurs posées par l'appelant : l'état vit dans une SESSION refaite à
 * chaque ouverture (`key`), la fermeture garde la sienne le temps de son animation.
 */
export function SaisirUneDemande({ open, ...props }: SaisirUneDemandeProps) {
  const [session, setSession] = useState(0);
  const [ouvertAvant, setOuvertAvant] = useState(open);
  // L'état dérivé d'une prop, ajusté PENDANT le rendu (et non dans un effet) : une nouvelle session
  // à chaque ouverture, aucune à la fermeture.
  if (open !== ouvertAvant) {
    setOuvertAvant(open);
    if (open) setSession((s) => s + 1);
  }
  return <Session key={session} open={open} {...props} />;
}

function Session({ open, onOpenChange, client: clientDonne, bien: bienDonne, onSuccess }: SaisirUneDemandeProps) {
  const t = useTranslations('saisieDemande');
  const router = useRouter();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const f = useFormatteurs();
  const large = useMatchesMedia('(width >= 80rem)');
  const formId = useId();
  const enregistrer = useRecordBookingForCustomer();

  const [client, setClient] = useState<ClientDeLaDemande | null>(clientDonne ?? null);
  const [bien, setBien] = useState<BienDeLaDemande | null>(bienDonne ?? null);
  const [chercheClient, setChercheClient] = useState(!clientDonne);
  const [chercheBien, setChercheBien] = useState(!bienDonne);
  const [erreurs, setErreurs] = useState<Partial<Record<ChampDeLaDemande, string>>>({});
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  // Le premier jour que l'API accepte (`after_or_equal:today`, à Dakar).
  const [premierJour] = useState(() => jourDeLApi());

  const form = useForm<ValeursDuFormulaire>({
    defaultValues: { montant: null, dateEntree: '', validite: '', message: '' },
  });

  const lecture = useApiQuery<ApiResponse<BienLu>>(
    ['saisie-demande', 'bien', bien?.id ?? 0],
    cheminApi`/api/properties/${bien?.id ?? 0}`,
    { enabled: open && bien !== null },
  );
  const details = bien !== null && lecture.data?.data.id === bien.id ? lecture.data.data : null;
  const natureDonnee = details ? natureDuBien(details) : null;
  const nature: NatureSaisie | null = natureDonnee === 'application' || natureDonnee === 'offer' ? natureDonnee : null;

  // Le loyer ou le prix affiché sert de valeur par défaut — tant que l'agent n'a rien tapé.
  const idDuBienLu = details?.id;
  const prixDuBienLu = details?.price ?? null;
  useEffect(() => {
    if (idDuBienLu === undefined) return;
    if (!form.getFieldState('montant').isDirty) form.setValue('montant', prixDuBienLu);
  }, [idDuBienLu, prixDuBienLu, form]);

  const montant = useWatch({ control: form.control, name: 'montant' });
  const ecart = nature === 'offer' ? ecartAuPrix(montant, details?.price) : null;

  function poser(champ: ChampDeLaDemande, texte: string | null) {
    setErreurs((avant) => {
      const apres = { ...avant };
      if (texte) apres[champ] = texte;
      else delete apres[champ];
      return apres;
    });
  }

  async function valider(valeurs: ValeursDuFormulaire) {
    setErreurGenerale(null);
    const manque: Partial<Record<ChampDeLaDemande, string>> = {};
    if (!client) manque.client = t('requis.client');
    if (!bien) manque.bien = t('requis.bien');
    if (nature === 'offer' && !valeurs.montant) manque.montant = t('requis.montant');
    if (nature === 'application' && !valeurs.dateEntree) manque.dateEntree = t('requis.dateEntree');
    setErreurs(manque);
    if (Object.keys(manque).length > 0 || !client || !bien || !nature) return;

    try {
      const reponse = await enregistrer.mutateAsync(
        corpsDeLaDemande({
          nature,
          propertyId: bien.id,
          customerId: client.id,
          montant: valeurs.montant,
          dateEntree: valeurs.dateEntree,
          validite: valeurs.validite,
          message: valeurs.message,
        }),
      );
      toast.add({
        title: nature === 'offer' ? t('succes.offre') : t('succes.candidature'),
        description: t('succes.description'),
        type: 'success',
      });
      onOpenChange(false);
      if (onSuccess) onSuccess(reponse.data);
      else router.push(`/app/bookings/${reponse.data.id}`);
    } catch (erreur) {
      const { champs, pose } = erreursDeLaDemande(erreur);
      if (pose) {
        const textes: Partial<Record<ChampDeLaDemande, string>> = {};
        for (const [champ, e] of Object.entries(champs) as [ChampDeLaDemande, { cle?: string; texte?: string }][]) {
          textes[champ] = e.cle ? t(`codes.${e.cle}`) : (e.texte ?? '');
        }
        setErreurs(textes);
      } else {
        setErreurGenerale(messageErreur(erreur, t('erreur')));
      }
    }
  }

  const libelleDuBouton = nature === 'offer' ? t('enregistrerOffre') : nature === 'application' ? t('enregistrerCandidature') : t('enregistrer');
  const pied = (
    <Button
      type="submit"
      form={formId}
      size={large ? 'default' : 'xl'}
      className={large ? undefined : 'w-full'}
      disabled={enregistrer.isPending || nature === null}
    >
      {enregistrer.isPending ? t('enregistrement') : libelleDuBouton}
    </Button>
  );

  const corps = (
    <form id={formId} noValidate onSubmit={(e) => void form.handleSubmit(valider)(e)} className="space-y-4 pt-1">
      {erreurGenerale ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-ui text-destructive">
          {erreurGenerale}
        </p>
      ) : null}

      <ChampDeChoix libelle={t('client.libelle')} erreur={erreurs.client}>
        {(idLibelle, idErreur) =>
          client && !chercheClient ? (
            <CarteDeChoix
              debut={
                <Avatar size="36" aria-hidden>
                  <AvatarFallback>{initialesDuNom(client.nom)}</AvatarFallback>
                </Avatar>
              }
              titre={client.nom}
              detail={client.detail}
              fin={
                <button
                  type="button"
                  onClick={() => setChercheClient(true)}
                  aria-label={t('client.changerLibelle')}
                  className="inline-flex h-11 shrink-0 items-center rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {t('client.changer')}
                </button>
              }
            />
          ) : (
            <RechercheDeChoix<ClientCherche>
              idLibelle={idLibelle}
              idErreur={idErreur}
              invalide={Boolean(erreurs.client)}
              placeholder={t('client.placeholder')}
              aucun={t('client.aucun')}
              chemin="/api/customers"
              table="customers"
              champs={['id', 'first_name', 'last_name', 'email', 'phone']}
              ligne={(c) => ({ id: c.id, titre: nomAffichable(c), detail: c.phone ?? c.email })}
              debut={(c) => (
                <Avatar size="40" aria-hidden>
                  <AvatarFallback>{initialesDuNom(nomAffichable(c))}</AvatarFallback>
                </Avatar>
              )}
              onChoisir={(c) => {
                setClient({ id: c.id, nom: nomAffichable(c), detail: c.phone ?? c.email });
                setChercheClient(false);
                poser('client', null);
              }}
            />
          )
        }
      </ChampDeChoix>

      <ChampDeChoix libelle={t('bien.libelle')} erreur={erreurs.bien}>
        {(idLibelle, idErreur) =>
          bien && !chercheBien ? (
            <CarteDeChoix
              debut={<VignetteDuBien photo={details?.main_photo_url ?? null} />}
              titre={details?.title ?? bien.titre ?? t('bien.chargement')}
              detail={details ? ligneDuBien(details, t, f.montantCourt) : null}
              fin={
                <button
                  type="button"
                  onClick={() => setChercheBien(true)}
                  aria-label={t('bien.changerLibelle')}
                  className="inline-flex size-11 shrink-0 items-center justify-end rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <Search className="size-4.5" aria-hidden />
                </button>
              }
            />
          ) : (
            <RechercheDeChoix<BienCherche>
              idLibelle={idLibelle}
              idErreur={idErreur}
              invalide={Boolean(erreurs.bien)}
              placeholder={t('bien.placeholder')}
              aucun={t('bien.aucun')}
              chemin="/api/properties"
              table="properties"
              champs={['id', 'title', 'contract_type', 'rent_period', 'price', 'currency']}
              ligne={(b) => ({ id: b.id, titre: b.title, detail: ligneDuBien(b, t, f.montantCourt) })}
              debut={(b) => <VignetteDuBien photo={b.main_photo_url ?? null} />}
              onChoisir={(b) => {
                setBien({ id: b.id, titre: b.title });
                setChercheBien(false);
                poser('bien', null);
                poser('nature', null);
              }}
            />
          )
        }
      </ChampDeChoix>

      <div>
        <p id={`${formId}-nature`} className="mb-1.5 text-sm font-medium">
          {t('nature.libelle')}
        </p>
        <ChoixDeLaNature
          labelledBy={`${formId}-nature`}
          decritPar={`${formId}-nature-raison`}
          valeur={nature}
          candidature={t('nature.candidature')}
          offre={t('nature.offre')}
        />
        <p id={`${formId}-nature-raison`} className="mt-1 text-xs text-muted-foreground">
          {raisonDeLaNature(natureDonnee, bien !== null, t)}
        </p>
        {erreurs.nature ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {erreurs.nature}
          </p>
        ) : null}
      </div>

      {nature ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FormAmountInput<ValeursDuFormulaire>
              name="montant"
              control={form.control}
              label={nature === 'offer' ? t('montant.offre') : t('montant.loyer')}
              currency={details?.currency ?? 'XOF'}
              unite={nature === 'offer' ? t('montant.unite') : details?.rent_period === 'yearly' ? t('montant.uniteAn') : t('montant.uniteMois')}
              required={nature === 'offer'}
              aria-invalid={erreurs.montant ? true : undefined}
            />
            {erreurs.montant ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {erreurs.montant}
              </p>
            ) : null}
          </div>
          <div>
            {nature === 'application' ? (
              <FormDatePicker<ValeursDuFormulaire>
                name="dateEntree"
                control={form.control}
                label={t('dateEntree')}
                min={premierJour}
                required
              />
            ) : (
              <FormDatePicker<ValeursDuFormulaire>
                name="validite"
                control={form.control}
                label={t('validite')}
                min={premierJour}
                placeholder={t('facultatif')}
              />
            )}
            {(nature === 'application' ? erreurs.dateEntree : erreurs.validite) ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {nature === 'application' ? erreurs.dateEntree : erreurs.validite}
              </p>
            ) : null}
          </div>
          {ecart !== null && details?.price ? (
            <p data-slot="ecart-au-prix" className="col-span-2 -mt-1 text-xs text-muted-foreground tabular-nums">
              {t('montant.ecart', {
                ecart: f.pourcentage(ecart, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }),
                prix: f.montantCourt(details.price, details.currency),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <FormTextarea<ValeursDuFormulaire>
        name="message"
        control={form.control}
        label={t('message')}
        placeholder={t('messagePlaceholder')}
        rows={3}
        className="min-h-19"
      />

      {/* La maquette dit « … et pourra compléter son dossier » : aucun dossier n'existe en base ; le
          texte dit ce qui est vrai (TCK-2579 : le client prévenu peut annuler). */}
      <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-ui leading-snug text-encre-douce">
        <Info className="mt-0.5 size-4 flex-none" aria-hidden />
        {t('prevenu')}
      </p>
    </form>
  );

  return large ? (
    <PanneauDroit open={open} onOpenChange={(suivant) => onOpenChange(suivant)} titre={t('titre')} pied={pied}>
      {corps}
    </PanneauDroit>
  ) : (
    <FeuilleDuBas open={open} onOpenChange={(suivant) => onOpenChange(suivant)} titre={t('titre')} pied={pied}>
      {corps}
    </FeuilleDuBas>
  );
}

interface ClientCherche {
  readonly id: number;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

interface BienCherche {
  readonly id: number;
  readonly title: string;
  readonly contract_type: string | null;
  readonly rent_period: string | null;
  readonly price: number | null;
  readonly currency: string | null;
  readonly main_photo_url?: string | null;
}

type Traduction = ReturnType<typeof useTranslations<'saisieDemande'>>;

/** « À louer · 250 000 F/mois », « À vendre · 95 000 000 F ». */
function ligneDuBien(
  b: { readonly contract_type: string | null; readonly rent_period: string | null; readonly price: number | null; readonly currency: string | null },
  t: Traduction,
  montantCourt: (v: number | null | undefined, devise?: string | null) => string,
): string {
  const vente = b.contract_type === 'sale';
  const prix = b.price !== null ? montantCourt(b.price, b.currency) : null;
  const affiche =
    prix === null
      ? null
      : vente
        ? prix
        : b.rent_period === 'yearly'
          ? t('bien.parAn', { prix })
          : b.rent_period === 'monthly' || b.rent_period === null
            ? t('bien.parMois', { prix })
            : prix;
  return [vente ? t('bien.aVendre') : t('bien.aLouer'), affiche].filter(Boolean).join(' · ');
}

function raisonDeLaNature(nature: NatureSaisie | 'stay' | null, bienChoisi: boolean, t: Traduction): string {
  if (nature === 'application') return t('nature.raisonLocation');
  if (nature === 'offer') return t('nature.raisonVente');
  if (nature === 'stay') return t('nature.raisonSejour');
  return bienChoisi ? t('bien.chargement') : t('nature.choisirLeBien');
}

/** Les initiales d'un nom affiché (« Bineta Ndoye » → « BN »). */
function initialesDuNom(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => Array.from(mot)[0]?.toLocaleUpperCase('fr') ?? '')
    .join('');
}

/** Un libellé (14/500), son champ, son erreur reliée — le libellé nomme aussi la recherche. */
function ChampDeChoix({
  libelle,
  erreur,
  children,
}: {
  readonly libelle: string;
  readonly erreur?: string;
  readonly children: (idLibelle: string, idErreur: string | undefined) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <p id={`${id}-libelle`} className="mb-1.5 text-sm font-medium">
        {libelle}
      </p>
      {children(`${id}-libelle`, erreur ? `${id}-erreur` : undefined)}
      {erreur ? (
        <p id={`${id}-erreur`} role="alert" className="mt-1 text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

/** La carte d'un choix posé : 60 px, bord, fond de carte (maquette : client et bien). */
function CarteDeChoix({
  debut,
  titre,
  detail,
  fin,
}: {
  readonly debut: React.ReactNode;
  readonly titre: React.ReactNode;
  readonly detail?: React.ReactNode;
  readonly fin: React.ReactNode;
}) {
  return (
    <div data-slot="carte-de-choix" className="flex min-h-[3.75rem] items-center gap-3 rounded-lg border border-border bg-card px-3">
      {debut}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-corps leading-normal font-medium">{titre}</span>
        {detail ? <span className="block truncate text-ui leading-normal text-muted-foreground tabular-nums">{detail}</span> : null}
      </span>
      {fin}
    </div>
  );
}

function VignetteDuBien({ photo }: { readonly photo: string | null }) {
  return photo ? (
    <Image src={photo} alt="" width={40} height={40} className="size-10 flex-none rounded-lg bg-muted object-cover" />
  ) : (
    <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Building2 className="size-5" />
    </span>
  );
}

/**
 * La recherche d'un client ou d'un bien, DANS la feuille : un champ et la liste des résultats en
 * lignes de 56 px (`LigneDeListe`, des boutons). Pas de liste déroulante flottante : dans une
 * feuille du bas, au pouce, la liste est la place qui reste. Recherche SERVEUR (`filter[search]`,
 * sparse fieldsets), temporisée.
 */
function RechercheDeChoix<T extends { readonly id: number }>({
  idLibelle,
  idErreur,
  invalide,
  placeholder,
  aucun,
  chemin,
  table,
  champs,
  ligne,
  debut,
  onChoisir,
}: {
  readonly idLibelle: string;
  readonly idErreur?: string;
  readonly invalide: boolean;
  readonly placeholder: string;
  readonly aucun: string;
  readonly chemin: string;
  readonly table: string;
  readonly champs: readonly string[];
  readonly ligne: (r: T) => { readonly id: number; readonly titre: string; readonly detail?: string | null };
  readonly debut: (r: T) => React.ReactNode;
  readonly onChoisir: (r: T) => void;
}) {
  const t = useTranslations('saisieDemande');
  const [terme, setTerme] = useState('');
  const recherche = useDebouncedValue(terme.trim(), 250);
  const resultats = useApiQuery<PaginatedResponse<T>>([chemin, 'saisie-demande', recherche], chemin, {
    params: {
      fields: { [table]: [...champs] },
      filter: recherche ? { search: recherche } : {},
      per_page: 6,
    },
  });
  const lignes = resultats.data?.data ?? [];
  const enAttente = terme.trim() !== recherche || resultats.isFetching;

  return (
    <div className="space-y-2">
      <Input
        type="search"
        aria-labelledby={idLibelle}
        aria-describedby={idErreur}
        aria-invalid={invalide || undefined}
        placeholder={placeholder}
        value={terme}
        onChange={(e) => setTerme(e.target.value)}
        autoComplete="off"
      />
      <div aria-live="polite" className="sr-only">
        {enAttente ? t('recherche.enCours') : null}
      </div>
      {resultats.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {t('recherche.erreur')}
        </p>
      ) : lignes.length > 0 ? (
        <ul className={cn('overflow-hidden rounded-lg border border-border bg-card', enAttente && 'opacity-70')}>
          {lignes.map((r) => {
            const l = ligne(r);
            return (
              <li key={l.id} className="[&:last-child>*]:border-b-0">
                <LigneDeListe titre={l.titre} detail={l.detail} debut={debut(r)} onClick={() => onChoisir(r)} />
              </li>
            );
          })}
        </ul>
      ) : !enAttente ? (
        <p className="text-ui text-muted-foreground">{aucun}</p>
      ) : null}
    </div>
  );
}

/**
 * La nature en CONTRÔLE SEGMENTÉ (maquette `Segmente`) — sémantiquement un groupe radio : la nature
 * du bien est cochée, l'autre désactivée, et la phrase sous le contrôle dit pourquoi
 * (`aria-describedby`). Ce n'est pas un choix de l'agent : le bien décide (ADR-0102).
 */
function ChoixDeLaNature({
  labelledBy,
  decritPar,
  valeur,
  candidature,
  offre,
}: {
  readonly labelledBy: string;
  readonly decritPar: string;
  readonly valeur: NatureSaisie | null;
  readonly candidature: string;
  readonly offre: string;
}) {
  const options: readonly { readonly valeur: NatureSaisie; readonly libelle: string }[] = [
    { valeur: 'application', libelle: candidature },
    { valeur: 'offer', libelle: offre },
  ];
  return (
    <RadioGroupPrimitive
      aria-labelledby={labelledBy}
      aria-describedby={decritPar}
      value={valeur ?? ''}
      className="flex rounded-xl bg-muted p-1"
    >
      {options.map((o) => (
        <RadioPrimitive.Root
          key={o.valeur}
          value={o.valeur}
          disabled={valeur !== o.valeur}
          className={cn(
            'inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm outline-none',
            'focus-visible:ring-3 focus-visible:ring-ring',
            'data-checked:bg-card data-checked:font-semibold data-checked:text-foreground data-checked:shadow-sm',
            'data-unchecked:font-medium data-unchecked:text-muted-foreground data-disabled:cursor-not-allowed',
          )}
        >
          {o.libelle}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}
