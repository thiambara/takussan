/**
 * Borne une destination de redirection au même hôte.
 *
 * ⚠ **Un `redirect=` non filtré est une redirection ouverte** : `//evil.tld` est
 * un chemin protocole-relatif que le navigateur résout vers un AUTRE domaine,
 * tout en ressemblant à un chemin interne. C'est le classique de la famille, et
 * il ne se voit pas à la relecture.
 *
 * TCK-493 — le filtre existait, écrit à la main dans le callback OAuth. Il est
 * extrait ici parce qu'un deuxième appelant est arrivé (`/onboarding/intention`,
 * qui reçoit le paramètre de quatre chemins d'inscription), et qu'un contrôle de
 * sécurité recopié est un contrôle qui ne sera corrigé qu'à un seul endroit.
 */
export const DESTINATION_PAR_DEFAUT = '/app';

export function destinationInterne(
  brute: string | null | undefined,
  defaut: string = DESTINATION_PAR_DEFAUT,
): string {
  if (typeof brute !== 'string') return defaut;
  // `//` d'abord : c'est le cas qui commence par `/` tout en sortant du site.
  if (brute.startsWith('//')) return defaut;
  if (!brute.startsWith('/')) return defaut;
  // `/\evil.tld` : certains navigateurs normalisent l'antislash en barre oblique,
  // ce qui rend `/\evil.tld` équivalent à `//evil.tld`.
  if (brute.startsWith('/\\')) return defaut;
  return brute;
}

/**
 * Faut-il poser la question d'orientation à ce compte ? (TCK-493)
 *
 * ⚠ **Toute la décision vit ici, et nulle part ailleurs.** Les quatre chemins
 * d'inscription redirigent INCONDITIONNELLEMENT vers `/onboarding/intention` ;
 * c'est cette fonction, appelée une fois par la page, qui renvoie plus loin
 * quand il n'y a rien à demander. Faire deviner « le compte est-il neuf ? » à
 * chaque appelant aurait produit quatre juges — le motif que ce dépôt paie
 * depuis TCK-329.
 */
export function doitPoserLaQuestionDIntention(
  intentionDeja: string | null | undefined,
  profils: ReadonlyArray<{ agency_id: number | null }>,
): boolean {
  // Une réponse déjà donnée — `skipped` COMPRIS. Sans ça, « passer »
  // deviendrait « repousser à la prochaine connexion », ce qui n'est pas passer.
  if (typeof intentionDeja === 'string' && intentionDeja !== '') return false;

  // Un compte qui porte déjà un profil rattaché à une agence a manifestement
  // dépassé le stade de la question.
  //
  // ⚠ Le relevé se prend sur les PROFILS, jamais sur `user.agency_id` :
  // l'accesseur rend `null` pour un compte multi-profils depuis que la colonne a
  // été droppée (TCK-142), et le garde laisserait donc passer précisément les
  // comptes les plus établis.
  if (profils.some((p) => typeof p.agency_id === 'number')) return false;

  return true;
}
