import { ApiError, urlApiPublique } from '@/lib/api';

/**
 * TCK-2641 — « Envoyer le relevé » : le PDF du relevé de gérance du mois
 * (`GET /api/owner-statements/pdf?period=…&landlord_id=…`, le même que `OwnerStatementPanel`),
 * partagé comme FICHIER par la feuille de partage du téléphone (WhatsApp, e-mail…) quand le
 * navigateur sait partager un fichier, téléchargé sinon (bureau, navigateur sans `canShare`).
 *
 * Le PDF passe par un `fetch` porteur du jeton : le lien seul ne s'ouvrirait pas chez le bailleur.
 */
export async function lireLeReleve(token: string, period: string, landlordId: number, locale: string): Promise<Blob> {
  const response = await fetch(urlApiPublique(`/owner-statements/pdf?period=${encodeURIComponent(period)}&landlord_id=${landlordId}`), {
    headers: { Accept: 'application/pdf', 'Accept-Language': locale, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  return response.blob();
}

export type Remise = 'partage' | 'telechargement' | 'abandon';

/**
 * Partage `pdf` sous le nom `nom` ; `abandon` quand la personne referme la feuille de partage
 * (`AbortError`), ce qui n'est pas un échec. Toute autre erreur du partage retombe sur le
 * téléchargement : le relevé n'est jamais perdu.
 */
export async function remettreLeReleve(pdf: Blob, nom: string, titre: string): Promise<Remise> {
  const fichier = typeof File === 'function' ? new File([pdf], nom, { type: 'application/pdf' }) : null;
  const partage = typeof navigator !== 'undefined' ? navigator : null;
  if (fichier && partage?.canShare?.({ files: [fichier] }) && typeof partage.share === 'function') {
    try {
      await partage.share({ files: [fichier], title: titre });
      return 'partage';
    } catch (erreur) {
      if (erreur instanceof DOMException && erreur.name === 'AbortError') return 'abandon';
    }
  }
  const url = URL.createObjectURL(pdf);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
  return 'telechargement';
}
