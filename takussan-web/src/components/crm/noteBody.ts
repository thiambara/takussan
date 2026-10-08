/**
 * TCK-591 — le corps d'une note d'étape ne porte que le motif saisi ; sa nature (`kind`) dit s'il
 * s'agit d'une perte ou d'une conversion, et le préfixe se rend ICI, dans la langue du lecteur.
 * Il était écrit en français dans la base : un agent anglophone lisait « Perte : Budget ».
 */
export type NoteKind = 'loss' | 'conversion' | null | undefined;

type Translate = (key: 'kind.loss' | 'kind.conversion', values: { reason: string }) => string;

export function noteBody(note: { readonly body: string; readonly kind?: NoteKind | string }, t: Translate): string {
  if (note.kind === 'loss') return t('kind.loss', { reason: note.body });
  if (note.kind === 'conversion') return t('kind.conversion', { reason: note.body });
  return note.body;
}
