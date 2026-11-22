'use client';

/**
 * TCK-2977 (ADR-0131) — le copilote du fil, côté lecture : son état par sorte, ses demandes, la décision
 * « Utile / Pas utile », et la transcription d'une note vocale. Tout le contrat avec l'API vit ICI : les
 * routes de TCK-2974 à TCK-2976, la normalisation de leurs réponses, et la clé de requête.
 *
 * Deux règles portées par ce module, et par lui seul :
 *
 * · **La clé de requête est par fil ET par utilisateur** ({@link etatDuCopiloteQueryKey}) : un résumé ou une
 *   réponse est propre à son lecteur, jamais servi d'un cache partagé entre comptes.
 * · **Aucune requête ne part d'ici sans que l'appelant l'ait voulu** : les hooks ne s'activent que si
 *   `actif` est vrai, et les composants qui les appellent ne sont montés que pour un fil dont
 *   `ConversationResource.copilote` est vrai, hors impersonation (`copiloteDuFil`).
 */
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { apiRequest, ApiError } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { relaisImpersonationActif } from '@/lib/impersonation';
import { useIntervalleDeRelecture, useSignal } from '@/lib/temps-reel/hooks';
import type { Conversation } from '@/types/message';

/**
 * ADR-0131 § 3 — un fil est « chargé » à 10 messages comptés non lus. La MÊME valeur que celle de l'API
 * (`ReglagesDuCopilote`, seuil du résumé), qui la rejuge (422 `copilote.resume_inutile`).
 */
export const SEUIL_DU_RESUME = 10;

/** Le code du signal émis au seul demandeur quand une proposition arrive (`CodeDeSignal::CopiloteUpdated`). */
export const SIGNAL_DU_COPILOTE = 'copilote.updated';

export type SorteDuCopilote = 'resume' | 'question' | 'brouillon' | 'promesses';

export type EtatDUneSorte = 'aucun' | 'en_cours' | 'prete' | 'refusee' | 'echec';

/** La portée d'une coupure (`ReglagesDuCopilote::coupure`) : la plateforme, ou l'agence (TCK-2979). */
export type PorteeDeLaCoupure = 'plateforme' | 'agence';

export type PointDuResume = {
  readonly texte: string;
  readonly message_id: number;
  readonly attend_le_lecteur: boolean;
};

export type PropositionDeResume = {
  readonly points: readonly PointDuResume[];
  readonly depuis_message_id: number | null;
  readonly jusqu_a_message_id: number | null;
};

export type SourceDeLaReponse = {
  readonly type: 'message' | 'objet';
  readonly id: number;
  readonly objet_type?: string | null;
};

export type PropositionDeReponse = {
  readonly question: string;
  readonly reponse: string;
  readonly sources: readonly SourceDeLaReponse[];
};

export type EtatDeSorte<P> = {
  readonly etat: EtatDUneSorte;
  readonly code: string | null;
  readonly portee: PorteeDeLaCoupure | null;
  readonly suggestionId: number | null;
  readonly proposition: P | null;
};

export type EtatDuCopilote = {
  readonly resume: EtatDeSorte<PropositionDeResume>;
  readonly question: EtatDeSorte<PropositionDeReponse>;
  // TCK-2978 — le brouillon et les promesses (TCK-2975).
  readonly brouillon: EtatDeSorte<PropositionDeBrouillon>;
  readonly promesses: EtatDeSorte<null> & { readonly liste: readonly PromesseRepere[] };
};

/** TCK-2978 — un appui du brouillon (`{type, id}`, TCK-2975) : l'objet qu'il a lu. */
export type AppuiDuBrouillon = { readonly type: string; readonly id: number };

export type PropositionDeBrouillon = { readonly texte: string; readonly appuis: readonly AppuiDuBrouillon[] };

/**
 * TCK-2978 — une promesse repérée : UNE suggestion par promesse (TCK-2975), aux champs de création d'un
 * engagement (`source_message_id` ← `message_id`, `holder_id` ← `porteur_id`, `title` ← `libelle`,
 * `due_at` ← `echeance`).
 */
export type PromesseRepere = {
  readonly suggestionId: number;
  readonly messageId: number;
  readonly porteurId: number;
  readonly libelle: string;
  readonly echeance: string | null;
};

const AUCUN: EtatDeSorte<never> = { etat: 'aucun', code: null, portee: null, suggestionId: null, proposition: null };

const ETATS: readonly EtatDUneSorte[] = ['aucun', 'en_cours', 'prete', 'refusee', 'echec'];

function objet(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function entier(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

function texte(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function lirePropositionDeResume(brut: unknown): PropositionDeResume | null {
  const p = objet(brut);
  if (!p || !Array.isArray(p.points)) return null;
  const points = p.points.flatMap((x): PointDuResume[] => {
    const o = objet(x);
    const t = texte(o?.texte);
    const id = entier(o?.message_id);
    return o && t && id !== null ? [{ texte: t, message_id: id, attend_le_lecteur: o.attend_le_lecteur === true }] : [];
  });
  return { points, depuis_message_id: entier(p.depuis_message_id), jusqu_a_message_id: entier(p.jusqu_a_message_id) };
}

function lirePropositionDeReponse(brut: unknown): PropositionDeReponse | null {
  const p = objet(brut);
  const reponse = texte(p?.reponse);
  if (!p || reponse === null) return null;
  const sources = Array.isArray(p.sources)
    ? p.sources.flatMap((x): SourceDeLaReponse[] => {
        const o = objet(x);
        const id = entier(o?.id);
        if (!o || id === null || (o.type !== 'message' && o.type !== 'objet')) return [];
        return [{ type: o.type, id, objet_type: texte(o.objet_type) }];
      })
    : [];
  return { question: texte(p.question) ?? '', reponse, sources };
}

/**
 * L'état d'une sorte (`statut`, `code`, `portee`, `suggestion_id`, `proposition`), lu défensivement : un champ absent ou mal formé retombe sur « aucun », jamais sur une
 * erreur affichée. Accepte `proposition` ou `proposal`, `suggestion_id` ou `suggestion.id`.
 */
export function lireEtatDeSorte<P>(brut: unknown, lireProposition: (b: unknown) => P | null): EtatDeSorte<P> {
  const o = objet(brut);
  if (!o) return AUCUN;
  // L'API écrit `statut` (`EtatDuCopilote`, TCK-2974) ; `etat` est accepté aussi (le contrat du ticket).
  const brutDeLEtat = o.statut ?? o.etat;
  const etat = ETATS.includes(brutDeLEtat as EtatDUneSorte) ? (brutDeLEtat as EtatDUneSorte) : 'aucun';
  const portee = o.portee === 'plateforme' || o.portee === 'agence' ? o.portee : null;
  const proposition = lireProposition(o.proposition ?? o.proposal ?? null);
  return {
    etat: etat === 'prete' && proposition === null ? 'aucun' : etat,
    code: texte(o.code),
    portee,
    suggestionId: entier(o.suggestion_id) ?? entier(objet(o.suggestion)?.id),
    proposition,
  };
}

function lirePropositionDeBrouillon(brut: unknown): PropositionDeBrouillon | null {
  const p = objet(brut);
  const t = texte(p?.texte);
  if (!p || t === null) return null;
  const appuis = Array.isArray(p.appuis)
    ? p.appuis.flatMap((x): AppuiDuBrouillon[] => {
        const o = objet(x);
        const id = entier(o?.id);
        const type = texte(o?.type);
        return o && id !== null && type ? [{ type, id }] : [];
      })
    : [];
  return { texte: t, appuis };
}

/**
 * TCK-2978 — les promesses en attente, lues défensivement : `promesses`, `propositions` ou
 * `proposition.promesses`, chacune portant son `suggestion_id` (une suggestion par promesse).
 */
function lireLesPromesses(brut: unknown): readonly PromesseRepere[] {
  const o = objet(brut);
  if (!o) return [];
  const liste = [o.promesses, o.propositions, objet(o.proposition)?.promesses].find(Array.isArray) as unknown[] | undefined;
  return (liste ?? []).flatMap((x): PromesseRepere[] => {
    const p = objet(x);
    const prop = objet(p?.proposition) ?? objet(p?.proposal) ?? p;
    const suggestionId = entier(p?.suggestion_id) ?? entier(objet(p?.suggestion)?.id);
    const messageId = entier(prop?.message_id);
    const porteurId = entier(prop?.porteur_id);
    const libelle = texte(prop?.libelle);
    if (suggestionId === null || messageId === null || porteurId === null || !libelle) return [];
    return [{ suggestionId, messageId, porteurId, libelle, echeance: texte(prop?.echeance) }];
  });
}

export function lireEtatDuCopilote(brut: unknown): EtatDuCopilote {
  // `{data: {conversation_id, sortes: {resume: {statut, …}}}}` (`ConversationCopiloteController::etat`).
  const donnees = objet(objet(brut)?.data) ?? objet(brut) ?? {};
  const racine = objet(donnees.sortes) ?? donnees;
  return {
    resume: lireEtatDeSorte(racine.resume, lirePropositionDeResume),
    question: lireEtatDeSorte(racine.question, lirePropositionDeReponse),
    brouillon: lireEtatDeSorte(racine.brouillon, lirePropositionDeBrouillon),
    promesses: { ...lireEtatDeSorte(racine.promesses, () => null), liste: lireLesPromesses(racine.promesses) },
  };
}

/** Le fil a-t-il le copilote pour ce lecteur ? `copilote` de l'API, et jamais sous impersonation. */
export function copiloteDuFil(conversation: Pick<Conversation, 'copilote'> | undefined | null): boolean {
  const c = conversation?.copilote;
  // `false`, absent ou mal formé : aucun copilote. Un objet (`{fonctions}`, TCK-2974) ou `true` : le personnel servi.
  if (c !== true && (typeof c !== 'object' || c === null)) return false;
  return !relaisImpersonationActif();
}

/**
 * TCK-2977 — la coupure d'une fonction, lue sur `copilote.fonctions` du fil SANS requête : `plateforme` ou
 * `agence` quand elle est coupée, `null` sinon (servie, inconnue, ou `non_configuree`, qui ne se dit pas ainsi).
 */
export function coupureDeLaFonction(conversation: Pick<Conversation, 'copilote'> | undefined | null, fonction: string): PorteeDeLaCoupure | 'non_configuree' | null {
  const c = conversation?.copilote;
  if (typeof c !== 'object' || c === null) return null;
  const f = c.fonctions?.[fonction];
  if (!f || f.active) return null;
  return f.raison === 'agence' || f.raison === 'non_configuree' ? f.raison : 'plateforme';
}

/** Par fil ET par utilisateur : le résumé d'un agent n'est jamais servi à son collègue (AC3). */
export function etatDuCopiloteQueryKey(conversationId: number, utilisateurId: number | null | undefined): QueryKey {
  return ['copilote', 'etat', conversationId, utilisateurId ?? null];
}

/**
 * L'état du copilote du lecteur pour ce fil. Relu à chaque `copilote.updated` de son canal (ADR-0131 § 3) ;
 * tant qu'une sorte est « en cours », relu aussi à la cadence de sécurité (60 s sous un canal tenu, 5 s
 * sinon) pour rattraper un signal perdu.
 */
export function useEtatDuCopilote(conversationId: number, utilisateurId: number | null | undefined, actif: boolean) {
  const queryClient = useQueryClient();
  const cle = etatDuCopiloteQueryKey(conversationId, utilisateurId);
  const cible = actif ? { personnel: [SIGNAL_DU_COPILOTE] } : null;
  useSignal(cible, () => {
    void queryClient.invalidateQueries({ queryKey: cle });
  });
  const intervalle = useIntervalleDeRelecture(5_000, cible);
  const requete = useApiQuery<unknown>(cle, cheminApi`/api/conversations/${conversationId}/copilote`, {
    enabled: actif && utilisateurId != null,
    staleTime: 0,
    refetchInterval: (q) => {
      const etat = lireEtatDuCopilote(q.state.data);
      return etat.resume.etat === 'en_cours' || etat.question.etat === 'en_cours' ? intervalle : false;
    },
  });
  return { ...requete, etat: requete.data === undefined ? null : lireEtatDuCopilote(requete.data) };
}

/** Le code d'un refus de l'API (`{code}` de l'enveloppe d'erreur), ou `null`. */
export function codeDuRefus(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const o = objet(err.data);
  return texte(o?.code) ?? texte(objet(o?.error)?.code) ?? null;
}

/**
 * Les fenêtres de résumé déjà demandées dans cette session, par (utilisateur, fil, premier non-lu) : une
 * ouverture ne demande qu'une fois, même si `ChatView` se remonte (mode strict, changement de fil aller-retour).
 */
const resumesDemandes = new Set<string>();
/** Les notes vocales dont la transcription a été demandée dans cette session, par (utilisateur, message). */
const transcriptionsDemandees = new Set<string>();

/** Tests seulement. */
export function oublierLesDemandesDuCopilote(): void {
  resumesDemandes.clear();
  transcriptionsDemandees.clear();
  promessesDemandees.clear();
}

type Contexte = { readonly token: string | null; readonly locale: string };

/**
 * Demande le résumé d'une fenêtre, une seule fois par session. Silencieuse : un refus (422
 * `copilote.resume_inutile`, 403…) ne s'affiche pas ; l'état relu dit le reste. Rend `true` si la demande
 * est partie.
 */
export function demanderLeResume(
  conversationId: number,
  utilisateurId: number,
  depuisMessageId: number,
  { token, locale }: Contexte,
  apres: () => void,
): boolean {
  const cle = `${utilisateurId}:${conversationId}:${depuisMessageId}`;
  if (resumesDemandes.has(cle)) return false;
  resumesDemandes.add(cle);
  apiRequest(cheminApi`/api/conversations/${conversationId}/copilote/resume`, {
    method: 'POST',
    body: { depuis_message_id: depuisMessageId },
    token: token ?? undefined,
    locale,
  })
    .then(apres, apres)
    .catch(() => undefined);
  return true;
}

/**
 * Demande la transcription d'une note dont l'état est `aucune`, une seule fois par (utilisateur, message) et
 * par session, même si la bulle se remonte (relecture, défilement).
 */
export function demanderLaTranscription(
  conversationId: number,
  messageId: number,
  utilisateurId: number,
  { token, locale }: Contexte,
  apres: () => void,
): boolean {
  const cle = `${utilisateurId}:${messageId}`;
  if (transcriptionsDemandees.has(cle)) return false;
  transcriptionsDemandees.add(cle);
  apiRequest(cheminApi`/api/conversations/${conversationId}/messages/${messageId}/transcription`, {
    method: 'POST',
    token: token ?? undefined,
    locale,
  })
    .then(apres, apres)
    .catch(() => undefined);
  return true;
}

/** « Demander au fil » : la question, 500 caractères au plus (TCK-2975). */
export const LONGUEUR_MAX_DE_LA_QUESTION = 500;

export function usePoserUneQuestion(conversationId: number, utilisateurId: number | null | undefined) {
  return useApiMutation<unknown, { question: string }>(
    { path: cheminApi`/api/conversations/${conversationId}/copilote/question`, method: 'POST' },
    { invalidate: [etatDuCopiloteQueryKey(conversationId, utilisateurId)] },
  );
}

/** « Utile » → `accepted`, « Pas utile » → `rejected` (TCK-2975, `SuggestionRecorder`). */
export type AvisSurLaSuggestion = 'accepted' | 'rejected';

/** TCK-2978 — `edited` porte `final` : le texte envoyé (brouillon) ou les champs de l'engagement créé (promesse). */
export type DecisionSurLaSuggestion =
  | { readonly suggestionId: number; readonly decision: AvisSurLaSuggestion }
  | { readonly suggestionId: number; readonly decision: 'edited'; readonly final: Record<string, unknown> };

export function useDeciderLaSuggestion(conversationId: number, utilisateurId: number | null | undefined) {
  return useApiMutation<unknown, DecisionSurLaSuggestion>(
    {
      path: ({ suggestionId }) => cheminApi`/api/copilote/suggestions/${suggestionId}/decision`,
      method: 'PUT',
      body: (d) => (d.decision === 'edited' ? { decision: d.decision, final: d.final } : { decision: d.decision }),
    },
    { invalidate: [etatDuCopiloteQueryKey(conversationId, utilisateurId)] },
  );
}

/** TCK-2978 — « Proposer un brouillon » (`{ton?: court|normal}`, TCK-2975). */
export function useDemanderUnBrouillon(conversationId: number, utilisateurId: number | null | undefined) {
  return useApiMutation<unknown, { ton?: 'court' | 'normal' }>(
    { path: cheminApi`/api/conversations/${conversationId}/copilote/brouillon`, method: 'POST' },
    { invalidate: [etatDuCopiloteQueryKey(conversationId, utilisateurId)] },
  );
}

/** Les ouvertures de fil dont les promesses ont été demandées dans cette session. */
const promessesDemandees = new Set<string>();

/**
 * TCK-2978 — les promesses se demandent À L'OUVERTURE du fil, une fois par ouverture (utilisateur, fil, dernier
 * message à l'ouverture) ; l'API n'appelle le modèle que s'il y a de nouveaux messages. Silencieuse.
 */
export function demanderLesPromesses(
  conversationId: number,
  utilisateurId: number,
  dernierMessageId: number,
  { token, locale }: Contexte,
  apres: () => void,
): boolean {
  const cle = `${utilisateurId}:${conversationId}:${dernierMessageId}`;
  if (promessesDemandees.has(cle)) return false;
  promessesDemandees.add(cle);
  apiRequest(cheminApi`/api/conversations/${conversationId}/copilote/promesses`, {
    method: 'POST',
    token: token ?? undefined,
    locale,
  })
    .then(apres, apres)
    .catch(() => undefined);
  return true;
}

/**
 * TCK-2978 — les gestes du composeur, SANS hook (le composeur vit dans `ChatView`, rendu aussi sans client de
 * requêtes) : demander un brouillon, décider une suggestion. L'appelant relit l'état ensuite.
 */
export function demanderUnBrouillon(conversationId: number, ton: 'court' | 'normal', { token, locale }: Contexte): Promise<unknown> {
  return apiRequest(cheminApi`/api/conversations/${conversationId}/copilote/brouillon`, {
    method: 'POST',
    body: { ton },
    token: token ?? undefined,
    locale,
  });
}

export function deciderLaSuggestion(d: DecisionSurLaSuggestion, { token, locale }: Contexte): Promise<unknown> {
  return apiRequest(cheminApi`/api/copilote/suggestions/${d.suggestionId}/decision`, {
    method: 'PUT',
    body: d.decision === 'edited' ? { decision: d.decision, final: d.final } : { decision: d.decision },
    token: token ?? undefined,
    locale,
  });
}
