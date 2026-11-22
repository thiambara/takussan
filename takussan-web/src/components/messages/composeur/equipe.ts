/**
 * TCK-2968 (ADR-0128 § 6) — qui lit quoi dans un fil, vu du composeur : la note d'équipe (TCK-2965) et les
 * @mentions (TCK-2966). Fonctions pures.
 *
 * Les deux jugements viennent de l'API, par `GET /api/conversations/{id}/context` (TCK-2967), et le front n'en
 * dérive aucun : `can_write_team_note` (l'appelant écrit-il des notes ici ?) et `team_note_reader_ids` (qui les
 * lit, y compris un participant SANS ligne de relation — `participants[]` n'en porte pas pour lui). La
 * `relation` ne sert qu'au LIBELLÉ (« Awa Diop (agent) »), jamais à la règle. Tant que le contexte n'est pas lu
 * (chargement, erreur), rien n'est proposé. L'API reste juge (422 `messaging.team_note_*`,
 * `messaging.mention_not_reader`).
 */
import type { Conversation, ConversationContext, ConversationParticipant, RelationAuFil } from '@/types/message';

/** Au plus dix personnes mentionnées par message (`MentionsDuFil::MAX`). */
export const MENTIONS_MAX = 10;

export type Personne = {
  readonly id: number;
  readonly nom: string;
  readonly avatar: string | null;
  readonly relation: RelationAuFil['relation'] | null;
};

function actifs(conversation: Conversation | undefined): ConversationParticipant[] {
  return (conversation?.participants ?? []).filter((p) => !p.left_at && p.user?.full_name);
}

/**
 * Les lecteurs d'un fil pour l'appelant : `personnel` (les AUTRES participants qui lisent les notes),
 * `autres` (ceux qui ne les lisent pas), et `equipeLit` — l'appelant écrit-il des notes ici ? Tout vient du
 * contexte du fil (`can_write_team_note`, `team_note_reader_ids`).
 */
export function lecteursDuFil(
  conversation: Conversation | undefined,
  contexte: ConversationContext | undefined,
  moi: number | undefined,
): { readonly equipeLit: boolean; readonly personnel: Personne[]; readonly autres: Personne[] } {
  const lignes = new Map((contexte?.participants ?? []).map((r) => [r.user_id, r] as const));
  const equipeLit = contexte?.can_write_team_note === true;
  const lecteursDesNotes = new Set(contexte?.team_note_reader_ids ?? []);
  const personnes = actifs(conversation)
    .filter((p) => p.user_id !== moi)
    .map((p) => {
      const ligne = lignes.get(p.user_id);
      return {
        personne: { id: p.user_id, nom: p.user!.full_name, avatar: p.user!.avatar_url ?? null, relation: ligne?.relation ?? null } satisfies Personne,
        litLesNotes: lecteursDesNotes.has(p.user_id),
      };
    });
  return {
    equipeLit,
    personnel: personnes.filter((p) => p.litLesNotes).map((p) => p.personne),
    autres: personnes.filter((p) => !p.litLesNotes).map((p) => p.personne),
  };
}

/**
 * Les personnes qu'on peut mentionner : celles qui LIRONT ce message. Une note d'équipe : le seul personnel
 * (règle de l'API, `MentionsDuFil::lecteursParmi`) ; un message au fil : tout participant actif. Soi exclu.
 */
export function mentionnables(
  lecteurs: { readonly personnel: Personne[]; readonly autres: Personne[] },
  note: boolean,
): Personne[] {
  return note ? lecteurs.personnel : [...lecteurs.personnel, ...lecteurs.autres].sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Minuscules et sans accents : « Aïda » se trouve en tapant « aid ». */
export function replier(texte: string): string {
  return texte.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * La saisie d'une mention en cours : le fragment tapé après le dernier `@` qui précède le curseur, s'il
 * commence un mot (début du texte ou après une espace) et ne passe pas la ligne. `null` sinon.
 */
export function mentionEnCours(texte: string, curseur: number): { readonly debut: number; readonly fragment: string } | null {
  const avant = texte.slice(0, curseur);
  const debut = avant.lastIndexOf('@');
  if (debut < 0) return null;
  if (debut > 0 && !/\s/.test(avant[debut - 1]!)) return null;
  const fragment = avant.slice(debut + 1);
  if (fragment.length > 40 || /[\n@]/.test(fragment) || /\s{2}/.test(fragment)) return null;
  return { debut, fragment };
}

/** Les personnes dont le nom, ou un de ses mots, commence par le fragment. */
export function filtrerLesMentionnables(personnes: readonly Personne[], fragment: string): Personne[] {
  const f = replier(fragment.trim());
  if (f === '') return [...personnes];
  return personnes.filter((p) => {
    const nom = replier(p.nom);
    return nom.startsWith(f) || nom.split(/\s+/).some((mot) => mot.startsWith(f));
  });
}

/** Remplace `@fragment` (de `debut` au curseur) par `@Prénom Nom ` ; rend le texte et la position du curseur. */
export function insererLaMention(texte: string, debut: number, curseur: number, nom: string): { readonly texte: string; readonly curseur: number } {
  const insere = `@${nom} `;
  return { texte: texte.slice(0, debut) + insere + texte.slice(curseur), curseur: debut + insere.length };
}

/**
 * Les identifiants à envoyer : les personnes choisies dont `@Nom` est ENCORE dans le texte (une mention
 * effacée ne part pas), sans doublon, dix au plus.
 */
export function mentionsDuTexte(texte: string, choisies: readonly Pick<Personne, 'id' | 'nom'>[]): number[] {
  const ids: number[] = [];
  for (const p of choisies) {
    if (texte.includes(`@${p.nom}`) && !ids.includes(p.id)) ids.push(p.id);
  }
  return ids.slice(0, MENTIONS_MAX);
}

/**
 * Le texte d'un message découpé autour de ses mentions (`@Nom` des noms donnés) : l'écran les met en
 * valeur, toujours par le NOM — un identifiant n'est jamais affiché.
 */
export function decouperLesMentions(texte: string, noms: readonly string[]): { readonly texte: string; readonly mention: boolean }[] {
  const cibles = [...new Set(noms.filter(Boolean))].sort((a, b) => b.length - a.length).map((n) => `@${n}`);
  if (cibles.length === 0) return [{ texte, mention: false }];
  const morceaux: { texte: string; mention: boolean }[] = [];
  let i = 0;
  let courant = '';
  while (i < texte.length) {
    const cible = texte[i] === '@' ? cibles.find((c) => texte.startsWith(c, i)) : undefined;
    if (cible) {
      if (courant) morceaux.push({ texte: courant, mention: false });
      morceaux.push({ texte: cible, mention: true });
      courant = '';
      i += cible.length;
    } else {
      courant += texte[i];
      i += 1;
    }
  }
  if (courant) morceaux.push({ texte: courant, mention: false });
  return morceaux;
}
