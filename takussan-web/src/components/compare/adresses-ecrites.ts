/**
 * TCK-2509 — les adresses `?ids=` que le comparateur a écrites dans CET onglet (`sessionStorage`).
 *
 * C'est ce qui distingue sa propre page d'historique d'un lien partagé. Retrouvée par Retour, une
 * page à soi ne connaît pas le bien ajouté entre-temps : la sélection locale doit l'emporter. Un
 * lien partagé, lui, fait foi.
 *
 * L'ENSEMBLE des adresses, et pas la dernière seule (contre-vérification, 2026-11-09) : arrivé par
 * la pastille, puis « Ajouter un bien » → ajout → pastille → Retour → Retour, la page la plus
 * ancienne n'était plus « la dernière écrite », passait pour un lien partagé et effaçait le bien
 * ajouté. Borné aux {@link ADRESSES_RETENUES} dernières : l'historique d'un onglet est fini, le
 * stockage aussi.
 *
 * Stockage indisponible (navigation privée stricte) : rien n'est retenu, et toute adresse est un
 * lien partagé — le comportement d'avant la revue, jamais pire.
 */
export const CLE_ADRESSES_ECRITES = 'takussan.compare.ids-ecrits';
export const ADRESSES_RETENUES = 20;

export function adressesEcrites(): string[] {
  try {
    const brut = window.sessionStorage.getItem(CLE_ADRESSES_ECRITES);
    const lu: unknown = brut ? JSON.parse(brut) : [];
    return Array.isArray(lu) ? lu.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function estAdresseEcrite(csv: string): boolean {
  return csv !== '' && adressesEcrites().includes(csv);
}

/** Retient `csv` comme la plus récente ; une adresse déjà retenue remonte en tête. */
export function retenirAdresse(csv: string): void {
  if (csv === '') return;
  const suivantes = [...adressesEcrites().filter((v) => v !== csv), csv].slice(-ADRESSES_RETENUES);
  try {
    window.sessionStorage.setItem(CLE_ADRESSES_ECRITES, JSON.stringify(suivantes));
  } catch {
    /* stockage indisponible : l'adresse restera un lien partagé au retour */
  }
}
