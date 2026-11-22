'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { BellOff, CalendarCheck, CheckCheck, FileText, Search, Users, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Input } from '@/components/ui/input';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useConversationsInfinite, type FiltresDeLaListe } from '@/lib/queries/conversations';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useAuth } from '@/context/AuthContext';
import { initiales } from '@/lib/fiche-publique';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/config';
import type { Conversation } from '@/types/message';
import { useTexteMessageSysteme } from './useTexteMessageSysteme';
import { EtatVideDeLaMessagerie } from './EtatVideDeLaMessagerie';
import { quandDansLaListe } from './quand';
// TCK-2963 — la salle d'un bail ou d'une réservation : nommée depuis son objet, signée de ses membres.
import { estUneSalle, membresActuels } from './salle/salle';
import { useTitreDeLaSalle } from './salle/useTitreDeLaSalle';
// TCK-2968 (ADR-0128 § 7) — la boîte de pilotage : puces de file, signaux et gestes d'une rangée.
import { PUCES_DE_PILOTAGE, fileDeLaPuce, type PuceDePilotage } from './boite/pilotage';
import {
  BoutonRamener,
  EtiquetteDeFile,
  GestesAuSurvol,
  RangeeGlissable,
  SignauxDuFil,
  type PilotageDeLaListe,
} from './boite/RangeeDeLaBoite';
import { isAgencyAdmin, isAgent } from '@/lib/roles';
import { typeDuProfilActif } from '@/lib/navigation/personas';

/** TCK-2632 — le délai de la recherche : une requête quand la frappe s'arrête, pas une par lettre. */
export const DELAI_DE_RECHERCHE_MS = 300;

type Puce = PuceDePilotage;

interface ConversationListProps {
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
  /** Bureau : rangées plus serrées (maquette, avatar de 44 px), recherche et puces plus petites. */
  readonly dense?: boolean;
  /** TCK-2632 — « Écrire à un client », l'action de l'état vide du personnel d'agence. */
  readonly onNouvelle?: () => void;
  /**
   * TCK-2968 — les gestes de la boîte (« Traité », « Rappelez-le-moi », « Ramener », « Confier »), tenus par
   * la page. Absents (widget flottant, impersonation) : la liste se lit sans geste.
   */
  readonly pilotage?: PilotageDeLaListe;
}

/**
 * TCK-2632 — la liste « les personnes d'abord » (maquette `app-messagerie`, approche A) : chaque
 * rangée porte EN TITRE le nom de la personne (ou du groupe), avec son avatar et la vignette du bien
 * en médaillon ; le bien en deuxième ligne, puis l'aperçu.
 *
 * Au-dessus : « Chercher un nom, un bien… » et les puces « Tous · Non lus · Groupes » avec leurs
 * comptes (`meta.counts`). Tout se filtre CÔTÉ SERVEUR (TCK-2630) : la recherche part après
 * {@link DELAI_DE_RECHERCHE_MS}, et rien n'est jamais filtré sur la page déjà chargée.
 */
export function ConversationList({ selectedId, onSelect, dense = false, onNouvelle, pilotage }: ConversationListProps) {
  const t = useTranslations('messaging');
  const tCommon = useTranslations('common.actions');
  const locale = useLocale() as Locale;
  const { user, activeProfileId } = useAuth();
  const tBoite = useTranslations('messaging.boite');
  // TCK-2968 — « Confié à » et « Confier » : le personnel d'agence seul (même jugement que `ChatView`).
  const typeActif = typeDuProfilActif(activeProfileId ?? user?.active_profile_id);
  const roles = user?.roles ?? [];
  const duPersonnel = typeActif !== null ? typeActif === 'agent' || typeActif === 'agency_admin' : isAgent(roles) || isAgencyAdmin(roles);
  // L'horloge des délais (« depuis 25 min ») : relevée au montage, puis chaque minute.
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => clearInterval(minuterie);
  }, []);
  const idRecherche = useId();
  const [saisie, setSaisie] = useState('');
  const [puce, setPuce] = useState<Puce>('tous');
  const recherche = useDebouncedValue(saisie, DELAI_DE_RECHERCHE_MS);
  // TCK-2968 — la puce de file part au SERVEUR (`filter[file]`), jamais sur la page reçue.
  const fileDemandee = fileDeLaPuce(puce);
  const filtres: FiltresDeLaListe = {
    recherche,
    ...(puce === 'nonLus' ? { nonLus: true } : {}),
    ...(fileDemandee ? { file: fileDemandee } : {}),
  };
  const filtre = recherche.trim().length > 0 || puce !== 'tous';
  // List polls every 10 s to surface new conversations / unread badges.
  // TCK-1387 (P135.02) — défilement infini : la liste ne lisait que ses 30 premiers fils.
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useConversationsInfinite({ filtres });
  const loadMoreRef = useRef<HTMLLIElement | null>(null);
  const isSentinelVisible = useIntersectionObserver(loadMoreRef, {
    rootMargin: '0px 0px 120px 0px',
    enabled: Boolean(hasNextPage) && !isLoading,
  });
  useEffect(() => {
    if (!isSentinelVisible || !hasNextPage || isFetchingNextPage || isLoading) return;
    void fetchNextPage();
  }, [isSentinelVisible, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  // Les pages sont relues l'une après l'autre : un fil qui remonte en tête entre deux lectures peut
  // figurer dans deux pages. Il n'est rendu qu'une fois, à sa place la plus récente.
  const conversations = useMemo(() => {
    const vus = new Set<number>();
    return (data?.pages ?? [])
      .flatMap((p) => p.data)
      .filter((c) => (vus.has(c.id) ? false : (vus.add(c.id), true)));
  }, [data]);
  const comptes = data?.pages[0]?.meta?.counts;

  // Ni recherche ni puce sur une messagerie vide : l'état vide dit d'où vient une conversation.
  const vraimentVide = !isLoading && !isError && conversations.length === 0 && !filtre && (comptes?.all ?? 0) === 0;
  if (vraimentVide && !dense) {
    // TCK-645 — la liste EST déjà la surface : l'état vide n'y pose pas un second cadre.
    // TCK-2632 (AC6, a-4 téléphone) — l'état vide propre à la personne, posé à 96 px du haut.
    return <EtatVideDeLaMessagerie onNouvelle={onNouvelle} />;
  }
  if (vraimentVide) {
    // TCK-2632 (a-4 bureau) — au bureau, l'état vide occupe le panneau du fil (`MessagesPage`) ;
    // la liste garde sa recherche, éteinte (rien à chercher), et dit quand elle se remplira.
    return (
      <div className="flex min-h-full flex-col" data-slot="liste-des-conversations" data-testid="conversations-vide-liste">
        <div className="px-4 pt-1 opacity-50">
          <div
            aria-hidden="true"
            className="flex h-9 items-center gap-2.5 rounded-full border border-border bg-card px-3.5 text-muted-foreground"
          >
            <Search className="size-4.5 flex-none stroke-[1.75]" />
            <span className="truncate text-champ">{t('list.recherche')}</span>
          </div>
        </div>
        <p className="mt-3 flex-1 border-t border-border/70 px-6 pt-10 text-center text-sm text-muted-foreground">
          {t('list.seRemplira')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col" data-slot="liste-des-conversations">
      <div className={cn('px-4', dense ? 'pt-1' : 'pt-3')}>
        <label htmlFor={idRecherche} className="sr-only">
          {t('list.rechercheLabel')}
        </label>
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring',
            dense ? 'h-9' : 'h-11',
          )}
        >
          <Search className="size-4.5 flex-none stroke-[1.75]" aria-hidden="true" />
          {/*
            La primitive, nue dans sa pilule (TCK-2460) : la pilule porte le contour et l'anneau. Le
            texte reste celui du champ (`text-champ`, 16 px sous le pouce : iOS ne zoome pas au focus).
          */}
          <Input
            profil="recherche"
            id={idRecherche}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder={t('list.recherche')}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-foreground focus-visible:ring-0 [&::-webkit-search-cancel-button]:hidden"
          />
          {saisie.length > 0 ? (
            <button
              type="button"
              onClick={() => setSaisie('')}
              aria-label={t('list.effacerRecherche')}
              className="-mr-1.5 inline-flex size-8 flex-none items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <RangeeDePuces
        aria-label={t('list.filtres.label')}
        className={cn('sticky top-0 z-10 bg-background', dense && 'pt-3')}
      >
        {/*
          TCK-2968 (maquette `fil-boite` D) — Tous · Non lus · À vous · En attente · Rappels, une rangée qui
          défile. Les comptes lisent `meta.counts` (toute la liste, sans filtre), jamais la page. « Groupes »
          quitte la rangée (son filtre vivait dans « Filtrer », hors de ce lot).
        */}
        {PUCES_DE_PILOTAGE.map((cle) => [
          cle,
          t(`list.filtres.${cle}`),
          cle === 'tous' ? undefined : cle === 'nonLus' ? comptes?.unread : comptes?.[cle],
        ] as const).map(([cle, libelle, compte]) => (
          <PuceDeFiltre
            key={cle}
            active={puce === cle}
            taille={dense ? 'sm' : 'default'}
            // TCK-2973 (maquette `fil-boite` D) — le compte de « Retard » en ocre gras, non nul et puce inactive.
            compte={cle === 'retard' && puce !== 'retard' && typeof compte === 'number' && compte > 0 ? <span className="font-semibold text-warning" data-testid="compte-retard">{compte}</span> : compte}
            onClick={() => setPuce(cle)}
          >
            {libelle}
          </PuceDeFiltre>
        ))}
      </RangeeDePuces>
      {pilotage ? (
        <p className="px-4 pt-1 pb-2 text-ui text-muted-foreground" data-testid="aide-de-la-puce">
          {tBoite(`aide.${puce}`)}
        </p>
      ) : null}

      {isLoading ? (
        // TCK-645 — le squelette a la forme d'une rangée (rond + deux lignes), pas d'une carte.
        <div className="divide-y divide-border/70 border-t border-border/70" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn('flex items-center gap-3 px-4', dense ? 'py-2.5' : 'py-3')}>
              <Skeleton className={cn('shrink-0 rounded-full', dense ? 'size-avatar-44' : 'size-avatar-48')} />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="p-3">
          <ErrorState message={t('list.loadError')} onRetry={() => void refetch()} retryLabel={tCommon('retry')} />
        </div>
      ) : conversations.length === 0 && puce === 'vous' && recherche.trim().length === 0 ? (
        // TCK-2968 (maquette D6) — « Rien ne vous attend », et le chemin vers ce qu'on attend des autres.
        <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="rien-ne-vous-attend">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCheck className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-base font-semibold text-foreground">{tBoite('vide.vous')}</p>
          <p className="mt-1 max-w-xs text-sm text-pretty text-muted-foreground">{tBoite('vide.vousAide')}</p>
          {(comptes?.attente ?? 0) > 0 ? (
            <Button variant="outline" className="mt-5" onClick={() => setPuce('attente')}>
              {tBoite('vide.voirAttente', { n: comptes?.attente ?? 0 })}
            </Button>
          ) : null}
        </div>
      ) : conversations.length === 0 && puce !== 'tous' && recherche.trim().length === 0 ? (
        <EmptyState
          variant="nue"
          data-testid="conversations-file-vide"
          title={tBoite(`vide.${puce}`)}
          description={tBoite(`vide.${puce}Aide`)}
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          variant="nue"
          data-testid="conversations-aucun-resultat"
          title={t('list.aucunResultat')}
          description={t('list.aucunResultatAide')}
        />
      ) : (
        <ul className="divide-y divide-border/70 border-t border-border/70">
          {conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              selected={c.id === selectedId}
              onSelect={onSelect}
              locale={locale}
              currentUserId={user?.id}
              dense={dense}
              puce={puce}
              pilotage={pilotage}
              duPersonnel={duPersonnel}
              maintenant={maintenant}
            />
          ))}
          <li
            ref={loadMoreRef}
            aria-hidden={!hasNextPage}
            className={cn('flex justify-center', hasNextPage ? 'py-3' : 'py-0')}
          >
            {isFetchingNextPage ? (
              <span className="text-xs text-muted-foreground">{t('list.chargementPlusAnciennes')}</span>
            ) : null}
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * Le titre d'une rangée et de l'en-tête du fil : la PERSONNE d'une directe (l'autre membre actuel),
 * le nom d'un groupe ; à défaut, le sujet, le bien, puis « Conversation #id ».
 *
 * TCK-2963 — une SALLE n'est pas une directe : son titre se compose depuis l'objet
 * (`useTitreDeLaSalle`), jamais depuis le nom d'un de ses membres.
 */
export function titreDeConversation(
  conversation: Conversation,
  currentUserId: number | undefined,
  repli: string,
): string {
  if (conversation.type !== 'group' && !estUneSalle(conversation)) {
    const autre = autreParticipant(conversation, currentUserId);
    if (autre?.full_name) return autre.full_name;
  }
  return conversation.subject || conversation.property?.title || repli;
}

/** L'autre membre ACTUEL d'une directe (la liste ne rend que les membres actuels, TCK-861). */
export function autreParticipant(conversation: Conversation, currentUserId: number | undefined) {
  return (conversation.participants ?? []).find((p) => p.user_id !== currentUserId && !p.left_at)?.user ?? null;
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
  locale,
  currentUserId,
  dense,
  puce,
  pilotage,
  duPersonnel,
  maintenant,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: (id: number) => void;
  locale: Locale;
  currentUserId?: number;
  dense: boolean;
  puce: Puce;
  pilotage: PilotageDeLaListe | undefined;
  duPersonnel: boolean;
  maintenant: Date;
}) {
  const t = useTranslations('messaging');
  const unread = conversation.unread_count ?? 0;
  const isGroup = conversation.type === 'group';
  // TCK-2963 — une salle se dessine comme un groupe (l'objet en pastille), sans la marque « Groupe ».
  const salle = estUneSalle(conversation);
  const titreDeLaSalle = useTitreDeLaSalle();
  const intervention = conversation.maintenance_request_id != null;
  const myParticipant = conversation.participants?.find(
    (p) => p.user_id === currentUserId && !p.left_at,
  );
  const isMuted = Boolean(myParticipant?.is_muted);
  const membres = (conversation.participants ?? []).filter((p) => !p.left_at).length;
  const autre = isGroup || salle ? null : autreParticipant(conversation, currentUserId);
  const titre = salle
    ? titreDeLaSalle(conversation)
    : titreDeConversation(conversation, currentUserId, t('conversationTitleFallback', { id: String(conversation.id) }));
  // TCK-671 (P06.02) — l'aperçu d'un avis système est écrit en français par l'API : il se dérive
  // de `metadata.event`, dans la langue du lecteur. TCK-2632 — une pièce jointe aussi (« Photo »,
  // « Document ») : `last_message_preview` est écrit dans la langue de l'EXPÉDITEUR.
  const texteSysteme = useTexteMessageSysteme();
  const typeDernier = conversation.last_message?.type;
  // TCK-2958 — un avis (`system`, `event`) et une carte (`card`) n'ont pour aperçu serveur qu'un CODE :
  // jamais de repli sur `last_message_preview` pour eux.
  const apercu =
    typeDernier === 'system' || typeDernier === 'event'
      ? texteSysteme(conversation.last_message?.metadata)
      : typeDernier === 'card' || typeDernier === 'image' || typeDernier === 'document' || typeDernier === 'audio'
        ? t(`list.apercu.${typeDernier}`)
        : conversation.last_message_preview;
  const bien = conversation.property?.title ?? null;
  // TCK-2963 (maquette `fil-salle-bail`, `FILS_LOCATAIRE`) — sous le nom d'une salle, les AUTRES membres.
  const autresMembres = salle
    ? membresActuels(conversation)
        .filter((p) => p.user_id !== currentUserId && p.user?.full_name)
        .map((p) => p.user!.full_name)
        .join(', ')
    : '';
  const sousLigne = salle
    ? autresMembres || t('list.personnes', { n: membres })
    : intervention
    ? bien
      ? t('list.interventionDe', { bien })
      : t('list.intervention')
    : isGroup
      ? t('list.personnes', { n: membres })
      : bien;
  const taille = dense ? 44 : 48;
  const quand = quandDansLaListe(conversation.last_message_at, locale, t('chat.dateSeparator.yesterday'));

  // TCK-2968 — la boîte : l'étiquette de file (quand la puce ne la dit pas), les gestes, « Ramener ».
  const montrerFile = puce === 'tous' || puce === 'nonLus';
  // « Confier » : une salle ou un groupe (jamais le fil d'un prospect, ADR-0068), par le personnel.
  const confiable = duPersonnel && (isGroup || salle);
  const ramenable = pilotage !== undefined && conversation.file === 'rappel';
  return (
    <li className="group/rangee relative">
      <RangeeGlissable conversation={conversation} titre={titre} pilotage={pilotage}>
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full gap-3 px-4 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted',
          dense ? 'py-2.5' : 'py-3',
          selected && 'bg-foreground/6 hover:bg-foreground/6',
          ramenable && 'pr-16 lg:pr-28',
        )}
      >
        {salle ? (
          // TCK-2963 (maquette `IconeObjet`) — la pastille de l'objet, carrée aux coins doux : un bail, une réservation.
          <span
            className={cn(
              'inline-flex flex-none items-center justify-center rounded-xl bg-fond-avatar text-accent',
              dense ? 'size-avatar-44' : 'size-avatar-48',
            )}
            data-testid="pastille-de-la-salle"
          >
            {conversation.type === 'booking' ? (
              <CalendarCheck className="size-5 stroke-[1.75]" aria-hidden />
            ) : (
              <FileText className="size-5 stroke-[1.75]" aria-hidden />
            )}
          </span>
        ) : isGroup ? (
          <span
            className={cn(
              'relative inline-flex flex-none items-center justify-center rounded-full bg-fond-avatar text-accent',
              dense ? 'size-avatar-44' : 'size-avatar-48',
            )}
            data-testid="group-avatar-stack"
          >
            {intervention ? (
              <Wrench className="size-5 stroke-[1.75]" aria-hidden />
            ) : (
              <Users className="size-5 stroke-[1.75]" aria-hidden />
            )}
            {membres > 2 ? (
              <span className="absolute -right-1 -bottom-0.5 inline-flex h-4.5 items-center rounded-full bg-card px-1 text-pastille font-semibold tabular-nums text-encre-douce ring-1 ring-border">
                +{membres - 2}
              </span>
            ) : null}
          </span>
        ) : (
          <span className={cn('relative flex-none', dense ? 'size-avatar-44' : 'size-avatar-48')}>
            <Avatar size={String(taille) as '44' | '48'}>
              {autre?.avatar_url ? <AvatarImage src={autre.avatar_url} alt="" /> : null}
              <AvatarFallback>{autre?.full_name ? initiales(autre.full_name) : null}</AvatarFallback>
            </Avatar>
            {conversation.property?.main_photo_url ? (
              <span className="absolute -right-2 -bottom-1 size-5 overflow-hidden rounded-md ring-2 ring-background">
                <Image
                  src={conversation.property.main_photo_url}
                  alt=""
                  fill
                  sizes="20px"
                  className="object-cover"
                />
              </span>
            ) : null}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-corps text-foreground',
                unread > 0 ? 'font-semibold' : 'font-medium',
              )}
            >
              {titre}
            </span>
            {montrerFile ? <EtiquetteDeFile file={conversation.file} /> : null}
            {quand ? (
              <span
                className={cn(
                  'flex-none text-xs tabular-nums',
                  unread > 0 ? 'font-semibold text-primary-deep' : 'text-muted-foreground',
                )}
              >
                {quand}
              </span>
            ) : null}
          </span>
          {sousLigne ? (
            <span className="flex items-center gap-1.5 truncate text-ui text-muted-foreground">
              {isGroup && !intervention ? (
                <span className="rounded bg-muted px-1 text-legende font-medium text-encre-douce">
                  {t('list.groupBadge')}
                </span>
              ) : null}
              <span className="truncate">{sousLigne}</span>
            </span>
          ) : null}
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-ui',
                unread > 0 ? 'font-medium text-foreground' : 'text-encre-douce',
              )}
            >
              {apercu ?? '—'}
            </span>
            {isMuted ? (
              <BellOff
                className="size-3.5 flex-none text-muted-foreground"
                role="img"
                aria-label={t('list.muted')}
              />
            ) : null}
            {unread > 0 ? (
              <span className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-primary px-1.5 text-legende font-semibold tabular-nums text-primary-foreground">
                <span aria-hidden="true">{unread > 99 ? '99+' : unread}</span>
                <span className="sr-only">{t('list.nonLusAria', { n: unread })}</span>
              </span>
            ) : null}
          </span>
          <SignauxDuFil conversation={conversation} maintenant={maintenant} moi={currentUserId} confieVisible={duPersonnel} />
        </span>
      </button>
      </RangeeGlissable>
      {pilotage && !ramenable ? <GestesAuSurvol conversation={conversation} titre={titre} pilotage={pilotage} confiable={confiable} /> : null}
      {ramenable ? <BoutonRamener conversation={conversation} pilotage={pilotage} /> : null}
    </li>
  );
}
