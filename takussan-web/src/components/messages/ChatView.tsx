'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import type { ZodType } from 'zod';
import { useResolveurValidation } from '@/hooks/useApiForm';
import { useLocale, useTranslations } from 'next-intl';
import { BellOff, Building2, CheckCheck, Settings, Users } from 'lucide-react';
import {
  useConversation,
  useMessagesInfinite,
  useNewMessagesPolling,
  useMarkConversationRead,
  useSendAttachment,
  useSendMessage,
} from '@/lib/queries/conversations';
import { messageErreurApi } from '@/lib/api';
import { isAgencyAdmin, isAgent } from '@/lib/roles';
import { typeDuProfilActif } from '@/lib/navigation/personas';
import { useMatchesMaxWidth, useMatchesMedia } from '@/hooks/useMatchesMedia';
import { ApercuDeLaPiece, BoutonDePieceJointe, usePieceEnAttente } from './composeur/PieceJointeDuComposeur';
import { ReponsesRapides, insererLaReponse } from './composeur/ReponsesRapides';
import { PiecesDeLaBulle } from './PiecesDeLaBulle';
import { useAuth } from '@/context/AuthContext';
import { BoutonFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback';
import { formatDateTime } from '@/lib/format';
import { sendMessageSchema, type SendMessageFormValues } from '@/lib/schemas/message';
import { cn } from '@/lib/utils';
import { SystemMessageBubble } from './SystemMessageBubble';
import { ConversationInfoSheet } from './ConversationInfoSheet';
import { EnTeteDuFil } from './EnTeteDuFil';
import { MessageDateSeparator } from './MessageDateSeparator';
import { ChatComposerShell } from './ChatComposerShell';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { urlDeLaPiece, type RelirePiece } from './PieceJointeDuFil';
import { LecteurDeNoteVocale } from './NoteVocale';
import { groupMessagesByDay } from '@/lib/messages/groupByDay';
import type { Locale } from '@/i18n/config';
import type { Message } from '@/types/message';
import type { GestesDuFil } from './GestesDuFil';

interface ChatViewProps {
  readonly conversationId: number;
  /**
   * `page` (default) renders the full-page chat with the in-place group info
   * sheet (TCK-085). `widget` is the compact variant used by the floating
   * chat widget (TCK-274): it adds a back button to the header, drops the
   * group info sheet, and replaces the info button with a link to the full
   * `/app/messages` page so admin actions stay in their dedicated UI.
   */
  readonly variant?: 'page' | 'widget';
  /**
   * Le retour vers la liste. **Sa PRÉSENCE seule décide du bouton**, plus la variante
   * (TCK-501) : la messagerie pleine page en a besoin sous `md`, où la liste a disparu de
   * l'écran, et n'en veut pas au-dessus, où elle est restée à gauche. Le widget le passe
   * toujours — son comportement est inchangé.
   */
  readonly onBack?: () => void;
  /**
   * TCK-2632 — la colonne de contexte du bureau (page seulement) : le bouton de l'en-tête qui la
   * replie, et la largeur du fil, plus étroite quand elle est ouverte (maquette : 620 / 760).
   */
  readonly contexte?: { readonly ouvert: boolean; readonly onBasculer: () => void };
  /**
   * TCK-2632 — au téléphone, « ⋯ » d'un fil direct ouvre la feuille du fil (`FeuilleDuFil`) que la
   * page rend elle-même ; sans ce rappel (widget, groupe), « ⋯ » reste le menu.
   */
  readonly onPlusDActions?: () => void;
  /** TCK-2860 — les gestes du menu « ⋯ » que la page monte (non lue, ajouter, signaler) ; absents du widget. */
  readonly gestes?: GestesDuFil;
}

/**
 * TCK-2860 — la cadence à laquelle le fil se relit tant que MON dernier message n'est pas lu : le
 * relevé `after_id` (3 s) n'apporte que les messages NEUFS, jamais la coche des messages déjà chargés
 * (TCK-2858, Notes). La relecture s'arrête dès que la coche est posée, et onglet caché.
 */
export const RELECTURE_DE_LA_COCHE_MS = 15_000;

/**
 * Realtime strategy: `useMessagesInfinite` loads 30 newest messages on mount
 * and pages older history on « Charger les messages précédents » (TCK-2861 — un bouton, plus le
 * défilement infini : on remonte un fil à son rythme); `useNewMessagesPolling`
 * polls `?after_id=<latest>` every 3 s and merges results into the same cache
 * so polling never re-downloads loaded history. Polling pauses while the tab
 * is hidden (visibility listener below). See TCK-045 / pagination plan.
 */
export function ChatView({ conversationId, variant = 'page', onBack, contexte, onPlusDActions, gestes }: ChatViewProps) {
  const isWidget = variant === 'widget';
  const t = useTranslations('messaging');
  const tRacine = useTranslations();
  const tWidget = useTranslations('messaging.widget');
  const locale = useLocale() as Locale;
  const { user, activeProfileId } = useAuth();
  const [isVisible, setIsVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const { data: conversationData } = useConversation(conversationId);
  const {
    data: infiniteData,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useMessagesInfinite(conversationId);

  // TCK-2736 — l'URL d'une pièce jointe expire en 5 minutes : la pièce relit le fil pour en
  // reprendre une neuve (`PieceJointeDuFil`).
  const relirePiece: RelirePiece = async (attachmentId) => {
    const relu = await refetch();
    return relu.isError ? null : urlDeLaPiece(relu.data, attachmentId);
  };

  const messages = useMemo<Message[]>(
    () => infiniteData?.pages.flatMap((p) => p.data) ?? [],
    [infiniteData],
  );

  const anchorId = useMemo<number | null>(() => {
    if (messages.length === 0) return null;
    let max = messages[0]!.id;
    for (const m of messages) if (m.id > max) max = m.id;
    return max;
  }, [messages]);

  useNewMessagesPolling(conversationId, anchorId, { enabled: isVisible });
  useMarkConversationRead(conversationId, anchorId, { enabled: isVisible });

  /**
   * TCK-2860 (AC5) — mon dernier message attend-il sa coche « Lu » ? Seulement s'il est le plus
   * récent du fil (une réponse de l'autre vaut lecture, et le relevé l'apporte) et que l'API le dit
   * non lu (`read_by_recipient === false`, ou `read_count === 0` dans un groupe). Alors le fil se
   * relit toutes les 15 s, jusqu'à la coche.
   */
  const dernier = messages.find((m) => m.id === anchorId);
  const cocheEnAttente =
    dernier !== undefined &&
    dernier.sender_id === user?.id &&
    (dernier.read_by_recipient === false || dernier.read_count === 0);
  useEffect(() => {
    if (!cocheEnAttente || !isVisible) return;
    const minuterie = setInterval(() => {
      void refetch();
    }, RELECTURE_DE_LA_COCHE_MS);
    return () => clearInterval(minuterie);
  }, [cocheEnAttente, isVisible, refetch]);

  const sendMessage = useSendMessage(conversationId);
  const sendAttachment = useSendAttachment(conversationId);
  const pieceJointe = usePieceEnAttente();
  const telephone = useMatchesMaxWidth(1023);
  /**
   * TCK-2748 (AC2) — dès `xl`, un groupe a sa colonne « Infos du groupe » (rendue par la page) : la
   * sous-ligne de l'en-tête la rouvre au lieu d'ouvrir la feuille, qui reste la voie sous `xl`.
   */
  const colonneDuBureau = useMatchesMedia('(min-width: 80rem)') && contexte !== undefined;

  // Le cast reproduit celui que portait `zodResolver` ici même : `sendMessageSchema` a des
  // champs à `.default()`, donc son `z.input` diffère de son `z.output` et ne s'unifie pas avec
  // `SendMessageFormValues`. Il porte sur l'ARGUMENT, jamais sur le paramètre de type — sans quoi le
  // résolveur retomberait sur `FieldValues` et `useForm` refuserait le branchement.
  const resolver = useResolveurValidation<SendMessageFormValues>(
    sendMessageSchema as unknown as ZodType<SendMessageFormValues>,
  );
  const form = useForm<SendMessageFormValues>({
    // `useResolveurValidation`, PAS `zodResolver` nu : les schémas de `src/lib/schemas/` portent
    // une clé (`validation.…`) et non un libellé. Ce fichier montait `zodResolver` directement et
    // rendait donc la clé brute à l'utilisateur — l'inventaire du lot J l'avait manqué alors même
    // qu'il cherchait `zodResolver` (TCK-292, lot L).
    resolver,
    defaultValues: { content: '' },
  });

  const conversation = conversationData?.data;
  const isGroup = conversation?.type === 'group';
  const myParticipant = conversation?.participants?.find(
    (p) => p.user_id === user?.id && !p.left_at,
  );
  const isMuted = Boolean(myParticipant?.is_muted);
  // TCK-2374 (P248.01) — l'API refuserait l'envoi : la saisie laisse place à une note. Absent (liste,
  // cache d'avant la réponse), le drapeau ne cache rien.
  const canSend = conversation?.abilities?.can_send_message !== false;
  // TCK-2632 — les réponses rapides sont celles de l'agence À SES CLIENTS : personnel d'agence, fil
  // à deux. Jamais pour un client (AC6), ni dans un groupe de travail.
  // Suivi de vérification (2026-11-12) — jugées sur le profil ACTIF quand on le connaît, pas sur les
  // rôles globaux : un compte agent ailleurs et bailleur ici ne parle pas au nom d'une agence.
  // Sans profil connu, les rôles, comme avant.
  const roles = user?.roles ?? [];
  const typeActif = typeDuProfilActif(activeProfileId ?? user?.active_profile_id);
  const duPersonnel = typeActif !== null ? typeActif === 'agent' || typeActif === 'agency_admin' : isAgent(roles) || isAgencyAdmin(roles);
  const reponsesRapides = !isGroup && duPersonnel;
  // TCK-2632 — le micro cède la place à l'envoi dès qu'il y a quelque chose à envoyer (maquette) ;
  // pendant une note vocale, le champ et le trombone s'effacent devant elle.
  const contenu = useWatch({ control: form.control, name: 'content' }) ?? '';
  const aEnvoyer = contenu.trim().length > 0 || pieceJointe.piece !== null || pieceJointe.preparation;
  const [noteEnCours, setNoteEnCours] = useState(false);

  // Reset the per-conversation scroll bookkeeping whenever the open
  // conversation changes — otherwise the dashboard's persistent ChatView
  // would carry the previous conversation's `hasScrolledOnLoadRef = true`
  // and skip the auto-scroll-to-bottom for every subsequent conversation.
  const hasScrolledOnLoadRef = useRef(false);
  const lastIncomingIdRef = useRef<number | null>(null);
  /** TCK-2632 — la personne est-elle en bas du fil ? (cf. l'observateur de taille plus bas) */
  const colleEnBasRef = useRef(true);
  useEffect(() => {
    hasScrolledOnLoadRef.current = false;
    lastIncomingIdRef.current = null;
    colleEnBasRef.current = true;
  }, [conversationId]);

  // Auto-scroll when the newest message id changes (incoming via polling or
  // sent locally) — but only if the user is already near the bottom, so we
  // don't yank them out of their history reading.
  useEffect(() => {
    if (anchorId == null) return;
    if (lastIncomingIdRef.current === anchorId) return;
    lastIncomingIdRef.current = anchorId;

    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) {
      el.scrollTop = el.scrollHeight;
    }
  }, [anchorId]);

  // Initial-load scroll: when the first batch of messages is painted, wait
  // for the layout pass (rAF) so `scrollHeight` reflects every bubble
  // (including images / attachments) before jumping to the bottom. The ref
  // is reset on `conversationId` change above so this fires per-conversation.
  useEffect(() => {
    if (hasScrolledOnLoadRef.current) return;
    if (isLoading || messages.length === 0) return;
    hasScrolledOnLoadRef.current = true;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [isLoading, messages.length]);

  /**
   * TCK-2632 — une photo se charge APRÈS le saut en bas du fil (`loading="lazy"`, et sa hauteur
   * n'est connue qu'au chargement) : la plus récente restait coupée sous le composeur, mesuré à 390.
   * Tant que la personne est en bas du fil, le fil y reste quand son contenu grandit ; dès qu'elle
   * remonte lire l'historique, rien ne la déplace.
   */
  const premierContenu = isLoading || messages.length === 0;
  useEffect(() => {
    const el = scrollRef.current;
    const contenu = el?.firstElementChild;
    if (!el || !contenu || typeof ResizeObserver === 'undefined') return;
    const observateur = new ResizeObserver(() => {
      if (colleEnBasRef.current) el.scrollTop = el.scrollHeight;
    });
    observateur.observe(contenu);
    return () => observateur.disconnect();
  }, [premierContenu, conversationId]);

  /**
   * TCK-2861 — « Charger les messages précédents » (maquette e1/e5) au lieu du chargement à la
   * sentinelle. Le message lu ne bouge pas : au clic on relève `scrollTop` ET `scrollHeight`, et une
   * fois la page ajoutée au-dessus, on décale `scrollTop` de ce qu'elle a ajouté — le clic se fait
   * rarement à `scrollTop = 0` (le bouton a sa hauteur, la personne a pu ne pas remonter tout en haut).
   * Le fil « collé en bas » est décollé le temps du chargement : l'observateur de taille ne doit pas
   * sauter en bas d'un fil court qui grandit par le haut.
   */
  const pagesLength = infiniteData?.pages.length ?? 0;
  const prevPagesLengthRef = useRef(pagesLength);
  const positionAvantChargementRef = useRef<{ haut: number; hauteur: number } | null>(null);
  useEffect(() => {
    const avant = positionAvantChargementRef.current;
    if (pagesLength > prevPagesLengthRef.current && avant != null) {
      positionAvantChargementRef.current = null;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = avant.haut + (el.scrollHeight - avant.hauteur);
      });
    }
    prevPagesLengthRef.current = pagesLength;
  }, [pagesLength]);

  function chargerLesPrecedents() {
    if (!hasNextPage || isFetchingNextPage) return;
    const el = scrollRef.current;
    if (el) {
      positionAvantChargementRef.current = { haut: el.scrollTop, hauteur: el.scrollHeight };
      colleEnBasRef.current = false;
    }
    void fetchNextPage();
  }

  const renderItems = groupMessagesByDay(messages);

  async function onSubmit(values: SendMessageFormValues) {
    try {
      await sendMessage.mutateAsync({ content: values.content });
      form.reset({ content: '' });
    } catch {
      // Global error is surfaced via the mutation state
    }
  }

  // TCK-2632 — une pièce choisie part avec le prochain envoi, le texte du champ en légende
  // (facultative : le schéma du texte seul, qui exige un contenu, ne s'applique pas).
  async function envoyerLaPiece() {
    const piece = pieceJointe.piece;
    if (!piece || sendAttachment.isPending) return;
    try {
      await sendAttachment.mutateAsync({ file: piece.fichier, type: piece.nature, content: form.getValues('content') });
      form.reset({ content: '' });
      pieceJointe.retirer();
    } catch (err) {
      pieceJointe.setRefus(messageErreurApi(err, tRacine, t('chat.uploadFailed')));
    }
  }

  function envoyer(e?: React.BaseSyntheticEvent) {
    if (pieceJointe.piece) {
      e?.preventDefault();
      void envoyerLaPiece();
      return;
    }
    void form.handleSubmit(onSubmit)(e);
  }

  return (
    <div className="flex h-full flex-col">
      {/* TCK-2632 — la page : l'en-tête « la personne d'abord » ; le widget flottant garde le sien. */}
      {isWidget ? (
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          {onBack && (
            // TCK-2617 — la flèche unique (`BoutonFlecheDeRetour`) : 20 px dans 44, à toute largeur.
            <BoutonFlecheDeRetour
              libelle={tWidget('chatBack')}
              onClick={onBack}
              className="-ml-2"
              data-testid="chat-back-button"
            />
          )}
          {isGroup ? (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Users className="size-5 text-muted-foreground" aria-hidden />
            </div>
          ) : conversation?.property ? (
            // `rounded-full` : le même rond que dans la liste — la vignette changeait de forme en
            // ouvrant la conversation.
            <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
              {conversation.property.main_photo_url ? (
                <Image
                  src={conversation.property.main_photo_url}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover outline -outline-offset-1 outline-foreground/10"
                />
              ) : (
                <Building2 className="size-5" aria-hidden />
              )}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-base font-semibold tracking-tight text-foreground">
              {conversation?.subject ??
                conversation?.property?.title ??
                t('conversationTitleFallback', { id: String(conversationId) })}
            </h2>
            {isGroup && conversation?.participants && (
              <p className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                {t('chat.participants', {
                  count: conversation.participants.filter((p) => !p.left_at).length,
                })}
                {isMuted && (
                  <BellOff className="size-3.5" role="img" aria-label={t('list.muted')} />
                )}
              </p>
            )}
            {!isGroup && conversation?.property && (
              <Link
                href={`/properties/${conversation.property.slug}`}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {t('chat.viewProperty')}
              </Link>
            )}
          </div>
          {isGroup && (
            <Link
              href={`/app/messages?conversation=${conversationId}`}
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={tWidget('manageGroup')}
              data-testid="chat-manage-group-link"
            >
              <Settings className="size-4" aria-hidden />
            </Link>
          )}
        </header>
      ) : (
        <EnTeteDuFil
          conversationId={conversationId}
          conversation={conversation}
          onBack={onBack}
          sourdine={isMuted}
          onInfosDuGroupe={() => {
            if (colonneDuBureau && contexte) {
              if (!contexte.ouvert) contexte.onBasculer();
            } else setInfoOpen(true);
          }}
          contexte={contexte}
          onPlusDActions={onPlusDActions}
          gestes={gestes}
        />
      )}
      {isGroup && !isWidget && (
        <ConversationInfoSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          conversation={conversation}
          currentMute={isMuted}
        />
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          colleEnBasRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex-1 overflow-y-auto bg-muted/50 px-4 py-4"
      >
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-2/3 rounded-2xl bg-card" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl bg-card" />
          </div>
        ) : isError ? (
          <ErrorState message={t('chat.loadError')} />
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-pretty text-muted-foreground">
            {t('chat.empty')}
          </p>
        ) : (
          <ul
            className={cn(
              // TCK-2632 — 8 px entre deux bulles (maquette `Fil`, `gap-2`).
              'space-y-2',
              // TCK-2632 — au bureau, le fil a une mesure de lecture (maquette : 760 seul, 620 à côté
              // du contexte) au lieu de s'étirer sur toute la colonne.
              !isWidget && 'lg:mx-auto lg:w-full lg:max-w-[calc(var(--spacing)*211.1)]',
              !isWidget && contexte?.ouvert && 'xl:max-w-[calc(var(--spacing)*172.2)]',
            )}
          >
            {hasNextPage ? (
              <li className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={chargerLesPrecedents}
                  disabled={isFetchingNextPage}
                  aria-busy={isFetchingNextPage || undefined}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-70"
                >
                  {isFetchingNextPage ? t('chat.loadingMore') : t('chat.chargerPrecedents')}
                </button>
              </li>
            ) : null}
            {renderItems.map((item) => {
              if (item.kind === 'separator') {
                return <MessageDateSeparator key={item.key} date={item.date} />;
              }
              const m = item.message;
              return m.type === 'system' ? (
                <SystemMessageBubble key={m.id} message={m} />
              ) : (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isOwn={m.sender_id === user?.id}
                  auteur={isGroup}
                  locale={locale}
                  relirePiece={relirePiece}
                />
              );
            })}
          </ul>
        )}
      </div>

      {canSend ? (
        <ChatComposerShell
          // TCK-316 — `handleSubmit(onSubmit)` était APPELÉ pendant le rendu pour
          // produire le gestionnaire ; on diffère l'appel dans l'événement, ce que fait
          // déjà le bouton plus bas.
          onSubmit={envoyer}
          sendDisabled={sendMessage.isPending || sendAttachment.isPending || pieceJointe.preparation}
          sendAriaLabel={t('chat.sendAria')}
          error={pieceJointe.refus}
          // TCK-683 (P13.03) avait retiré le trombone, qui postait sur `/messages/{m}/attachments`,
          // qu'aucune route ne sert. TCK-2632 le rend, sur la route du texte (TCK-2631) ; le widget
          // flottant n'en a pas : la photo s'envoie depuis la messagerie.
          leading={
            isWidget ? (
              <VoiceNoteRecorder conversationId={conversationId} />
            ) : noteEnCours ? null : (
              <BoutonDePieceJointe
                onChoisir={(f) => void pieceJointe.choisir(f)}
                desactive={sendAttachment.isPending}
                appareilPhoto={telephone}
              />
            )
          }
          messagerie={
            isWidget
              ? undefined
              : {
                  apresLeChamp: (
                    <VoiceNoteRecorder
                      conversationId={conversationId}
                      auRepos={aEnvoyer ? 'masque' : 'visible'}
                      rond
                      onActif={setNoteEnCours}
                    />
                  ),
                  envoiVisible: aEnvoyer && !noteEnCours,
                }
          }
          dessus={
            isWidget ? null : (
              <>
                {reponsesRapides ? (
                  <ReponsesRapides
                    onChoisir={(phrase) => {
                      form.setValue('content', insererLaReponse(form.getValues('content') ?? '', phrase), { shouldDirty: true });
                      form.setFocus('content');
                    }}
                  />
                ) : null}
                <ApercuDeLaPiece piece={pieceJointe.piece} preparation={pieceJointe.preparation} onRetirer={pieceJointe.retirer} />
              </>
            )
          }
        >
          <Textarea
            {...form.register('content')}
            rows={1}
            placeholder={t('chat.placeholder')}
            className={
              isWidget
                ? 'min-h-11 resize-none sm:min-h-9'
                : cn(
                    'min-h-11 resize-none rounded-[1.375rem] bg-background px-4 py-2.5 text-corps',
                    noteEnCours && 'hidden',
                  )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                envoyer();
              }
            }}
          />
        </ChatComposerShell>
      ) : (
        <p role="status" className="border-t border-border bg-card p-3 text-sm text-muted-foreground">
          {t('chat.readOnly')}
        </p>
      )}
    </div>
  );
}

/**
 * Une bulle (maquette `app-messagerie`, `Bulle`) : la mienne pleine à droite, l'autre bordée à
 * gauche, l'heure en bas à droite. L'auteur n'est nommé que dans un groupe (« Pas de
 * régression » de TCK-2632) : dans un fil direct, l'en-tête le dit déjà.
 *
 * TCK-2860 — dans un groupe, l'auteur est signé de son rôle au fil (« Fatou Wade · locataire »,
 * maquette e5) : le CODE `sender.role_label_code` (TCK-2858), le libellé par next-intl ; un code
 * inconnu ou nul laisse le nom seul. Sur MES messages, la double coche « Lu » (maquette l. 211) :
 * fil direct, `read_by_recipient` ; groupe, au moins un lecteur (`read_count > 0`). Rien tant que
 * l'API ne l'a pas dit.
 */
function MessageBubble({
  message,
  isOwn,
  auteur,
  locale,
  relirePiece,
}: {
  message: Message;
  isOwn: boolean;
  auteur: boolean;
  locale: Locale;
  relirePiece: RelirePiece;
}) {
  const t = useTranslations('messaging.chat');
  const role = message.sender?.role_label_code ?? null;
  const cleDuRole = role ? `role.${role}` : null;
  const signature =
    message.sender && cleDuRole && t.has(cleDuRole)
      ? t('auteurEtRole', { nom: message.sender.full_name, role: t(cleDuRole) })
      : message.sender?.full_name;
  const lu = isOwn && (message.read_by_recipient === true || (message.read_count ?? 0) > 0);
  return (
    <li className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2 text-corps leading-snug',
          isOwn
            ? 'rounded-br-md bg-foreground text-background'
            : 'rounded-bl-md border border-border bg-card text-foreground',
        )}
      >
        {auteur && !isOwn && message.sender && (
          <p className="mb-0.5 text-xs font-semibold text-primary-deep">
            {signature}
          </p>
        )}
        {message.type === 'audio' && message.attachments?.[0] ? (
          // TCK-2861 — la note vocale dessinée (rond, onde, « 0:23 ») : `NoteVocale.tsx`, isolé pour TCK-2901.
          <LecteurDeNoteVocale
            piece={message.attachments[0]}
            duree={message.metadata?.duration}
            relirePiece={relirePiece}
            mienne={isOwn}
            // L'élément reste écrit ICI : ses sous-titres absents sont gelés au nom de ce fichier.
            rendreAudio={({ ref, ...attributs }) => <audio ref={ref} {...attributs} />}
          />
        ) : message.type === 'image' || message.type === 'document' ? (
          // TCK-2632 — la pièce d'abord, la légende dessous ; une pièce sans légende rend
          // `content = ''` (TCK-2631) : pas de paragraphe vide.
          <>
            <PiecesDeLaBulle pieces={message.attachments ?? []} isOwn={isOwn} relirePiece={relirePiece} />
            {message.content?.trim() ? (
              <p className="mt-1.5 whitespace-pre-line text-pretty break-words">{message.content}</p>
            ) : null}
          </>
        ) : (
          <>
            <p className="whitespace-pre-line text-pretty break-words">{message.content}</p>
            {message.attachments && message.attachments.length > 0 ? (
              <div className="mt-2">
                <PiecesDeLaBulle pieces={message.attachments} isOwn={isOwn} relirePiece={relirePiece} />
              </div>
            ) : null}
          </>
        )}
        <p
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[0.6875rem] tabular-nums',
            isOwn ? 'text-background/65' : 'text-muted-foreground',
          )}
        >
          {formatDateTime(message.created_at, locale, { timeStyle: 'short', dateStyle: undefined })}
          {lu ? <CheckCheck className="size-3.5 flex-none" role="img" aria-label={t('lu')} data-testid="coche-lu" /> : null}
        </p>
      </div>
    </li>
  );
}
