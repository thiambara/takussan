'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Users, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { fieldDensityScope } from '@/components/ui/field-density';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useNomDeLAgenceActive } from '@/hooks/useNomDeLAgenceActive';
import { initiales } from '@/lib/fiche-publique';
import { messageErreurApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMessagingContacts, useTrouverLeFilDirect, type MessagingContact, type SectionDeContacts } from '@/lib/queries/conversations';
import { PARTICIPANT_SEARCH_DEBOUNCE_MS } from './ParticipantPicker';
import { GroupLeasePicker, GroupPropertyPicker } from './GroupContextPicker';
import { AlerteErreurs } from './erreursDeValidation';
import { MAX_PARTICIPANTS, useCreationDeGroupe } from './useCreationDeGroupe';
import { useLigneDeContact } from './ligneDeContact';

interface NouvelleConversationProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Un fil existe déjà avec cette personne : on l'ouvre (AC4, aucun `POST`). Aussi : le groupe créé. */
  readonly onOuvrir: (conversationId: number) => void;
  /** Aucun fil : un brouillon, créé au premier envoi. */
  readonly onBrouillon: (personne: MessagingContact) => void;
  /**
   * L'espace propose-t-il un groupe (`usePeutProposerUnGroupe`, TCK-645) ? Faux ou absent : ni
   * interrupteur ni puces, toucher une personne ouvre son fil (fail-closed). Le groupe se crée DANS ce
   * dialogue aux deux formats (TCK-2861) ; TCK-2860 a remplacé le rappel `onNouveauGroupe`, qui
   * n'était plus appelé, par ce drapeau, et retiré `NewGroupDialog`.
   */
  readonly groupePossible?: boolean;
  /** Dès `lg` : le champ « À » encadré et l'aide « Activé d'office… » (maquette e3 bureau). */
  readonly bureau?: boolean;
}

/**
 * TCK-2632 — « Nouvelle conversation » (maquette `app-messagerie`, écran e3) : plein écran au
 * téléphone, dialogue au bureau. Les personnes joignables viennent de `GET /api/conversations/contacts`
 * (périmètre de TCK-565), rangées en sections sans recherche (TCK-2830), en une liste avec.
 *
 * TCK-2861 — un champ « À » à puces, aux deux formats :
 * - toucher une personne la pose en PUCE ; une puce + « Écrire » cherche son fil à deux
 *   (`useTrouverLeFilDirect`) : il s'ouvre s'il existe, sinon un brouillon ;
 * - une DEUXIÈME puce active d'elle-même « Créer un groupe » (nom, bien, bail rattachés) ; retirer
 *   une puce sous deux repasse en direct. L'interrupteur reste un geste : allumé à la main avec zéro
 *   ou une puce, il ouvre le groupe ; à deux puces ou plus, il ne s'éteint pas (un fil direct n'a
 *   qu'une personne) ;
 * - sans groupe proposé par l'espace (fail-closed, TCK-645), pas de puce : toucher une personne ouvre
 *   son fil, et une deuxième ne peut jamais produire un groupe.
 *
 * Si la recherche du fil échoue, on le DIT au lieu d'ouvrir un brouillon : un brouillon envoyé
 * créerait un second fil avec la même personne. Écart assumé : la recherche ne porte que sur le nom.
 */
export function NouvelleConversation({ open, onClose, onOuvrir, onBrouillon, groupePossible = false, bureau = false }: NouvelleConversationProps) {
  const t = useTranslations('messaging.nouvelle');
  const tGroupe = useTranslations('messaging.group.create');
  const tRacine = useTranslations();
  const agence = useNomDeLAgenceActive();
  const [saisie, setSaisie] = useState('');
  const recherche = useDebouncedValue(saisie, PARTICIPANT_SEARCH_DEBOUNCE_MS);
  // TCK-2830 — sans recherche, chaque section lit SA requête (`SectionsDeContacts`) : la liste
  // « tout le périmètre » ne se lit qu'avec un terme.
  const contacts = useMessagingContacts(recherche, { enabled: open && recherche.trim() !== '' });
  const trouver = useTrouverLeFilDirect();
  const [enCours, setEnCours] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const groupe = useCreationDeGroupe();
  const puces = groupe.participants;
  const [groupeManuel, setGroupeManuel] = useState(false);
  const enGroupe = groupePossible && (groupeManuel || puces.length >= 2);
  const choisis = new Set(puces.map((p) => p.id));

  function fermer() {
    setSaisie('');
    setErreur(null);
    setEnCours(null);
    setGroupeManuel(false);
    groupe.reset();
    onClose();
  }

  /** Le fil à deux de cette personne : ouvert s'il existe, sinon un brouillon (TCK-2632, AC4). */
  async function ouvrirLeFil(personne: MessagingContact) {
    if (enCours !== null) return;
    setEnCours(personne.id);
    setErreur(null);
    try {
      const id = await trouver(personne);
      fermer();
      if (id !== null) onOuvrir(id);
      else onBrouillon(personne);
    } catch (err) {
      setErreur(messageErreurApi(err, tRacine, t('rechercheEchouee')));
      setEnCours(null);
    }
  }

  function ajouter(personne: MessagingContact) {
    if (!groupePossible) {
      void ouvrirLeFil(personne);
      return;
    }
    if (choisis.has(personne.id)) return;
    if (puces.length >= MAX_PARTICIPANTS) {
      groupe.setError(tGroupe('maxParticipants', { max: MAX_PARTICIPANTS + 1 }));
      return;
    }
    groupe.setError(null);
    setErreur(null);
    groupe.setParticipants([...puces, personne]);
    setSaisie('');
  }

  function retirer(id: number) {
    const suivantes = puces.filter((p) => p.id !== id);
    groupe.setError(null);
    groupe.setParticipants(suivantes);
    // Sous deux puces, retour au fil direct — même si l'interrupteur avait été allumé à la main.
    if (puces.length >= 2 && suivantes.length < 2) setGroupeManuel(false);
  }

  function auClavier(e: KeyboardEvent<HTMLInputElement>) {
    // Entrée dans « À » ne soumet rien (ni « Écrire », ni « Créer le groupe ») : elle cherche.
    if (e.key === 'Enter') e.preventDefault();
    if (e.key === 'Backspace' && saisie === '' && puces.length > 0) retirer(puces[puces.length - 1]!.id);
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (enGroupe) {
      if (!groupe.verifierLesParticipants()) return;
      const id = await groupe.creer();
      if (id === null) return;
      fermer();
      onOuvrir(id);
      return;
    }
    if (puces.length === 1) await ouvrirLeFil(puces[0]!);
  }

  // Au bureau, en groupe, la liste ne paraît qu'à la recherche (maquette e3 : le formulaire seul) ;
  // au téléphone, elle reste sous le formulaire, où l'on ajoute au pouce.
  const listeVisible = !enGroupe || !bureau || saisie.trim() !== '';
  const piedVisible = puces.length > 0 || enGroupe;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : fermer())}>
      <DialogContent
        data-testid="nouvelle-conversation"
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 max-lg:inset-0 max-lg:h-dvh max-lg:max-h-none max-lg:w-full max-lg:max-w-none max-lg:translate-none max-lg:rounded-none lg:max-h-[min(40rem,calc(100dvh-var(--spacing)*16))] lg:max-w-[32.5rem]"
      >
        {/*
          TCK-2632 — maquette `app-messagerie` a/3 : au téléphone, l'en-tête d'un écran plein (« ✕ »
          à gauche, puis le titre, comme `EnTeteMobile` en plein écran) ; au bureau, le titre puis
          « ✕ » à droite, comme tout dialogue.
        */}
        <div className="flex h-14 flex-none items-center gap-1 border-b border-border/70 bg-background px-1 lg:gap-0 lg:border-border lg:bg-transparent lg:pr-2 lg:pl-5">
          <DialogClose
            aria-label={tRacine('common.actions.close')}
            className="inline-flex size-11 flex-none items-center justify-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring lg:order-last lg:size-9 lg:rounded-lg"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
          <DialogTitle className="min-w-0 flex-1 truncate font-sans text-base leading-tight font-semibold lg:text-titre-court">{t('titre')}</DialogTitle>
        </div>
        <form
          onSubmit={(e) => void soumettre(e)}
          className="flex min-h-0 flex-1 flex-col"
          data-testid={enGroupe ? 'groupe-en-un-formulaire' : undefined}
          {...fieldDensityScope()}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChampA
              bureau={bureau}
              puces={groupePossible ? puces : []}
              saisie={saisie}
              onSaisie={setSaisie}
              onRetirer={retirer}
              onKeyDown={auClavier}
            />
            {groupePossible ? (
              <InterrupteurDeGroupe
                bureau={bureau}
                actif={enGroupe}
                verrouille={puces.length >= 2}
                onBasculer={(actif) => setGroupeManuel(actif)}
              />
            ) : null}
            {enGroupe ? (
              <div className={cn('grid gap-4', bureau ? 'px-5 pt-4' : 'border-b border-border px-4 py-4')}>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="groupe-nom">
                    {t('nomDuGroupe')}
                  </label>
                  <Input id="groupe-nom" value={groupe.subject} onChange={(e) => groupe.setSubject(e.target.value)} maxLength={120} required />
                </div>
                <div className={cn('grid gap-3', bureau && 'grid-cols-2')}>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="groupe-bien">
                      {t('bienRattache')}
                    </label>
                    <GroupPropertyPicker inputId="groupe-bien" value={groupe.bien} onChange={groupe.choisirBien} />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="groupe-bail">
                      {t('bailRattache')}
                    </label>
                    <GroupLeasePicker inputId="groupe-bail" value={groupe.bail} onChange={groupe.setBail} propertyId={groupe.bien?.id ?? null} />
                  </div>
                </div>
              </div>
            ) : null}
            {groupe.erreurs.length > 0 ? (
              <div className={bureau ? 'px-5 pt-4' : 'px-4 pt-3'}>
                <AlerteErreurs erreurs={groupe.erreurs} />
              </div>
            ) : null}
            {erreur ? (
              <p role="alert" className="px-4 pt-3 text-ui text-destructive">
                {erreur}
              </p>
            ) : null}
            {listeVisible ? (
              recherche.trim() ? (
                // Avec une recherche : UNE liste, par pertinence (TCK-2632), avec la ligne de détail.
                <SectionDePersonnes
                  titre={t('personnes')}
                  requete={contacts}
                  enCours={enCours}
                  onChoisir={ajouter}
                  exclus={choisis}
                  vide={tGroupe('noContact')}
                />
              ) : (
                <SectionsDeContacts open={open} enCours={enCours} onChoisir={ajouter} exclus={choisis} />
              )
            ) : null}
            {!bureau && agence ? (
              // TCK-2861 — la phrase de pied du téléphone (maquette e3), pour l'espace d'une agence
              // seulement : sans agence lue, elle serait fausse.
              <p className="px-4 py-5 text-ui text-muted-foreground">{t('pied', { agence })}</p>
            ) : null}
          </div>
          {piedVisible ? (
            <div className="flex flex-none justify-end gap-2 border-t border-border px-4 py-3 lg:px-5">
              {enGroupe ? (
                <>
                  <Button type="button" variant="outline" onClick={fermer}>
                    {tGroupe('cancel')}
                  </Button>
                  <Button type="submit" disabled={groupe.enCours}>
                    {groupe.enCours ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    {tGroupe('create')}
                  </Button>
                </>
              ) : (
                <Button type="submit" disabled={enCours !== null}>
                  {enCours !== null ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {t('ecrire')}
                </Button>
              )}
            </div>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * TCK-2861 — le champ « À » : les puces retirables, puis la saisie qui cherche. Au téléphone, une
 * rangée précédée de « À : » (maquette e3, l. 750) ; au bureau, un champ encadré titré « À », avec
 * son aide (l. 811).
 */
function ChampA({
  bureau,
  puces,
  saisie,
  onSaisie,
  onRetirer,
  onKeyDown,
}: {
  readonly bureau: boolean;
  readonly puces: readonly MessagingContact[];
  readonly saisie: string;
  readonly onSaisie: (valeur: string) => void;
  readonly onRetirer: (id: number) => void;
  readonly onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations('messaging.nouvelle');
  const tGroupe = useTranslations('messaging.group.create');
  const id = useId();
  const saisieId = `${id}-a`;

  const contenu = (
    <>
      {puces.length > 0 ? (
        <ul aria-label={tGroupe('selectedLabel')} data-testid="participant-chips" className="contents">
          {puces.map((p) => (
            <li key={p.id} className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-secondary pr-1 pl-2.5 text-ui font-medium text-primary-deep">
              <span className="min-w-0 truncate">{p.name}</span>
              <button
                type="button"
                aria-label={tGroupe('removeParticipant', { name: p.name })}
                onClick={() => onRetirer(p.id)}
                className="relative inline-flex size-5 flex-none items-center justify-center rounded-full outline-none after:absolute after:-inset-3 hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {/* La primitive, nue dans la rangée (TCK-2460) : la rangée porte le filet ou le cadre. */}
      <Input
        id={saisieId}
        type="search"
        value={saisie}
        onChange={(e) => onSaisie(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        placeholder={puces.length > 0 ? t('ajouter') : tGroupe('participantInputPlaceholder')}
        aria-describedby={bureau ? `${id}-aide` : undefined}
        className="min-w-[8rem] flex-1 rounded-none border-0 bg-transparent px-1 focus-visible:ring-0"
      />
    </>
  );

  if (bureau) {
    return (
      <div className="px-5 pt-5">
        <label htmlFor={saisieId} className="mb-1.5 block text-sm font-medium">
          {t('a')}
        </label>
        <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring">
          {contenu}
        </div>
        <p id={`${id}-aide`} className="mt-1 text-xs text-muted-foreground">
          {tGroupe('participantsHint')}
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-h-12 flex-none flex-wrap items-center gap-2 border-b border-border px-4 py-1.5 text-corps">
      <label htmlFor={saisieId} className="text-muted-foreground">
        {t('aPrefixe')}
      </label>
      {contenu}
    </div>
  );
}

/**
 * La rangée « Créer un groupe » : un interrupteur (`role="switch"`) dont la rangée entière est la
 * cible (`<label>`). TCK-2748 l'a posé au bureau ; TCK-2861 le pose aussi au téléphone (maquette e3),
 * où il remplace la rangée qui menait à l'ancien dialogue de groupe (retiré par TCK-2860). Au bureau, l'aide dit la bascule
 * automatique ; à deux puces ou plus, il ne s'éteint pas (`readOnly`).
 */
function InterrupteurDeGroupe({
  bureau,
  actif,
  verrouille,
  onBasculer,
}: {
  readonly bureau: boolean;
  readonly actif: boolean;
  readonly verrouille: boolean;
  readonly onBasculer: (actif: boolean) => void;
}) {
  const t = useTranslations('messaging.nouvelle');
  return (
    <div className={bureau ? 'px-5 pt-4' : undefined}>
      <label
        className={
          bureau
            ? 'flex cursor-pointer items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5'
            : 'flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 hover:bg-muted/60'
        }
      >
        {bureau ? null : (
          <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-fond-avatar text-accent">
            <Users className="size-5 stroke-[1.75]" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={bureau ? 'block text-sm font-medium' : 'block text-corps font-medium'}>{t('nouveauGroupe')}</span>
          <span className="block text-ui text-muted-foreground">{bureau ? t('aideAutomatique') : t('nouveauGroupeAide')}</span>
        </span>
        <Switch checked={actif} readOnly={verrouille && actif} onCheckedChange={(suivant) => onBasculer(suivant)} />
      </label>
    </div>
  );
}

/** TCK-2830 — l'ordre de la maquette ; chaque code est un `filter[relation]` du serveur. */
const SECTIONS: readonly { readonly code: SectionDeContacts; readonly titre: 'clients' | 'equipe' | 'proprietaires' | 'autres' }[] = [
  { code: 'client', titre: 'clients' },
  { code: 'equipe', titre: 'equipe' },
  { code: 'proprietaire', titre: 'proprietaires' },
  { code: 'autre', titre: 'autres' },
];

type RequeteDeContacts = ReturnType<typeof useMessagingContacts>;

interface ChoixDePersonne {
  readonly enCours: number | null;
  readonly onChoisir: (personne: MessagingContact) => void;
  /** TCK-2861 — les personnes déjà en puce : elles ne sont plus proposées. */
  readonly exclus?: ReadonlySet<number>;
}

/**
 * TCK-2830 — les quatre sections, sans recherche. Le message « personne à joindre » ne paraît
 * qu'une fois TOUTES les réponses arrivées et vides ; une section vide ne s'affiche pas.
 */
function SectionsDeContacts({ open, enCours, onChoisir, exclus }: ChoixDePersonne & { readonly open: boolean }) {
  const t = useTranslations('messaging.nouvelle.sections');
  const tGroupe = useTranslations('messaging.group.create');
  const client = useMessagingContacts('', { enabled: open, section: 'client' });
  const equipe = useMessagingContacts('', { enabled: open, section: 'equipe' });
  const proprietaire = useMessagingContacts('', { enabled: open, section: 'proprietaire' });
  const autre = useMessagingContacts('', { enabled: open, section: 'autre' });
  const requetes: Record<SectionDeContacts, RequeteDeContacts> = { client, equipe, proprietaire, autre };
  const toutes = Object.values(requetes);

  const enChargement = toutes.some((r) => r.isLoading);
  const toutesVides = toutes.every((r) => !r.isError && r.data !== undefined && r.data.data.length === 0);

  return (
    <>
      {SECTIONS.map((s) => (
        <SectionDePersonnes
          key={s.code}
          titre={t(s.titre)}
          requete={requetes[s.code]}
          enCours={enCours}
          onChoisir={onChoisir}
          exclus={exclus}
          masquerSiVide
        />
      ))}
      {enChargement && !toutes.some((r) => (r.data?.data.length ?? 0) > 0) ? (
        <p role="status" className="px-4 py-3 text-ui text-muted-foreground">
          {tGroupe('searching')}
        </p>
      ) : toutesVides ? (
        <p className="px-4 py-3 text-ui text-muted-foreground">{tGroupe('noContactYet')}</p>
      ) : null}
    </>
  );
}

/**
 * Une liste titrée de personnes (une `region` nommée par son titre). Chaque rangée se NOMME par le
 * nom seul et se DÉCRIT par sa ligne de détail. `masquerSiVide` : une section sans personne, ou
 * encore en chargement, ne s'affiche pas (TCK-2830) ; la liste d'une recherche dit « personne ».
 */
function SectionDePersonnes({
  titre,
  requete,
  enCours,
  onChoisir,
  exclus,
  vide,
  masquerSiVide = false,
}: ChoixDePersonne & {
  readonly titre: string;
  readonly requete: RequeteDeContacts;
  readonly vide?: string;
  readonly masquerSiVide?: boolean;
}) {
  const tGroupe = useTranslations('messaging.group.create');
  const ligne = useLigneDeContact();
  const id = useId();
  const personnes = (requete.data?.data ?? []).filter((p) => !exclus?.has(p.id));
  const total = requete.data?.meta.total ?? 0;
  // La troncature se juge sur ce que le SERVEUR a rendu (TCK-973, comme `ParticipantPicker`), pas sur
  // la liste privée des puces : une personne choisie n'est pas « une de plus à préciser ».
  const charges = requete.data?.data.length ?? 0;

  if (masquerSiVide && !requete.isError && personnes.length === 0) return null;

  return (
    <section aria-labelledby={`${id}-titre`}>
      <h3 id={`${id}-titre`} className="px-4 pt-4 pb-1 text-xs font-medium text-muted-foreground">
        {titre}
      </h3>
      {requete.isLoading ? (
        <p role="status" className="px-4 py-3 text-ui text-muted-foreground">
          {tGroupe('searching')}
        </p>
      ) : requete.isError ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="text-ui text-destructive">{tGroupe('contactsError')}</p>
          <button type="button" onClick={() => void requete.refetch()} className="text-ui font-medium underline underline-offset-2">
            {tGroupe('retry')}
          </button>
        </div>
      ) : personnes.length === 0 ? (
        <p className="px-4 py-3 text-ui text-muted-foreground">{vide}</p>
      ) : (
        <ul>
          {personnes.map((p) => {
            const detail = ligne(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChoisir(p)}
                  aria-busy={enCours === p.id || undefined}
                  aria-labelledby={`${id}-${p.id}-nom`}
                  aria-describedby={detail ? `${id}-${p.id}-detail` : undefined}
                  disabled={enCours !== null && enCours !== p.id}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-1.5 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 disabled:opacity-60"
                >
                  <Avatar size="40">
                    {p.avatar_url ? <AvatarImage src={p.avatar_url} alt="" /> : null}
                    {/* Les initiales doublent le nom : la rangée se nomme par le nom seul. */}
                    <AvatarFallback aria-hidden="true">{initiales(p.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span id={`${id}-${p.id}-nom`} className="block truncate text-corps font-medium">
                      {p.name}
                    </span>
                    {detail ? (
                      <span id={`${id}-${p.id}-detail`} className="block truncate text-ui text-muted-foreground">
                        {detail}
                      </span>
                    ) : null}
                  </span>
                  {enCours === p.id ? <Loader2 className="size-4 flex-none animate-spin text-muted-foreground" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!requete.isError && total > charges ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">{tGroupe('moreResults', { shown: charges, total })}</p>
      ) : null}
    </section>
  );
}
