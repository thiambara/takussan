'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { CalendarCheck, ChevronDown, KeyIcon, MapPinIcon, Pencil, SparklesIcon, VideoIcon, XIcon } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { DemandeDeVisiteRefusee, useVisitRequest } from '@/hooks/useVisitRequest';
import { MentionDeConfidentialite } from '@/components/public/MentionDeConfidentialite';
import { arrivee } from '@/lib/attribution';
import { lireCoordonnees, retenirCoordonnees } from '@/lib/coordonnees-retenues';
import type { VisitType, VisitWindow } from '@/types/visit';
import { cn } from '@/lib/utils';
import { nomCompletDe } from '@/lib/identite';
import { EtapeQuand } from './visite/EtapeQuand';
import { EtapeEnvoyee, type DemandeEnvoyee } from './visite/EtapeEnvoyee';
import type { BienDeLaVisite } from './visite/RecapDuBien';
import { chargeDeLaDemande, trancheEntamee } from './visite/tranches';
import { useLibellesDeVisite } from './visite/useLibellesDeVisite';

interface PropertyVisitDialogProps {
  readonly property: BienDeLaVisite;
  /** Le nom de la personne qui recevra la demande (TCK-502 : `primary_contact`). */
  readonly contactName?: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
  /** Location au dossier (décision 3a) : l'écran de suite propose de préparer le dossier. */
  readonly onPrepareApplication?: () => void;
}

const VISIT_TYPES: Array<{ value: VisitType; Icon: typeof MapPinIcon }> = [
  { value: 'in_person', Icon: MapPinIcon },
  { value: 'virtual', Icon: VideoIcon },
  { value: 'self_guided', Icon: KeyIcon },
  { value: 'hybrid', Icon: SparklesIcon },
];

const TELEPHONE_RE = /^\+\d{8,15}$/;

/**
 * L'horloge de la boîte : une boîte restée ouverte voit une tranche commencer. Le pas borne le retard
 * de l'affichage ; le clic, lui, relit l'heure réelle et ne choisit jamais une tranche entamée.
 */
const PAS_DE_L_HORLOGE_MS = 15_000;

/** Les champs de l'écran 1 : une erreur de l'API sur l'un d'eux y ramène. */
const CHAMPS_DU_QUAND = ['date', 'preferred_window', 'scheduled_at'] as const;
/** Les champs que la boîte pose sous leur contrôle ; toute autre erreur va dans le bandeau. */
const CHAMPS_POSES = [...CHAMPS_DU_QUAND, 'visitor_name', 'visitor_phone', 'visitor_email'] as const;

type Etape = 'quand' | 'qui' | 'envoyee';

/** Le nom seul pour préremplir le champ : jamais l'e-mail ni le numéro que `libelleDe` prendrait en repli. */
function nomDuCompte(user: { full_name?: string | null; first_name?: string | null; last_name?: string | null }): string {
  return user.full_name?.trim() || nomCompletDe(user) || '';
}

/**
 * TCK-2503 — la demande de visite en DEUX TEMPS : quand (un jour et une tranche de la journée,
 * TCK-2502), puis qui (nom et téléphone), puis un écran de suite qui dit ce qui va se passer.
 *
 * Sous `md`, une feuille plein écran au bouton collant ; au-delà, un dialogue de 520 px au plus.
 * Chaque écran tient sans défiler à 360 px : seul le corps défile si on déplie les options.
 *
 * TCK-590 — aucun compte demandé : nom et téléphone suffisent, e-mail facultatif, et la mention
 * d'information sur les données reste. Connecté, nom et téléphone sont PRÉREMPLIS depuis le compte
 * et envoyés : l'API les préfère à ceux du compte (`PublicPropertyController::visitRequest`).
 *
 * Aucune heure ne part ni ne s'affiche : la tranche n'a qu'un début (09:00, 14:00, 17:00), que
 * l'agent remplace par une heure en confirmant.
 */
export function PropertyVisitDialog({
  property,
  contactName,
  open,
  onOpenChange,
  onSuccess,
  onPrepareApplication,
}: PropertyVisitDialogProps) {
  const t = useTranslations('propertyVisitDialog');
  const tVisit = useTranslations('propertyContact.visit');
  const tCommun = useTranslations('common.actions');
  const libelles = useLibellesDeVisite();
  const id = useId();
  const { user } = useAuth();
  const { submit, submitting, error } = useVisitRequest(property.slug);

  const [etape, setEtape] = useState<Etape>('quand');
  const [jour, setJour] = useState<string | null>(null);
  const [tranche, setTranche] = useState<VisitWindow | null>(null);
  const [type, setType] = useState<VisitType>('in_person');
  const [notes, setNotes] = useState('');
  const [optionsOuvertes, setOptionsOuvertes] = useState(false);
  const [name, setName] = useState(() => (user ? nomDuCompte(user) : lireCoordonnees().name));
  const [phone, setPhone] = useState(() => (user ? (user.phone ?? '') : lireCoordonnees().phone));
  const [email, setEmail] = useState('');
  const [erreurs, setErreurs] = useState<Partial<Record<'name' | 'phone', string>>>({});
  const [serveur, setServeur] = useState<Readonly<Record<string, string[]>>>({});
  const [envoyee, setEnvoyee] = useState<DemandeEnvoyee | null>(null);
  const [maintenant, setMaintenant] = useState(() => new Date());

  const titreQuandRef = useRef<HTMLHeadingElement>(null);
  const titreQuiRef = useRef<HTMLHeadingElement>(null);
  const envoyeeRef = useRef<HTMLDivElement>(null);
  const corpsRef = useRef<HTMLDivElement>(null);
  const etapePrecedente = useRef<Etape>(etape);

  // Au changement d'étape, le focus va au titre du nouvel écran : au clavier, on n'est jamais
  // laissé sur un bouton qui vient de disparaître (AC3).
  useEffect(() => {
    if (etapePrecedente.current === etape) return;
    etapePrecedente.current = etape;
    if (etape === 'quand') titreQuandRef.current?.focus();
    else if (etape === 'qui') titreQuiRef.current?.focus();
    else envoyeeRef.current?.focus();
  }, [etape]);

  // Ouverte, la boîte suit l'heure : une tranche qui commence se grise sans qu'on touche à rien.
  useEffect(() => {
    if (!open || etape === 'envoyee') return;
    // À l'ouverture d'abord (une boîte rouverte des heures plus tard), puis à chaque pas.
    const aLOuverture = setTimeout(() => setMaintenant(new Date()), 0);
    const minuteur = setInterval(() => setMaintenant(new Date()), PAS_DE_L_HORLOGE_MS);
    return () => {
      clearTimeout(aLOuverture);
      clearInterval(minuteur);
    };
  }, [open, etape]);

  // Une tranche entamée — le jour a changé pour aujourd'hui, ou l'heure a passé — n'est plus choisie.
  const trancheValable = jour && tranche && !trancheEntamee(jour, tranche, maintenant) ? tranche : null;
  const quandComplet = jour !== null && trancheValable !== null;
  const resume = jour && tranche ? t('when.summary', { day: libelles.jourCourt(jour), window: libelles.phrase(tranche) }) : null;
  // Le pied de l'écran 1 ne dit que ce qui est RÉELLEMENT choisi : une tranche entamée entre-temps
  // le vide (« Choisissez un jour et un moment »), comme elle désactive « Continuer ».
  const resumeDuChoix = quandComplet ? resume : null;

  /** Le premier contrôle de l'écran ouvert : le choix déjà fait, sinon le premier proposé (AC3). */
  function premierControle(): HTMLElement | null {
    const corps = corpsRef.current;
    if (!corps) return null;
    return (
      corps.querySelector<HTMLElement>('input[type=radio]:checked') ??
      corps.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')
    );
  }

  /** Au clic, l'heure RÉELLE : une tranche commencée depuis le dernier pas de l'horloge est refusée. */
  function choisirTranche(tr: VisitWindow): void {
    const instant = new Date();
    setMaintenant(instant);
    oublier('preferred_window', 'scheduled_at');
    if (jour && trancheEntamee(jour, tr, instant)) return;
    setTranche(tr);
  }

  const premiere = (champ: string): string | undefined => serveur[champ]?.[0];
  const oublier = (...champs: string[]) =>
    setServeur((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !champs.includes(k))));

  const erreurNom = erreurs.name ?? premiere('visitor_name');
  const erreurTelephone = erreurs.phone ?? premiere('visitor_phone');
  const erreurEmail = premiere('visitor_email');
  const bandeau = error && !CHAMPS_POSES.some((c) => serveur[c]) ? error : null;

  function fermer(next: boolean): void {
    if (!next && envoyee) {
      // Une demande partie : la prochaine ouverture repart d'une page blanche.
      setEnvoyee(null);
      setEtape('quand');
      etapePrecedente.current = 'quand';
      setJour(null);
      setTranche(null);
      setNotes('');
    }
    onOpenChange(next);
  }

  function valider(): boolean {
    const next: typeof erreurs = {};
    if (!name.trim()) next.name = tVisit('nameRequired');
    // Un compte peut ne pas donner de numéro : l'API le joint par son compte (`visitor_phone`
    // nullable pour un authentifié). Saisi, il doit être valide.
    const telephoneFacultatif = user !== null && phone === '';
    if (!telephoneFacultatif && !TELEPHONE_RE.test(phone)) next.phone = tVisit('phoneRequired');
    setErreurs(next);
    return Object.keys(next).length === 0;
  }

  async function envoyer(): Promise<void> {
    if (!jour || !tranche) {
      setEtape('quand');
      return;
    }
    const instant = new Date();
    if (trancheEntamee(jour, tranche, instant)) {
      // Commencée pendant qu'on écrivait : retour au choix, avec la raison sous les tranches.
      setMaintenant(instant);
      setTranche(null);
      setServeur({ preferred_window: [t('when.windowJustStarted')] });
      setEtape('quand');
      return;
    }
    if (!valider()) return;
    const courriel = user ? '' : email.trim();
    try {
      await submit({
        ...chargeDeLaDemande(jour, tranche),
        type,
        notes: notes.trim() || undefined,
        visitor_name: name.trim(),
        ...(phone ? { visitor_phone: phone } : {}),
        ...(courriel ? { visitor_email: courriel } : {}),
        ...arrivee(),
      });
    } catch (e) {
      const champs = e instanceof DemandeDeVisiteRefusee ? e.errors : {};
      setServeur(champs);
      if (CHAMPS_DU_QUAND.some((c) => champs[c])) setEtape('quand');
      return;
    }
    if (!user) retenirCoordonnees({ name: name.trim(), phone });
    setEnvoyee({ jour, tranche, name: name.trim(), phone, email: courriel, avecCompte: user !== null });
    setEtape('envoyee');
    onSuccess?.();
  }

  function soumettre(e: React.FormEvent): void {
    e.preventDefault();
    if (etape === 'quand') {
      if (quandComplet) setEtape('qui');
      return;
    }
    if (etape === 'qui') void envoyer();
  }

  const activeType = VISIT_TYPES.find((v) => v.value === type) ?? VISIT_TYPES[0];
  const etapeVisible = etape === 'qui' ? 2 : 1;

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent
        showCloseButton={false}
        initialFocus={premierControle}
        className={cn(
          'flex flex-col gap-0 overflow-hidden bg-background p-0',
          // Sous `md` : une feuille plein écran, le bouton collé en bas (zone sûre comprise).
          'max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0',
          // Au-delà : un dialogue de 520 px au plus.
          'sm:max-w-none md:max-w-[520px]',
        )}
      >
        <form onSubmit={soumettre} noValidate className="flex min-h-0 flex-1 flex-col">
          {/* L'écran de suite n'a pas de barre : son titre est en tête, la croix flotte au coin —
              56 px rendus au contenu, qui doit tenir à 360 px sans défilement (AC1). */}
          <div
            className={cn(
              'flex flex-none items-center gap-2 bg-background pr-2',
              etape === 'envoyee' ? 'absolute top-2 right-0 z-10' : 'h-14 border-b border-border pl-4 md:pl-5',
            )}
          >
            {etape !== 'envoyee' && (
              <>
                <DialogTitle className="flex-1 font-display text-[1.0625rem] font-semibold text-foreground">
                  {t('title')}
                </DialogTitle>
                <span className="bg-background text-sm tabular-nums text-muted-foreground">
                  <span aria-hidden>{t('stepShort', { current: etapeVisible, total: 2 })}</span>
                  <span className="sr-only">{t('stepLabel', { current: etapeVisible, total: 2 })}</span>
                </span>
              </>
            )}
            <DialogClose render={<Button type="button" variant="ghost" size="icon" />}>
              <XIcon aria-hidden />
              <span className="sr-only">{tCommun('close')}</span>
            </DialogClose>
          </div>

          <div ref={corpsRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background">
            {etape === 'quand' && (
              <EtapeQuand
                property={property}
                jour={jour}
                tranche={trancheValable}
                maintenant={maintenant}
                onJour={(j) => {
                  setMaintenant(new Date());
                  setJour(j);
                  oublier('date', 'scheduled_at', 'preferred_window');
                }}
                onTranche={choisirTranche}
                erreurJour={premiere('date')}
                erreurTranche={premiere('preferred_window') ?? premiere('scheduled_at')}
                titreRef={titreQuandRef}
              />
            )}

            {etape === 'qui' && jour && tranche && (
              <div className="space-y-5 bg-background px-4 pb-6 pt-4 md:px-5">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3.5 py-2 text-secondary-foreground">
                  <p className="flex items-center gap-2 text-[0.9375rem]">
                    <CalendarCheck className="size-5 flex-none" aria-hidden />
                    <span className="font-semibold">{resume}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setEtape('quand')}
                    aria-label={t('who.editAria')}
                    className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    {t('who.edit')}
                  </button>
                </div>

                <section className="space-y-4">
                  <h2
                    ref={titreQuiRef}
                    tabIndex={-1}
                    className="font-display text-lg font-semibold tracking-[-0.02em] text-foreground outline-none"
                  >
                    {t('who.heading')}
                  </h2>
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-name`} className="text-sm font-medium text-foreground">
                      {tVisit('nameLabel')}
                    </label>
                    <Input
                      id={`${id}-name`}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        oublier('visitor_name');
                      }}
                      autoComplete="name"
                      // TCK-1491 — la borne de l'API (`VisitRequestPublicPropertyRequest`, max:120).
                      maxLength={120}
                      aria-invalid={erreurNom ? true : undefined}
                      aria-describedby={erreurNom ? `${id}-name-error` : undefined}
                    />
                    {erreurNom && (
                      <p id={`${id}-name-error`} role="alert" className="text-xs text-destructive">
                        {erreurNom}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-phone`} className="text-sm font-medium text-foreground">
                      {tVisit('phoneLabel')}
                      {user && (
                        <>
                          {' '}
                          <span className="bg-background font-normal text-muted-foreground">{t('who.optional')}</span>
                        </>
                      )}
                    </label>
                    <PhoneInput
                      id={`${id}-phone`}
                      value={phone}
                      onValueChange={(v) => {
                        setPhone(v);
                        oublier('visitor_phone');
                      }}
                      autoComplete="tel"
                      aria-invalid={erreurTelephone ? true : undefined}
                      aria-describedby={erreurTelephone ? `${id}-phone-error` : undefined}
                    />
                    {erreurTelephone && (
                      <p id={`${id}-phone-error`} role="alert" className="text-xs text-destructive">
                        {erreurTelephone}
                      </p>
                    )}
                  </div>
                  {!user && (
                    <div className="space-y-1.5">
                      <label htmlFor={`${id}-email`} className="text-sm font-medium text-foreground">
                        {tVisit('emailLabel')}{' '}
                        <span className="font-normal text-muted-foreground">{tVisit('optional')}</span>
                      </label>
                      <Input
                        id={`${id}-email`}
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          oublier('visitor_email');
                        }}
                        autoComplete="email"
                        aria-invalid={erreurEmail ? true : undefined}
                        aria-describedby={erreurEmail ? `${id}-email-error` : undefined}
                      />
                      {erreurEmail && (
                        <p id={`${id}-email-error`} role="alert" className="text-xs text-destructive">
                          {erreurEmail}
                        </p>
                      )}
                    </div>
                  )}
                </section>

                <div className="border-y border-border">
                  <button
                    type="button"
                    aria-expanded={optionsOuvertes}
                    aria-controls={`${id}-options`}
                    onClick={() => setOptionsOuvertes((o) => !o)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-[0.9375rem] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <span>
                      {t('who.moreOptions')}{' '}
                      <span className="text-muted-foreground">{t('who.moreOptionsHint')}</span>
                    </span>
                    <ChevronDown
                      className={cn('size-5 flex-none text-muted-foreground transition-transform', optionsOuvertes && 'rotate-180')}
                      aria-hidden
                    />
                  </button>
                  <div id={`${id}-options`} hidden={!optionsOuvertes} className="space-y-4 pb-4">
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('typeLegend')}
                      </legend>
                      <div className="grid grid-cols-2 gap-2">
                        {VISIT_TYPES.map(({ value, Icon }) => {
                          const selected = value === type;
                          return (
                            <button
                              type="button"
                              key={value}
                              onClick={() => setType(value)}
                              aria-pressed={selected}
                              className={cn(
                                'group flex items-start gap-2.5 rounded-lg p-3 text-left text-sm transition-[background-color,border-color,color,box-shadow]',
                                'ring-1 ring-foreground/10 hover:bg-muted/60',
                                selected
                                  ? 'bg-primary/10 ring-primary/40 shadow-sm'
                                  : 'bg-background',
                              )}
                            >
                              <span
                                className={cn(
                                  'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
                                  selected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground group-hover:bg-foreground/10',
                                )}
                              >
                                <Icon className="size-3.5" />
                              </span>
                              <span className="flex flex-col gap-0.5">
                                <span className="font-medium leading-tight text-foreground">
                                  {t(`types.${value}.label`)}
                                </span>
                                <span className="text-xs leading-snug text-muted-foreground">
                                  {t(`types.${value}.description`)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="sr-only" aria-live="polite">
                        {t('typeSelected', { label: t(`types.${activeType.value}.label`) })}
                      </p>
                    </fieldset>

                    <div className="space-y-1.5">
                      <label htmlFor={`${id}-notes`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('notesLabel')}{' '}
                        <span className="font-normal normal-case text-muted-foreground">
                          {t('notesOptional')}
                        </span>
                      </label>
                      <Textarea
                        id={`${id}-notes`}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('notesPlaceholder')}
                        rows={3}
                        maxLength={1000}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <MentionDeConfidentialite />
                  {!user && <p className="text-xs text-muted-foreground">{t('who.noAccount')}</p>}
                </div>
              </div>
            )}

            {etape === 'envoyee' && envoyee && (
              <div ref={envoyeeRef} tabIndex={-1} className="outline-none">
                <EtapeEnvoyee
                  property={property}
                  demande={envoyee}
                  contactName={contactName}
                  onPrepareApplication={onPrepareApplication}
                />
              </div>
            )}

          </div>

          <div className="flex-none border-t border-border bg-card px-4 pt-3 pb-[calc(var(--spacing)*4+env(safe-area-inset-bottom))] md:px-5 md:py-4">
            {/* Le refus de l'API reste sous les yeux, au-dessus du bouton, quel que soit le défilement. */}
            {bandeau && etape !== 'envoyee' && (
              <div
                role="alert"
                className="mb-2.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20"
              >
                {bandeau}
              </div>
            )}
            {etape === 'quand' && (
              <p className="mb-2.5 bg-card text-center text-sm text-muted-foreground md:text-left" aria-live="polite">
                {resumeDuChoix ?? t('when.pickBoth')}
              </p>
            )}
            <div className="flex gap-2.5 md:justify-end">
              {etape === 'quand' && (
                <Button type="submit" disabled={!quandComplet} className="h-12 flex-1 text-[0.9375rem] font-semibold md:h-11 md:flex-none md:px-5">
                  {t('continue')}
                </Button>
              )}
              {etape === 'qui' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEtape('quand')}
                    className="hidden h-11 px-5 text-[0.9375rem] font-semibold md:inline-flex"
                  >
                    {t('back')}
                  </Button>
                  <Button type="submit" disabled={submitting} className="h-12 flex-1 text-[0.9375rem] font-semibold md:h-11 md:flex-none md:px-5">
                    {submitting ? t('sending') : t('send')}
                  </Button>
                </>
              )}
              {etape === 'envoyee' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fermer(false)}
                  className="h-12 flex-1 text-[0.9375rem] font-semibold md:h-11 md:flex-none md:px-5"
                >
                  {t('done.backToListing')}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
