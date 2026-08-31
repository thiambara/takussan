/**
 * TCK-500 — le message pré-rempli qu'un visiteur trouve dans le composeur au clic sur
 * « Envoyer un message » depuis la fiche d'un bien.
 *
 * ⚠️ **C'est une VALEUR, jamais une indication.** La fiche affichait déjà
 * `publicContact.messagePlaceholder` (« Bonjour, je suis intéressé(e) par votre bien… ») en
 * `placeholder` : une phrase qu'on lit, qu'on ne peut pas modifier, et qui ne part jamais.
 * Le geste visé est celui de WhatsApp — le champ contient le texte, on envoie d'un coup ou on
 * réécrit tout. La différence se mesure à un seul endroit : le bouton d'envoi est actif avant
 * la moindre frappe.
 *
 * La fonction vit ici, pure et hors de React, pour trois raisons qui se rejoignent : elle est
 * appelée depuis DEUX écrans (la fiche du bien au-dessus du point de rupture `md`, la messagerie
 * pleine page en dessous) et ils doivent produire le même texte ; elle doit rester testable dans
 * les trois locales sans monter de provider ; et elle est ce qui permet de ne **jamais** faire
 * transiter le message par l'URL — c'est le slug qui voyage, le texte se reconstruit à l'arrivée.
 */

/** La signature minimale d'un traducteur next-intl portée sur `messaging.propertyDraft`. */
export type TraducteurBrouillon = (
  cle: 'message',
  valeurs: { title: string; reference: string },
) => string;

export interface BienDuBrouillon {
  readonly title: string;
  readonly reference_number: string;
}

/**
 * Rend le message par défaut pour ce bien.
 *
 * Le titre et la référence sont passés en ARGUMENTS ICU, jamais concaténés dans le motif :
 * c'est ce qui laisse intacts les guillemets et les apostrophes d'un titre comme
 * « L'Oasis "Les Almadies" » — une apostrophe est un caractère d'échappement dans un motif ICU,
 * elle ne l'est pas dans une valeur.
 */
export function construireBrouillonBien(t: TraducteurBrouillon, bien: BienDuBrouillon): string {
  return t('message', { title: bien.title, reference: bien.reference_number });
}
