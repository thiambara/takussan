import Image from 'next/image';

/**
 * Le « G » de Google, aux couleurs du fournisseur — elles ne s'écrivent que dans son ACTIF,
 * `public/marques/google.svg`.
 *
 * TCK-2606 — sorti d'`OAuthButtons`, retiré avec son dernier appelant (la voie e-mail d'avant) : les
 * autres voies (`AutresVoies`) sont désormais le seul départ chez un fournisseur.
 *
 * TCK-2777 — le logo quitte le code pour un fichier `.svg` : monté aussi par la feuille de compte de
 * `/publish`, il entrait dans le périmètre de `scripts/check-super-admin-tokens.mjs`, qui refuse toute
 * couleur en dur dans le code (contrôle E) et lit les `.svg` comme des actifs, pas comme du style
 * (§ T8 de la garde). Une image décorative : le libellé du bouton dit « Google ». `unoptimized` : un
 * SVG n'a rien à gagner à l'optimiseur, et le chargeur de médias ne vise que le seau.
 */
export function GoogleIcon({ className = 'size-5' }: { readonly className?: string } = {}) {
  return <Image src="/marques/google.svg" alt="" aria-hidden="true" width={24} height={24} unoptimized loading="eager" className={className} />;
}
