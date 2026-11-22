'use client';

import { Fragment, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import type { ZodType } from 'zod';
import { useResolveurValidation } from '@/hooks/useApiForm';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { AtSign, BellOff, Building2, CheckCheck, Lock, Settings, Users } from 'lucide-react';
import {
  useConversation,
  useConversationContext,
  useMessagesInfinite,
  useNewMessagesPolling,
  useMarkConversationRead,
  useSendAttachment,
  useSendMessage,
} from '@/lib/queries/conversations';
import { sujetDuFil } from '@/lib/queries/conversations-cles';
import { useIntervalleDeRelecture, usePresenceDuSujet } from '@/lib/temps-reel/hooks';
import { useEcritureDuSujet } from '@/lib/temps-reel/ecriture';
import { useFilEnDirect } from './useFilEnDirect';
import { messageErreurApi } from '@/lib/api';
import { isAgencyAdmin, isAgent } from '@/lib/roles';
import { typeDuProfilActif } from '@/lib/navigation/personas';
import { useMatchesMaxWidth, useMatchesMedia } from '@/hooks/useMatchesMedia';
import { ApercuDeLaPiece, BoutonDePieceJointe, usePieceEnAttente } from './composeur/PieceJointeDuComposeur';
import { ReponsesRapides, insererLaReponse } from './composeur/ReponsesRapides';
// TCK-2968 — la note d'équipe et les @mentions dans le composeur et dans le fil.
import { LigneDesLecteurs, ListeDesMentions } from './composeur/ComposeurDEquipe';
import {
  filtrerLesMentionnables,
  insererLaMention,
  lecteursDuFil,
  mentionEnCours,
  mentionnables,
  mentionsDuTexte,
  type Personne,
} from './composeur/equipe';
import { NoteDEquipe, TexteAvecMentions } from './NoteDEquipe';
import { Button } from '@/components/ui/button';
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
// TCK-2962 — les cartes, les événements repliés et la carte relue quand son objet bouge.
import { CarteDuFil, EvenementsReplies } from './cartes/CarteDuFil';
import { natureDuMessage, replierLesEvenements } from './cartes/replierLesEvenements';
import { useCartesEnDirect } from './cartes/useCartesEnDirect';
// TCK-2963 — la salle d'un bail ou d'une réservation : chronologie repliée par mois. Le bandeau, le dossier et
// la raison de la lecture seule sont rendus par la PAGE (`MessagesPage`) et passés ici : le widget flottant
// importe ce composant, et ils lisent l'objet (bail, réservation), qu'il n'a pas à charger.
import { estUneSalle } from './salle/salle';
import { chronologieDeLaSalle, type ElementDeLaSalle } from './salle/chronologieDeLaSalle';
import { SeparateurDeMois } from './salle/SeparateurDeMois';
import { ConversationInfoSheet } from './ConversationInfoSheet';
import { EnTeteDuFil } from './EnTeteDuFil';
import { MessageDateSeparator } from './MessageDateSeparator';
import { ChatComposerShell } from './ChatComposerShell';
// TCK-2984 (ADR-0132) — le pont : la trace du canal sous la bulle, le bandeau de la fenêtre au-dessus du composeur.
import { BandeauDeLaFenetre, PontDuMessage, PucesDuPont } from './pont/ElementsDuPont';
import { participantsDuPont } from './pont/pont';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { urlDeLaPiece, type RelirePiece } from './PieceJointeDuFil';
import { LecteurDeNoteVocale } from './NoteVocale';
import { groupMessagesByDay } from '@/lib/messages/groupByDay';
import type { Locale } from '@/i18n/config';
import type { Message } from '@/types/message';
import type { GestesDuFil } from './GestesDuFil';
import { usePoserDansLeFil } from './poser/PoserDansLeFil';
// TCK-2977 (ADR-0131) — le copilote à l'écran : « Ce que vous avez manqué », ✦ et « Demander au fil », la
// transcription sous la note vocale. Rien n'est monté, et aucune requête ne part, si `copilote` n'est pas vrai.
import { copiloteDuFil, coupureDeLaFonction, deciderLaSuggestion, demanderUnBrouillon, etatDuCopiloteQueryKey, lireEtatDuCopilote } from '@/lib/queries/copilote';
// TCK-2978 — le brouillon dans le composeur, les promesses sous les messages.
import { BrouillonDuComposeur, type AttenteDuBrouillon, type BrouillonRecu } from './copilote/BrouillonDuComposeur';
import { DemandeDesPromesses, PromessesDuMessage } from './copilote/PromessesDuMessage';
import { Sparkles } from 'lucide-react';
import { CeQueVousAvezManque } from './copilote/CeQueVousAvezManque';
import { BoutonDeLAssistant, EcouteDesTranscriptions } from './copilote/CopiloteDuFil';
import { DemanderAuFil } from './copilote/DemanderAuFil';
import { TranscriptionDeLaNote } from './copilote/TranscriptionDeLaNote';
import { fenetreDesNonLus, nonLusDeLaListe, type FenetreDesNonLus } from './copilote/fenetreDesNonLus';
// TCK-2972 — noter un engagement depuis un message.
import { NoterUnEngagement } from './engagements/NoterUnEngagement';
import { BoutonNoter, GestesDuMessage, useAppuiLong } from './engagements/OutilsDuMessage';
import { useLectureSeule } from './engagements/useLectureSeule';
import { filAvecAgence } from './engagements/engagement';

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
  /**
   * TCK-2963 — une SALLE ouverte dans la page : le bandeau de l'objet (sous l'en-tête), la ligne qui dit
   * pourquoi la saisie a disparu (`abilities.can_send_message` faux), et l'ouverture du dossier du fil
   * (la sous-ligne de l'en-tête, sous `xl`).
   */
  readonly salle?: {
    readonly bandeau: ReactNode;
    readonly lectureSeule: ReactNode;
    readonly onDossier: () => void;
  };
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
export function ChatView({ conversationId, variant = 'page', onBack, contexte, onPlusDActions, gestes, salle }: ChatViewProps) {
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
  // TCK-2955 — la coche arrive par `conversation.read` (`useFilEnDirect`) ; les 15 s ne sont plus que le
  // filet du mode dégradé (60 s quand le canal du fil est tenu).
  const sujet = sujetDuFil(conversationId);
  const intervalleDeLaCoche = useIntervalleDeRelecture(RELECTURE_DE_LA_COCHE_MS, sujet);
  useEffect(() => {
    if (!cocheEnAttente || !isVisible || intervalleDeLaCoche === false) return;
    const minuterie = setInterval(() => {
      void refetch();
    }, intervalleDeLaCoche);
    return () => clearInterval(minuterie);
  }, [cocheEnAttente, isVisible, refetch, intervalleDeLaCoche]);

  // TCK-2955 (ADR-0129 § 2) — le fil en direct : ses signaux relisent ce qu'ils disent changé.
  useFilEnDirect({ conversationId, sansAncre: anchorId == null, cocheEnAttente });
  // TCK-2962 — un `event` ou une `card` neuf (signal ou relecture périodique) relit les pages chargées :
  // les cartes plus haut prennent la projection et les gestes neufs de leur objet.
  useCartesEnDirect(conversationId, messages);

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
  /** TCK-2963 — une salle a trois membres ou plus : ses auteurs se nomment, comme dans un groupe. */
  const estSalle = estUneSalle(conversation);
  const myParticipant = conversation?.participants?.find(
    (p) => p.user_id === user?.id && !p.left_at,
  );
  const isMuted = Boolean(myParticipant?.is_muted);
  /**
   * TCK-2977 (ADR-0131 § 3) — le copilote : pour le seul personnel servi (`copilote`), jamais dans le widget ni
   * sous impersonation. La fenêtre « N nouveaux messages » est relevée UNE FOIS par ouverture, au premier rendu
   * qui a des messages — avant que l'effet de `useMarkConversationRead` marque le fil lu et que la liste, relue,
   * remette `unread_count` à 0.
   */
  const copilote = !isWidget && copiloteDuFil(conversation);
  const clientDeRequetes = useContext(QueryClientContext);
  const [ouverture, setOuverture] = useState<{ readonly fil: number; readonly fenetre: FenetreDesNonLus } | null>(null);
  const nonLusConnus = messages.length > 0 && ouverture?.fil !== conversationId ? nonLusDeLaListe(clientDeRequetes, conversationId) : null;
  // Relevée quand un compte est connu : la liste, ou le fil chargé (son `last_read_at`). Sinon on attend ; et un
  // compte inconnu ne fait jamais une fenêtre (`fenetreDesNonLus`).
  if (messages.length > 0 && ouverture?.fil !== conversationId && (nonLusConnus !== null || conversation !== undefined)) {
    setOuverture({
      fil: conversationId,
      fenetre: fenetreDesNonLus(messages, user?.id, nonLusConnus, myParticipant ? myParticipant.last_read_at : undefined),
    });
  }
  const fenetre = copilote && ouverture?.fil === conversationId && ouverture.fenetre.premierNonLuId !== null ? ouverture.fenetre : null;
  const [demanderOuvert, setDemanderOuvert] = useState(false);
  /**
   * TCK-2978 (ADR-0131 § 5) — le brouillon : la demande en cours et le brouillon reçu, LIÉS au fil. Il est mis dans
   * le champ, jamais envoyé : seul « Envoyer » publie, puis la suggestion est décidée (`accepted` tel quel,
   * `edited` retouché) ; « Jeter le brouillon » la rejette.
   */
  const [brouillonDuFil, setBrouillonDuFil] = useState<{ readonly fil: number; readonly attente: AttenteDuBrouillon | null; readonly recu: BrouillonRecu | null }>({
    fil: conversationId,
    attente: null,
    recu: null,
  });
  if (brouillonDuFil.fil !== conversationId) setBrouillonDuFil({ fil: conversationId, attente: null, recu: null });
  const attenteDuBrouillon = brouillonDuFil.fil === conversationId ? brouillonDuFil.attente : null;
  const brouillonRecu = brouillonDuFil.fil === conversationId ? brouillonDuFil.recu : null;
  const { token: jeton } = useAuth();
  const contexteDAppel = { token: jeton, locale };
  const relireLeCopilote = () => void clientDeRequetes?.invalidateQueries({ queryKey: etatDuCopiloteQueryKey(conversationId, user?.id) });
  function demanderLeBrouillon(ton: 'court' | 'normal') {
    const connu = lireEtatDuCopilote(clientDeRequetes?.getQueryData(etatDuCopiloteQueryKey(conversationId, user?.id)));
    setBrouillonDuFil((b) => ({ ...b, fil: conversationId, attente: { n: (b.attente?.n ?? 0) + 1, avant: brouillonRecu?.suggestionId ?? connu.brouillon.suggestionId } }));
    void demanderUnBrouillon(conversationId, ton, contexteDAppel).then(relireLeCopilote, relireLeCopilote);
  }
  const heureDuMessage = (id: number): string | null => {
    const m = messages.find((x) => x.id === id);
    return m ? formatDateTime(m.created_at, locale, { timeStyle: 'short', dateStyle: undefined }) : null;
  };
  /** TCK-2977 — un renvoi du résumé ou une source : défile jusqu'au message et le surligne un instant. */
  const allerAuMessage = (id: number) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    el.setAttribute('data-surligne', '');
    setTimeout(() => el.removeAttribute('data-surligne'), 2_000);
  };
  /**
   * TCK-2955 — la présence et « en train d'écrire », pendant que le fil est ouvert seulement (le canal de
   * présence est quitté au démontage). Un identifiant ne compte que s'il est un AUTRE participant actif que
   * le fil a déjà lu : son nom vient de là, jamais du canal (qui ne publie que `{id}`).
   */
  const autresActifs = new Map(
    (conversation?.participants ?? [])
      .filter((p) => !p.left_at && p.user_id !== user?.id)
      .map((p) => [p.user_id, p.user?.full_name ?? null] as const),
  );
  const presents = usePresenceDuSujet(sujet).filter((id) => autresActifs.has(id));
  const ecriture = useEcritureDuSujet(sujet);
  const ecrivent = ecriture.auteurs.filter((id) => autresActifs.has(id));
  const nomQuiEcrit = ecrivent.length === 1 ? autresActifs.get(ecrivent[0]!) : null;
  const ligneDEcriture =
    ecrivent.length > 1
      ? t('chat.plusieursEcrivent')
      : nomQuiEcrit
        ? t('chat.ecrit', { nom: nomQuiEcrit })
        : null;
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
  /**
   * TCK-2968 (ADR-0128 § 6) — la destination du composeur : « Fil » (tous les participants) ou « Équipe » (la
   * note, que seul le personnel lit). Elle est LIÉE au fil (`fil`) : `ChatView` survit au changement de fil
   * (cf. plus bas), et la destination « Équipe » ne passe jamais d'un fil à l'autre. Elle revient à « Fil »
   * après chaque envoi réussi (`onSubmit`) ; un échec la garde, pour que le nouvel essai reste une note.
   * L'interrupteur n'existe que pour qui écrit des notes ici, selon l'API (`can_write_team_note` du contexte,
   * `lecteursDuFil`) : jamais pour un client, jamais dans le widget flottant.
   */
  const { data: contexteData } = useConversationContext(conversationId, { enabled: !isWidget });
  const lecteurs = lecteursDuFil(conversation, contexteData?.data, user?.id);
  const [destination, setDestination] = useState<{ readonly fil: number; readonly equipe: boolean }>({ fil: conversationId, equipe: false });
  // Un autre fil : la destination repart de « Fil » (ajustée pendant le rendu, patron « valeur précédente ») —
  // revenir au fil d'avant ne la rend pas « Équipe ».
  if (destination.fil !== conversationId) setDestination({ fil: conversationId, equipe: false });
  const equipe = !isWidget && lecteurs.equipeLit && destination.fil === conversationId && destination.equipe;
  const format = useFormatter();
  const invisiblePour = lecteurs.autres.length > 0 ? format.list(lecteurs.autres.map((p) => p.nom.split(' ')[0] ?? p.nom), { type: 'conjunction' }) : null;
  /** TCK-2968 — les noms des participants, par compte : une mention se lit en nom, jamais en identifiant. */
  const nomsDesParticipants = new Map((conversation?.participants ?? []).map((p) => [p.user_id, p.user?.full_name ?? ''] as const));
  // TCK-2984 — les noms que le pont affiche (relais, fenêtre) ; jamais un numéro.
  const nomsDuPont: Readonly<Record<number, string>> = Object.fromEntries((conversation?.participants ?? []).map((p) => [p.user_id, p.user?.full_name ?? '—']));
  // TCK-2972 (ADR-0130 § 2) — noter un engagement depuis un message : jamais dans le widget, ni sous
  // impersonation, ni sans droit d'écrire. Le personnel (`can_write_team_note` du contexte, jugé par l'API)
  // note pour tout participant ; tout autre, sa seule promesse. L'API reste juge.
  const lectureSeuleDesEngagements = useLectureSeule();
  const peutNoter = !isWidget && !lectureSeuleDesEngagements && canSend && user?.id != null && filAvecAgence(contexteData?.data);
  const [engagement, setEngagement] = useState<{ readonly message: Message; readonly etape: 'gestes' | 'formulaire' } | null>(null);
  /**
   * TCK-2968 — la mention en cours de saisie (après `@`), la ligne active de la liste, et les personnes
   * choisies dans CE fil : seules celles dont `@Nom` reste dans le texte partent (`mentionsDuTexte`).
   */
  const [mention, setMention] = useState<{ readonly debut: number; readonly fragment: string } | null>(null);
  const [mentionActive, setMentionActive] = useState(0);
  const [choisies, setChoisies] = useState<{ readonly fil: number; readonly liste: readonly Personne[] }>({ fil: conversationId, liste: [] });
  if (choisies.fil !== conversationId) setChoisies({ fil: conversationId, liste: [] });
  const choisiesDuFil = choisies.fil === conversationId ? choisies.liste : [];
  const candidats = mention && !isWidget ? filtrerLesMentionnables(mentionnables(lecteurs, equipe), mention.fragment) : [];
  const idListeDesMentions = `mentions-${conversationId}`;
  const champRef = useRef<HTMLTextAreaElement | null>(null);
  // TCK-2963 — pas dans une salle non plus : le locataire ET le bailleur y lisent.
  const reponsesRapides = !isGroup && !estSalle && duPersonnel;
  // TCK-2964 — partager un bien, proposer un créneau : le personnel, dans le fil d'un client.
  const poser = usePoserDansLeFil({ conversationId, actif: !isWidget && reponsesRapides });
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
    // ADR-0133, amendement (TCK-2996) — et quand le FIL rétrécit : le clavier qui monte réduit le cadre de la
    // conversation ; collé en bas, le dernier message reste au-dessus du composeur.
    observateur.observe(el);
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

  // TCK-2962 — les `event` consécutifs sans geste attendu se replient en une ligne.
  // TCK-2963 — dans une salle, par MOIS : un mois passé sous un seul séparateur, ses événements repliés ;
  // le mois courant jour par jour, ses événements dépliés. L'horloge est relevée une fois par montage.
  const [maintenant] = useState(() => new Date());
  const renderItems: readonly ElementDeLaSalle[] = estSalle
    ? chronologieDeLaSalle(messages, maintenant)
    : replierLesEvenements(groupMessagesByDay(messages));

  async function onSubmit(values: SendMessageFormValues) {
    // TCK-2968 — les mentions encore écrites, et la destination telle que l'interrupteur la montre.
    const mentions = mentionsDuTexte(values.content, choisiesDuFil);
    try {
      await sendMessage.mutateAsync({
        content: values.content,
        ...(equipe ? { visibility: 'team' as const } : {}),
        ...(mentions.length > 0 ? { mentions } : {}),
      });
      // TCK-2978 — un brouillon envoyé : `accepted` tel quel, `edited` avec le texte envoyé s'il a été retouché.
      if (brouillonRecu && !equipe) {
        const tel = values.content === brouillonRecu.texte;
        void deciderLaSuggestion(
          tel ? { suggestionId: brouillonRecu.suggestionId, decision: 'accepted' } : { suggestionId: brouillonRecu.suggestionId, decision: 'edited', final: { texte: values.content } },
          contexteDAppel,
        ).then(relireLeCopilote, relireLeCopilote);
        setBrouillonDuFil({ fil: conversationId, attente: null, recu: null });
      }
      form.reset({ content: '' });
      // TCK-2968 — après CHAQUE envoi, la destination revient à « Fil » : aucune note ne part ensuite à
      // l'insu de son auteur.
      setDestination({ fil: conversationId, equipe: false });
      setChoisies({ fil: conversationId, liste: [] });
      setMention(null);
    } catch {
      // L'échec s'affiche sous le champ (`erreurDEnvoi`) ; la destination ne change pas.
    }
  }

  /** TCK-2968 — la mention en cours, relue à chaque frappe ou déplacement du curseur. */
  function suivreLaMention(champ: HTMLTextAreaElement) {
    setMention(mentionEnCours(champ.value, champ.selectionStart ?? champ.value.length));
    setMentionActive(0);
  }

  /** TCK-2968 — remplace `@fragment` par `@Prénom Nom ` et retient la personne pour l'envoi. */
  function choisirLaMention(p: Personne) {
    if (!mention) return;
    const champ = champRef.current;
    const texte = form.getValues('content') ?? '';
    const curseur = champ?.selectionStart ?? texte.length;
    const r = insererLaMention(texte, mention.debut, Math.max(curseur, mention.debut + 1 + mention.fragment.length), p.nom);
    form.setValue('content', r.texte, { shouldDirty: true });
    setChoisies({ fil: conversationId, liste: [...choisiesDuFil.filter((x) => x.id !== p.id), p] });
    setMention(null);
    requestAnimationFrame(() => {
      champ?.focus();
      champ?.setSelectionRange(r.curseur, r.curseur);
    });
  }

  /** TCK-2968 — le bouton `@` du mode « Équipe » : pose `@` au curseur et ouvre la liste. */
  function ouvrirLesMentions() {
    const champ = champRef.current;
    const texte = form.getValues('content') ?? '';
    const curseur = champ?.selectionStart ?? texte.length;
    const avant = texte.slice(0, curseur);
    const pose = avant.length > 0 && !/\s$/.test(avant) ? ' @' : '@';
    const position = curseur + pose.length;
    form.setValue('content', avant + pose + texte.slice(curseur), { shouldDirty: true });
    setMention({ debut: position - 1, fragment: '' });
    setMentionActive(0);
    requestAnimationFrame(() => {
      champ?.focus();
      champ?.setSelectionRange(position, position);
    });
  }

  const erreurDEnvoi = sendMessage.error ? messageErreurApi(sendMessage.error, tRacine, t('composer.envoiEchoue')) : null;
  const { ref: refDuChamp, ...champDuContenu } = form.register('content', {
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // TCK-2968 (ADR-0129 § 2) — écrire une NOTE n'émet pas « en train d'écrire » : le message éphémère
      // part sur le canal de présence du fil, que les clients écoutent aussi.
      if (!equipe) ecriture.signalerFrappe();
      suivreLaMention(e.target);
    },
  });

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
            } else if (estSalle) salle?.onDossier();
            else setInfoOpen(true);
          }}
          contexte={contexte}
          onPlusDActions={onPlusDActions}
          gestes={gestes}
          presents={presents}
          assistant={copilote ? <BoutonDeLAssistant conversationId={conversationId} onOuvrir={() => setDemanderOuvert(true)} /> : undefined}
        />
      )}
      {/* TCK-2984 — au téléphone, les puces des participants joints par le pont ; rien sans bloc `pont`. */}
      {!isWidget ? <PucesDuPont participants={participantsDuPont(contexteData?.data)} noms={nomsDuPont} moi={user?.id} /> : null}
      {/* TCK-2963 — le bandeau de l'objet, collé sous l'en-tête (maquette `BandeauBail`). */}
      {!isWidget && estSalle ? salle?.bandeau : null}
      {isGroup && !isWidget && (
        <ConversationInfoSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          conversation={conversation}
          currentMute={isMuted}
        />
      )}

      {/* TCK-2977 — « Demander au fil » (feuille au téléphone, panneau droit au bureau), et les transcriptions. */}
      {copilote ? (
        <>
          <DemanderAuFil
            conversationId={conversationId}
            ouvert={demanderOuvert}
            onOuvertChange={setDemanderOuvert}
            onVersLeComposeur={(texte) => {
              // Rien ne s'envoie : le texte va dans le composeur, l'envoi reste le geste de la personne.
              form.setValue('content', texte, { shouldDirty: true });
              setDemanderOuvert(false);
              form.setFocus('content');
            }}
            heureDe={heureDuMessage}
            onAllerAuMessage={allerAuMessage}
          />
        </>
      ) : null}
      {/* TCK-2978 — les promesses, demandées à l'ouverture du fil. */}
      {copilote && anchorId !== null ? <DemandeDesPromesses conversationId={conversationId} dernierMessageId={anchorId} /> : null}
      {/* TCK-2977 — la transcription a son propre interrupteur (ADR-0131 § 8) : on l'écoute dès qu'une note la porte. */}
      {!isWidget && messages.some((m) => m.transcription !== undefined) ? <EcouteDesTranscriptions conversationId={conversationId} /> : null}

      {/* TCK-2972 — les gestes d'un message (appui long) et le formulaire « Noter un engagement ». */}
      {engagement && user?.id != null ? (
        engagement.etape === 'gestes' ? (
          <GestesDuMessage open onOpenChange={(o) => !o && setEngagement(null)} onNoter={() => setEngagement({ message: engagement.message, etape: 'formulaire' })} />
        ) : (
          <NoterUnEngagement
            key={engagement.message.id}
            conversationId={conversationId}
            message={engagement.message}
            participants={(conversation?.participants ?? []).filter((p) => !p.left_at).map((p) => ({ id: p.user_id, nom: p.user?.full_name ?? '—' }))}
            moi={user.id}
            duPersonnel={lecteurs.equipeLit}
            open
            onOpenChange={(o) => !o && setEngagement(null)}
          />
        )
      ) : null}

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
              // TCK-2977 — « N nouveaux messages » et « Ce que vous avez manqué », avant le premier non-lu relevé.
              const avant =
                fenetre &&
                ((item.kind === 'message' && item.message.id === fenetre.premierNonLuId) ||
                  (item.kind === 'evenements' && item.messages.some((x) => x.id === fenetre.premierNonLuId))) ? (
                  <CeQueVousAvezManque conversationId={conversationId} fenetre={fenetre} heureDe={heureDuMessage} onAllerAuMessage={allerAuMessage} coupure={coupureDeLaFonction(conversation, 'resume')} />
                ) : null;
              const element = ((): ReactNode => {
              if (item.kind === 'separator') {
                return <MessageDateSeparator key={item.key} date={item.date} />;
              }
              if (item.kind === 'mois') {
                return <SeparateurDeMois key={item.key} date={item.date} maintenant={maintenant} />;
              }
              if (item.kind === 'evenements') {
                return <EvenementsReplies key={item.key} messages={item.messages} ouvertParDefaut={item.ouvert} jour={item.passe} />;
              }
              const m = item.message;
              // TCK-2958 — un `event` est un avis. TCK-2962 — une `card`, et un `event` qui attend un geste
              // de ce lecteur (`action_attendue`), sont des cartes rendues depuis leur objet.
              return natureDuMessage(m) === 'carte' ? (
                <CarteDuFil key={m.id} message={m} conversationId={conversationId} moi={m.sender_id != null && m.sender_id === user?.id} auteur={isGroup || estSalle} />
              ) : m.type === 'system' || m.type === 'event' ? (
                <SystemMessageBubble key={m.id} message={m} />
              ) : (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isOwn={m.sender_id === user?.id}
                  auteur={isGroup || estSalle}
                  locale={locale}
                  relirePiece={relirePiece}
                  jour={item.kind === 'message' && item.passe === true}
                  nomsDesMentions={(m.metadata?.mentions ?? []).flatMap((id) => {
                    const nom = nomsDesParticipants.get(id);
                    return nom ? [nom] : [];
                  })}
                  invisiblePour={invisiblePour}
                  onNoter={peutNoter ? (etape) => setEngagement({ message: m, etape }) : undefined}
                  nomsDuPont={nomsDuPont} // TCK-2984
                />
              );
              })();
              // TCK-2978 — sous un message au fil (jamais une note d'équipe), le bloc « Repéré par l'assistant ».
              const apres =
                copilote && item.kind === 'message' && item.message.visibility !== 'team' && natureDuMessage(item.message) !== 'carte' && item.message.type !== 'system' && item.message.type !== 'event' ? (
                  <PromessesDuMessage
                    conversationId={conversationId}
                    message={item.message}
                    participants={(conversation?.participants ?? []).filter((p) => !p.left_at).map((p) => ({ id: p.user_id, nom: p.user?.full_name ?? '—' }))}
                  />
                ) : null;
              if (avant || apres) {
                return (
                  <Fragment key={`copilote-${item.kind === 'message' ? item.message.id : fenetre?.premierNonLuId}`}>
                    {avant}
                    {element}
                    {apres}
                  </Fragment>
                );
              }
              return element;
            })}
          </ul>
        )}
      </div>

      {/* TCK-2955 — « en train d'écrire » : une ligne courte au-dessus du champ, qui s'efface seule. */}
      <p
        aria-live="polite"
        data-testid="ecriture-du-fil"
        className={cn('bg-muted/50 px-4 text-xs text-muted-foreground', ligneDEcriture && 'pb-1.5')}
      >
        {ligneDEcriture}
      </p>

      {/* TCK-2984 — la fenêtre de 24 h des destinataires joints par le pont ; rien sans bloc `pont` dans le contexte. */}
      {canSend && !isWidget ? <BandeauDeLaFenetre participants={participantsDuPont(contexteData?.data)} noms={nomsDuPont} moi={user?.id} /> : null}
      {canSend ? (
        <ChatComposerShell
          // TCK-316 — `handleSubmit(onSubmit)` était APPELÉ pendant le rendu pour
          // produire le gestionnaire ; on diffère l'appel dans l'événement, ce que fait
          // déjà le bouton plus bas.
          onSubmit={envoyer}
          sendDisabled={sendMessage.isPending || sendAttachment.isPending || pieceJointe.preparation}
          sendAriaLabel={t('chat.sendAria')}
          error={pieceJointe.refus ?? erreurDEnvoi}
          // TCK-683 (P13.03) avait retiré le trombone, qui postait sur `/messages/{m}/attachments`,
          // qu'aucune route ne sert. TCK-2632 le rend, sur la route du texte (TCK-2631) ; le widget
          // flottant n'en a pas : la photo s'envoie depuis la messagerie.
          leading={
            isWidget ? (
              <VoiceNoteRecorder conversationId={conversationId} />
            ) : equipe ? (
              // TCK-2968 — une note ne porte ni pièce ni partage (elles partiraient au fil entier) : `@` les remplace.
              <button
                type="button"
                onClick={ouvrirLesMentions}
                aria-label={t('composer.mentions.bouton')}
                className="-ml-2 inline-flex size-11 flex-none items-center justify-center rounded-full text-warning outline-none hover:bg-warning/10 focus-visible:ring-3 focus-visible:ring-ring"
              >
                <AtSign className="size-5 stroke-[1.75]" aria-hidden />
              </button>
            ) : noteEnCours ? null : (
              <>
              {/* TCK-2978 — ✦ « Proposer une réponse » : en mode Fil seulement, pour le personnel servi. */}
              {copilote ? (
                <button
                  type="button"
                  onClick={() => demanderLeBrouillon('normal')}
                  aria-label={t('copilote.brouillon.proposer')}
                  data-testid="bouton-brouillon"
                  className="-ml-1 inline-flex size-11 flex-none items-center justify-center rounded-full text-primary-deep outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <Sparkles className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : null}
              <BoutonDePieceJointe
                onChoisir={(f) => void pieceJointe.choisir(f)}
                desactive={sendAttachment.isPending}
                appareilPhoto={telephone}
                entrees={poser.entrees}
              />
              </>
            )
          }
          messagerie={
            isWidget
              ? undefined
              : {
                  // TCK-2968 — en mode « Équipe », ni note vocale (elle partirait au fil entier) ni rond
                  // d'envoi : « Noter », la destination écrite sur le bouton.
                  apresLeChamp: equipe ? null : (
                    <VoiceNoteRecorder
                      conversationId={conversationId}
                      auRepos={aEnvoyer ? 'masque' : 'visible'}
                      rond
                      onActif={setNoteEnCours}
                    />
                  ),
                  envoiVisible: aEnvoyer && !noteEnCours,
                  envoi: equipe ? (
                    <Button
                      type="submit"
                      disabled={sendMessage.isPending}
                      data-testid="bouton-noter"
                      className="h-11 shrink-0 gap-1.5 rounded-full bg-foreground px-4 font-semibold text-background hover:bg-foreground/90"
                    >
                      <Lock className="size-3.5" strokeWidth={2.25} aria-hidden />
                      {t('composer.equipe.noter')}
                    </Button>
                  ) : undefined,
                }
          }
          dessus={
            isWidget ? null : (
              <>
                <ListeDesMentions
                  id={idListeDesMentions}
                  personnes={candidats}
                  active={Math.min(mentionActive, Math.max(0, candidats.length - 1))}
                  note={equipe}
                  onChoisir={choisirLaMention}
                />
                {equipe ? null : reponsesRapides ? (
                  <ReponsesRapides
                    onChoisir={(phrase) => {
                      form.setValue('content', insererLaReponse(form.getValues('content') ?? '', phrase), { shouldDirty: true });
                      form.setFocus('content');
                    }}
                  />
                ) : null}
                {/* TCK-2978 — le brouillon de l'assistant, au-dessus du champ (mode Fil). */}
                {copilote && !equipe ? (
                  <BrouillonDuComposeur
                    conversationId={conversationId}
                    attente={attenteDuBrouillon}
                    brouillon={brouillonRecu}
                    intact={brouillonRecu !== null && contenu === brouillonRecu.texte}
                    onArrive={(b) => {
                      setBrouillonDuFil({ fil: conversationId, attente: null, recu: b });
                      form.setValue('content', b.texte, { shouldDirty: true });
                    }}
                    onJeter={() => {
                      if (brouillonRecu) void deciderLaSuggestion({ suggestionId: brouillonRecu.suggestionId, decision: 'rejected' }, contexteDAppel).then(relireLeCopilote, relireLeCopilote);
                      setBrouillonDuFil({ fil: conversationId, attente: null, recu: null });
                      form.setValue('content', '', { shouldDirty: true });
                    }}
                    onRedemander={demanderLeBrouillon}
                  />
                ) : null}
                {equipe ? null : (
                  <>
                    <ApercuDeLaPiece piece={pieceJointe.piece} preparation={pieceJointe.preparation} onRetirer={pieceJointe.retirer} />
                    {poser.feuilles}
                  </>
                )}
                <LigneDesLecteurs
                  equipeLit={lecteurs.equipeLit}
                  equipe={equipe}
                  onEquipe={(actif) => setDestination({ fil: conversationId, equipe: actif })}
                  personnel={lecteurs.personnel}
                  autres={lecteurs.autres}
                  indisponible={pieceJointe.piece !== null || pieceJointe.preparation || noteEnCours}
                />
              </>
            )
          }
        >
          <Textarea
            profil="message"
            {...champDuContenu}
            ref={(el) => {
              refDuChamp(el);
              champRef.current = el;
            }}
            rows={1}
            placeholder={equipe ? t('composer.equipe.placeholder') : t('chat.placeholder')}
            data-destination={equipe ? 'equipe' : 'fil'}
            // TCK-2968 — la liste des mentions se pilote depuis le champ (↑ ↓ Entrée Échap).
            aria-autocomplete={isWidget ? undefined : 'list'}
            aria-controls={candidats.length > 0 ? idListeDesMentions : undefined}
            aria-activedescendant={
              candidats.length > 0 ? `${idListeDesMentions}-${candidats[Math.min(mentionActive, candidats.length - 1)]!.id}` : undefined
            }
            onClick={(e) => (isWidget ? undefined : suivreLaMention(e.currentTarget))}
            className={
              isWidget
                ? 'min-h-11 resize-none sm:min-h-9'
                : cn(
                    'min-h-11 resize-none rounded-[1.375rem] bg-background px-4 py-2.5 text-corps',
                    // TCK-2968 — la teinte ocre du champ : la note se voit avant d'être écrite.
                    equipe && 'border-transparent bg-warning/12 placeholder:text-encre-douce',
                    noteEnCours && 'hidden',
                  )
            }
            onKeyDown={(e) => {
              if (candidats.length > 0) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const pas = e.key === 'ArrowDown' ? 1 : -1;
                  setMentionActive((i) => (Math.min(i, candidats.length - 1) + pas + candidats.length) % candidats.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  choisirLaMention(candidats[Math.min(mentionActive, candidats.length - 1)]!);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMention(null);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                envoyer();
              }
            }}
          />
        </ChatComposerShell>
      ) : estSalle && salle ? (
        // TCK-2963 — la salle dit POURQUOI (bail fini, réservation close, fil fermé), en code composé ici.
        salle.lectureSeule
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
  jour = false,
  nomsDesMentions = [],
  invisiblePour = null,
  onNoter,
  nomsDuPont = {},
}: {
  message: Message;
  isOwn: boolean;
  auteur: boolean;
  locale: Locale;
  relirePiece: RelirePiece;
  /** TCK-2963 — sous un séparateur de mois (salle), l'heure se lit avec son jour. */
  jour?: boolean;
  /** TCK-2968 — les NOMS des personnes mentionnées (`metadata.mentions` nommés par l'appelant). */
  nomsDesMentions?: readonly string[];
  /** TCK-2968 — une note d'équipe : les prénoms de qui ne la lit pas (`null` : inconnu). */
  invisiblePour?: string | null;
  /** TCK-2972 — « Noter un engagement » : la barre du survol (bureau), l'appui long (téléphone). Absent : aucun geste. */
  onNoter?: (etape: 'gestes' | 'formulaire') => void;
  /** TCK-2984 — les noms des participants, pour l'état des relais du pont. */
  nomsDuPont?: Readonly<Record<number, string>>;
}) {
  const t = useTranslations('messaging.chat');
  const appuiLong = useAppuiLong(onNoter ? () => onNoter('gestes') : undefined);
  const role = message.sender?.role_label_code ?? null;
  const cleDuRole = role ? `role.${role}` : null;
  const signature =
    message.sender && cleDuRole && t.has(cleDuRole)
      ? t('auteurEtRole', { nom: message.sender.full_name, role: t(cleDuRole) })
      : message.sender?.full_name;
  const lu = isOwn && (message.read_by_recipient === true || (message.read_count ?? 0) > 0);
  const heure = formatDateTime(message.created_at, locale, jour ? { timeStyle: 'short', dateStyle: 'medium' } : { timeStyle: 'short', dateStyle: undefined });
  // TCK-2968 (ADR-0128 § 6) — une note d'équipe : l'aplat ocre, le cadenas, qui ne la lit pas. Elle n'arrive
  // qu'à qui la lit (TCK-2965) ; une réponse d'avant sans `visibility` est un message au fil.
  const note = message.visibility === 'team';
  // TCK-2861 — la note vocale dessinée (rond, onde, « 0:23 ») : `NoteVocale.tsx`, isolé pour TCK-2901.
  const lecteurAudio =
    message.type === 'audio' && message.attachments?.[0] ? (
      <LecteurDeNoteVocale
        piece={message.attachments[0]}
        duree={message.metadata?.duration}
        relirePiece={relirePiece}
        mienne={isOwn && !note}
        // L'élément reste écrit ICI : ses sous-titres absents sont gelés au nom de ce fichier.
        rendreAudio={({ ref, ...attributs }) => <audio ref={ref} {...attributs} />}
      />
    ) : null;
  // TCK-2977 (TCK-2976) — sous le lecteur, la transcription : la clé n'arrive qu'au personnel servi ; absente, rien.
  const noteEtTranscription = lecteurAudio ? (
    <>
      {lecteurAudio}
      <TranscriptionDeLaNote conversationId={message.conversation_id} messageId={message.id} transcription={message.transcription} />
    </>
  ) : null;
  if (note) {
    return (
      <NoteDEquipe mienne={isOwn} auteur={message.sender?.full_name ?? null} invisiblePour={invisiblePour} heure={heure}>
        {noteEtTranscription ?? <TexteAvecMentions texte={message.content ?? ''} noms={nomsDesMentions} />}
      </NoteDEquipe>
    );
  }
  return (
    // TCK-2972 — `group/bulle` : le survol de la bulle montre « Noter un engagement » (jamais sur une note d'équipe : elle rend plus haut).
    // TCK-2977 — `data-message-id` : le renvoi du résumé y défile, et `data-surligne` le marque un instant.
    <li
      data-message-id={message.id}
      className={cn('group/bulle flex items-center gap-1.5 rounded-2xl transition-colors data-surligne:bg-primary/10', isOwn ? 'justify-end' : 'justify-start')}
    >
      {onNoter && isOwn ? <BoutonNoter onNoter={() => onNoter('formulaire')} /> : null}
      <div
        {...appuiLong}
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
        {noteEtTranscription ? (
          noteEtTranscription
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
            {/* TCK-2968 — `@Nom` des personnes mentionnées, en valeur ; jamais un identifiant. */}
            <TexteAvecMentions
              texte={message.content ?? ''}
              noms={nomsDesMentions}
              className={cn(isOwn && '[&_[data-testid=mention]]:text-background [&_[data-testid=mention]]:underline')}
            />
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
          {heure}
          {lu ? <CheckCheck className="size-3.5 flex-none" role="img" aria-label={t('lu')} data-testid="coche-lu" /> : null}
        </p>
        {/* TCK-2984 — le canal et l'état des relais : seulement si la réponse les porte (personnel, auteur). */}
        <PontDuMessage message={message} noms={nomsDuPont} className={cn(isOwn && 'text-background/65')} />
      </div>
      {onNoter && !isOwn ? <BoutonNoter onNoter={() => onNoter('formulaire')} /> : null}
    </li>
  );
}
