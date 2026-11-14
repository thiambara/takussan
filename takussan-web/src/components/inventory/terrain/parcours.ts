/**
 * TCK-2647 — les règles du parcours de terrain de l'état des lieux, sans écran (maquette
 * `app-etats-des-lieux`, approche A « Une pièce par écran »).
 *
 *  · le TYPE se déduit du bail (un bail en cours ouvre une entrée, un préavis ou un bail terminé une
 *    sortie), et `?type=` l'emporte ;
 *  · la REPRISE rouvre la première pièce non terminée (`rooms.*.completed`, posé à « Pièce suivante ») ;
 *  · en SORTIE, un élément est DÉGRADÉ quand son état est pire qu'à l'entrée, et une retenue n'est
 *    proposée que pour « Abîmé » ou « Manquant » — « Usé » est une usure normale (maquette a-3).
 */
import { nomCompletDe } from '@/lib/identite';
import {
  INVENTORY_ELEMENT_STATES,
  type InventoryElement,
  type InventoryElementState,
  type InventoryRoom,
  type InventoryTemplate,
  type InventoryType,
} from '@/types/inventory';

/**
 * Les quatre états d'un élément, nommés une fois : les valeurs de l'API sont des mots français
 * (`usé`, `endommagé`), que l'écran ne doit jamais écrire en dur (le texte affiché vient des messages).
 */
export const [ETAT_BON, ETAT_USE, ETAT_ENDOMMAGE, ETAT_MANQUANT] = INVENTORY_ELEMENT_STATES as readonly [
  InventoryElementState,
  InventoryElementState,
  InventoryElementState,
  InventoryElementState,
];

/** Abîmé ou manquant : l'élément demande « Précisez » et une photo, et peut porter une retenue. */
export function estAbime(etat: InventoryElementState | null | undefined): boolean {
  return etat === ETAT_ENDOMMAGE || etat === ETAT_MANQUANT;
}

/**
 * TCK-596 — le plafond de l'API (`UploadRoomPhotosInventoryRequest` : `max:5120` Ko). Chaque photo est
 * réduite jusque sous lui avant l'envoi : une photo de téléphone plus lourde passe, réduite.
 */
export const INVENTORY_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Le type d'un état des lieux neuf : `?type=` s'il est valide, sinon celui que le bail appelle. */
export function typeDeduit(statutDuBail: string | null | undefined, parametre: string | null | undefined): InventoryType {
  if (parametre === 'move_in' || parametre === 'move_out') return parametre;
  return statutDuBail === 'terminating' || statutDuBail === 'terminated' ? 'move_out' : 'move_in';
}

/**
 * Le nom du locataire d'un bail, ou une chaîne vide : `full_name` quand l'API le sert, sinon prénom et
 * nom par `nomCompletDe` (la composition à la main est refusée par `check-nom-affichable`).
 */
export function nomDuLocataire(
  tenant: { readonly full_name?: string | null; readonly first_name?: string | null; readonly last_name?: string | null } | null | undefined,
): string {
  return tenant?.full_name?.trim() || nomCompletDe(tenant) || '';
}

/** L'index de la pièce où reprendre : la première non terminée, ou la longueur quand tout est fait. */
export function indexDeReprise(rooms: readonly InventoryRoom[]): number {
  const i = rooms.findIndex((r) => r.completed !== true);
  return i === -1 ? rooms.length : i;
}

/** Le nombre d'éléments qualifiés d'une pièce (un état posé). */
export function qualifies(room: InventoryRoom): number {
  return (room.elements ?? []).filter((e) => e.state !== null && e.state !== undefined).length;
}

/** Le rang d'un état, du meilleur au pire : l'ordre de l'énumération. */
const rang = (etat: InventoryElementState): number => INVENTORY_ELEMENT_STATES.indexOf(etat);

type ElementDeSortie = Pick<InventoryElement, 'state' | 'entry_state'> & { readonly label?: string };

/** Sortie : l'état est pire qu'à l'entrée. Sans état d'entrée (élément ajouté), jamais. */
export function degrade(e: ElementDeSortie): boolean {
  if (!e.state || !e.entry_state) return false;
  return rang(e.state) > rang(e.entry_state);
}

/** Sortie : une retenue se propose pour un élément dégradé, abîmé ou manquant — jamais pour l'usure. */
export function retenueProposable(e: ElementDeSortie): boolean {
  return degrade(e) && estAbime(e.state);
}

/** Un montant de l'API (décimal en chaîne, ou nombre) en nombre ; `null` s'il n'y en a pas. */
export function montant(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** La somme des retenues proposées sur toutes les pièces. */
export function totalDesRetenues(rooms: readonly InventoryRoom[]): number {
  let total = 0;
  for (const r of rooms) for (const e of r.elements ?? []) total += montant(e.retention_amount) ?? 0;
  return total;
}

/**
 * Les pièces telles que le `PATCH` les envoie : sans ce que le serveur pose en lecture (états
 * d'entrée, vignette) ; une entrée n'envoie aucune clé de retenue (l'API la refuse hors sortie).
 */
export function piecesPourLeServeur(rooms: readonly InventoryRoom[], type: InventoryType = 'move_out'): InventoryRoom[] {
  return rooms.map((r) => ({
    name: r.name,
    condition: r.condition,
    ...(r.completed !== undefined ? { completed: r.completed } : {}),
    notes: r.notes ?? null,
    elements: (r.elements ?? []).map((e) =>
      type === 'move_out'
        ? { label: e.label, state: e.state, notes: e.notes ?? null, retention_amount: montant(e.retention_amount), retention_reason: e.retention_reason ?? null }
        : { label: e.label, state: e.state, notes: e.notes ?? null },
    ),
  }));
}

/** Les pièces cochées d'un modèle (dans son ordre), puis celles ajoutées, chaque élément sans état. */
export function piecesDuModele(
  modele: InventoryTemplate['rooms'],
  cochees: ReadonlySet<string>,
  ajoutees: readonly string[],
): InventoryRoom[] {
  return [
    ...modele
      .filter((r) => cochees.has(r.key))
      .map((r) => ({
        name: r.name,
        condition: 'good' as const,
        notes: null,
        completed: false,
        elements: r.elements.map((e) => ({ label: e.label, state: null, notes: null })),
      })),
    ...ajoutees.map((name) => ({ name, condition: 'good' as const, notes: null, completed: false, elements: [] })),
  ];
}

/**
 * Porte le curseur dans un champ qui vient d'apparaître (« Autre pièce », « Ajouter un élément »,
 * « Retenue ») : le champ n'existe qu'après le toucher qui le demande, l'y attendre est le geste
 * attendu. Une référence de rappel plutôt que `autoFocus`, que le lint refuse sans distinguer un
 * champ monté à l'ouverture de la page d'un champ ouvert par l'utilisateur.
 */
export function curseurALApparition(champ: HTMLInputElement | null): void {
  champ?.focus();
}
