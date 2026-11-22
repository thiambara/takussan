/**
 * TCK-2857 — « Nouvelle tâche » depuis la fiche d'un client ou d'un bien : la page « Tâches » s'ouvre
 * avec le formulaire, « Rattachée à » prérempli (maquette `app-aujourdhui` e2). L'URL ne porte que le
 * genre et l'id — jamais le nom (une donnée personnelle dans l'historique, et un libellé non vérifié) :
 * la page relit le libellé côté serveur.
 *
 * Module FEUILLE, sans import : les fiches l'importent, et le relevé des espaces i18n suit les imports.
 */
export type GenreDeFiche = 'customer' | 'property';

export interface Pour {
  readonly type: GenreDeFiche;
  readonly id: number;
}

export function lienNouvelleTache(type: GenreDeFiche, id: number): string {
  return `/app/tasks?nouvelle=1&pour=${type}:${id}`;
}

/** `?pour=customer:12` → `{ type: 'customer', id: 12 }` ; toute autre forme → `null`. */
export function lirePour(brut: string | string[] | undefined): Pour | null {
  if (typeof brut !== 'string') return null;
  const m = /^(customer|property):([1-9]\d{0,9})$/.exec(brut);
  return m ? { type: m[1] as GenreDeFiche, id: Number(m[2]) } : null;
}
