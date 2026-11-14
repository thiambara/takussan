import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { accueilNommeAujourdhui } from '@/lib/navigation/accueil-nomme';
import { profilLieDeLaCoque, typeDuProfilActif } from '@/lib/navigation/personas';
import { getActiveProfileId } from '@/lib/session';
import { CorpsDeLIntrouvable } from './CorpsDeLIntrouvable';

/**
 * L'introuvable DU TABLEAU DE BORD — et le mot « du » porte tout le fichier.
 *
 * Avant lui, `notFound()` n'était appelé qu'à un seul endroit de `/app`
 * (`properties/[id]`), et il n'existait aucun `not-found.tsx` dans l'arbre : Next rendait donc
 * sa page 404 par défaut, **hors du shell** — sans barre latérale, sans traduction, sans chemin
 * de retour. Un utilisateur connecté était éjecté de son produit par une faute de frappe dans
 * une URL.
 *
 * ## Pourquoi ce fichier est ICI et non sous `(dashboard)`
 *
 * Mesuré le 2026-08-27 sur Next 16.3.1 (sonde jetable, `next dev`, deux couches de layouts) :
 * un `not-found.tsx` posé sur un segment est rendu **à l'intérieur du `layout.tsx` de ce
 * segment**, et des layouts plus profonds aussi. Posé sur `(dashboard)`, il aurait été rendu par
 * `(dashboard)/layout.tsx` — la chrome nue — mais rien ne garantissait `app/layout.tsx`, qui est
 * celui qui monte `AppShell` et donc la barre latérale. Posé ici, `AppShell` est un ancêtre
 * certain. Il ne couvre par construction que `/app` — section d'agence `/app/agency` comprise
 * depuis TCK-649 ; `/super-admin` est un frère, hors du périmètre de TCK-382.
 *
 * ## Il ne dit pas ce qu'il ne sait pas
 *
 * L'API rend 404 pour un objet ABSENT comme pour un objet HORS PÉRIMÈTRE D'AGENCE — l'isolation
 * par agence est faite pour ne pas révéler l'existence de ce qu'on n'a pas le droit de voir. Le
 * message couvre donc les deux sans trancher. C'est la leçon que `(dashboard)/error.tsx` porte
 * dans son propre docblock : *une frontière large qui affirme une cause étroite se trompe partout
 * sauf à un endroit.*
 *
 * ⚠ Et il ne dit surtout pas « erreur ». Un refus d'accès (TCK-378) redirige, une panne rend
 * `error.tsx` **avec un bouton « réessayer »**, et l'introuvable n'en propose aucun : réessayer
 * ne fait pas exister ce qui n'existe pas. Trois écrans, trois causes, aucun bouton en commun.
 *
 * ## Le chemin de retour est DÉRIVÉ, pas décoratif
 *
 * `usePathname()` donne l'URL demandée ; la première section après `/app/` désigne la liste dont
 * l'objet manquant relève (`@/lib/navigation/app-sections`). Cette table est gardée par
 * `__tests__/introuvable.test.tsx`, qui échoue si un segment dynamique apparaît sous `/app` sans
 * y figurer, ou si une destination citée n'a pas de `page.tsx` sur le disque.
 *
 * ## TCK-2619 — une adresse fausse propose d'aller ailleurs
 *
 * H1 « Page introuvable », la phrase qui ne tranche pas (ci-dessus), puis « Aller à… » OUVERT dans la page
 * (le champ et l'index de la palette), les récents et quatre entrées du menu, et deux retours :
 * « Retour à la liste » quand l'URL en a une, « Retour à l'accueil » (« Retour à Aujourd'hui » chez
 * l'agent : `accueilNommeAujourdhui`, sur les entrées mêmes du layout — `getMeAction` est mis en cache
 * pour la requête, aucune lecture de plus). Au téléphone, l'en-tête de la coque porte le H1 (la page le déclare, forme
 * `racine`) et celui du contenu est masqué par la règle « un seul H1 » (`globals.css`, TCK-2617) ; le
 * disque de l'icône ne paraît qu'au téléphone (maquette `app-coque`, « Page introuvable »).
 *
 * ⚠ **Aucun de ces composants n'est dans le HTML de la réponse 404, et rien dans ce fichier n'y peut
 * rien** — mesuré le 2026-11-14 sur `next build` + `next start` (TCK-2740). Une sonde HORS de `/app`
 * (un `not-found.tsx` serveur, une page qui appelle `notFound()`) rend la même chose que `/app/zzz` :
 * **404**, document d'erreur de Next (`<html id="__next_error__">`, 58 octets de corps hors scripts),
 * le texte n'étant que dans la charge RSC. La même sonde sous un `<Suspense>` rend **200**, son repli
 * dans le corps, et toujours pas le texte. Témoin : `/app` (200) a 65 Ko de corps. La frontière
 * `not-found` est une frontière d'erreur CLIENT, que le rendu serveur de React n'exécute pas : Next
 * 16.3.1 ne rend jamais au serveur un introuvable atteint par `notFound()`, et l'écran (coque
 * comprise) n'arrive qu'à l'hydratation. Ce n'est ni TCK-426 ni propre à `/app`. Le relevé du
 * 2026-08-27 qui disait le contraire est démenti ; il a vraisemblablement lu la réponse entière, où la
 * charge RSC porte tous les textes. La structure serveur est gardée : elle ne coûte rien, et le
 * cliquet de `introuvable.test.tsx` ne la garde plus pour le HTML.
 *
 * ## Le titre (TCK-2740 AC4)
 *
 * Le seul morceau du `<head>` que le serveur rend pour une 404 : Next résout les métadonnées du
 * document d'erreur avec `errorConvention: 'not-found'`, donc celles du `not-found.tsx` le plus
 * profond — celui-ci. Sans `generateMetadata` ici, l'onglet disait « Tableau de bord » (défaut de
 * `(dashboard)/layout.tsx`). Après l'hydratation, Next réécrit l'onglet avec le titre de la PAGE
 * demandée : l'attrape-tout `[...introuvable]` porte donc le même, une fiche absente garde le sien.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.notFound');
  return { title: t('heading') };
}

export default async function AppNotFound() {
  const user = await getMeAction();
  const typeProfilActif = typeDuProfilActif(profilLieDeLaCoque(await getActiveProfileId(), user));
  return <CorpsDeLIntrouvable aujourdhui={accueilNommeAujourdhui({ roles: user.roles, typeProfilActif })} />;
}
