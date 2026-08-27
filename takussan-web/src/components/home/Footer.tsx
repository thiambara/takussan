'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { footerLinks, type LienDePiedDePage } from '@/data/navigation';

export interface FooterProps {
  readonly className?: string;
}

/**
 * Le pied de page public — TCK-437.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE FORMULAIRE DE NEWSLETTER A ÉTÉ RETIRÉ, ET C'EST UNE DÉCISION MESURÉE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il était **inerte** : un `<Input>` contrôlé, un `<Button>` sans `onClick`, aucun `<form>`, et
 * l'état `email` lu nulle part. Un visiteur qui saisissait son adresse et cliquait n'obtenait
 * rien — ni envoi, ni erreur, ni confirmation.
 *
 * Le ticket ne laissait que deux issues : un endpoint réel, ou le retrait. La mesure a tranché —
 * relevé du 2026-08-27 sur `takussan-api/` :
 *
 *     grep -riE 'newsletter|subscribe|abonnement|mailing' routes/ app/Http/Controllers/
 *       → 0 endpoint d'inscription. La seule chose qui ressemble est
 *         `GET notifications/unsubscribe/{user}` (web.php, TCK-103) : un DÉSABONNEMENT en un clic
 *         par URL signée, pour un utilisateur qui a déjà un compte. Son pendant — l'abonnement —
 *         vit dans les préférences de notification du compte. Il n'existe aucune entrée anonyme.
 *
 * En créer une n'est pas un delta de pied de page : le régime de notification de la spec exige un
 * consentement explicite, donc une table, une trace de consentement et une confirmation par
 * courriel. C'est un ticket `full`, pas une ligne de JSX — et TCK-437 exclut d'inventer
 * l'endpoint. Les libellés `footer.newsletter*` partent avec le formulaire, dans les trois
 * langues : un libellé orphelin fait croire à la prochaine personne que la surface a existé.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI REMPLACE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Des colonnes de liens qui aident réellement à circuler, déclarées dans `src/data/navigation.ts`
 * et rendues ici. **Une colonne sans entrée n'est pas rendue** : c'est ce qui permet à la colonne
 * « Professionnels » d'exister en attendant que TCK-436 livre `/agencies` et `/agents`, sans poser
 * un seul lien mort dans l'intervalle.
 *
 * Tout lien interne passe par `LienLocalise` (ADR-0026) : les `<a href>` d'avant rechargeaient le
 * document à chaque clic, redemandaient le bundle et perdaient l'état client — favoris,
 * comparateur, position de défilement. C'est précisément l'état que les deux liens de la colonne
 * « Vos outils » servent à retrouver : les perdre en y allant aurait été le comble.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE FOND SOMBRE EST ABANDONNÉ — l'arbitrage exigé par TCK-440
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le fond du pied de page était une ardoise 900 de Tailwind, son encre du blanc pur — écrit ici
 * en toutes lettres et non en classes, parce que ce fichier est lu par
 * `scripts/check-public-chrome-tokens.mjs` et qu'un docblock qui montre une classe brute est
 * exactement la documentation périmée qui fait repousser le motif. Ce couple n'avait **aucun**
 * équivalent dans la palette Lin : elle n'a pas de fond sombre. TCK-440 laissait deux issues — ajouter une surface sombre à la palette, ou ramener
 * le pied de page dans le registre Lin. C'est la seconde, pour une raison qui se vérifie plutôt
 * qu'elle ne se plaide :
 *
 * · **Un fond sombre en clair ne se dit avec AUCUN jeton existant.** `bg-foreground
 *   text-background` rendrait bien un pied de page sombre en thème clair — mais il s'INVERSE en
 *   `.dark` (`--foreground` y vaut #fcf9f3) et poserait une dalle crème au bas d'une page sombre.
 *   Un fond sombre dans les DEUX thèmes exige donc un jeton neuf, qui ne suit aucun thème.
 * · Or ce jeton-là existe déjà : c'est `--scrim`, le jeton de VOILE du produit — opaque, et qui
 *   NE s'inverse PAS sous `.dark`, ce qui est tout son intérêt. Il est livré par un chantier
 *   voisin et se consomme `bg-scrim/<alpha>`, l'appelant posant l'opacité. **En créer un second
 *   ici serait pire que de n'en avoir aucun** : deux vocabulaires pour la même idée, et une
 *   palette qui ne se change plus en un endroit — exactement ce que ce ticket corrige.
 *
 *   ⚠ Un voile et un fond de pied de page ne sont d'ailleurs pas la même chose : `--scrim` sert à
 *   rendre lisible ce qui est POSÉ DESSUS une image ou une page, pas à peindre une section.
 *
 * Le pied de page prend donc `bg-muted` : un cran tonal sous le fond de page, séparé par
 * `border-t border-border`, et qui bascule correctement en `.dark`. C'est le seul point où ce
 * ticket change le rendu en thème clair, et c'est celui que son § Direction UX désignait
 * nommément.
 *
 * Contrastes mesurés (WCAG 2.1, `src/test/contraste-wcag.ts`, éprouvés par
 * `chrome-publique.contraste.test.tsx`) :
 *
 *     clair  — foreground #1f1812 sur muted #f1ece0 ............ 14,87:1   (AA)
 *              muted-foreground #6e655a sur muted #f1ece0 .......  4,85:1   (AA)
 *     sombre — foreground #fcf9f3 sur muted #3a2e23 ............ 12,53:1   (AA)
 *              muted-foreground #b8aa97 sur muted #3a2e23 .......  5,79:1   (AA)
 *
 * ⚠ Le survol des liens va sur `text-foreground` et NON sur `text-primary`, et c'est la mesure
 * qui l'a décidé : `--primary` sur `--muted` rend **4,51:1 en clair mais 3,99:1 en sombre**, sous
 * le seuil AA. Le survol est le seul état où la couleur porte l'information « ce lien est visé » ;
 * le rendre illisible d'un côté du thème aurait été le défaut que ce ticket corrige, réintroduit
 * par la conversion elle-même.
 */
export function Footer({ className }: FooterProps) {
  const t = useTranslations('footer');
  const tCommon = useTranslations('common');
  const year = new Date().getFullYear();

  // ⚠ Les titres sont résolus AVANT le filtre : `useTranslations` n'est pas appelable dans une
  // branche. Une colonne dont le titre manquerait au dictionnaire rendrait donc sa clé à
  // l'écran — d'où `footer.professionalsHeading`, présent dans les trois langues alors que sa
  // colonne est encore vide (cf. `src/data/navigation.ts`).
  const colonnes: readonly { cle: string; titre: string; liens: readonly LienDePiedDePage[] }[] = [
    { cle: 'discover', titre: t('discoverHeading'), liens: footerLinks.discover },
    { cle: 'professionals', titre: t('professionalsHeading'), liens: footerLinks.professionnels },
    { cle: 'tools', titre: t('toolsHeading'), liens: footerLinks.tools },
  ];

  return (
    <footer className={`bg-muted text-foreground border-t border-border ${className || ''}`}>
      <div className="max-w-[1440px] mx-auto px-8 md:px-16 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          <div className="lg:col-span-1">
            <h3 className="text-2xl font-bold tracking-tighter mb-4">{tCommon('appName')}</h3>
            <p className="text-muted-foreground max-w-sm">{t('tagline')}</p>
          </div>

          {colonnes
            .filter((colonne) => colonne.liens.length > 0)
            .map((colonne) => (
              <nav key={colonne.cle} aria-labelledby={`pied-${colonne.cle}`}>
                <h4 id={`pied-${colonne.cle}`} className="font-bold text-lg mb-4">
                  {colonne.titre}
                </h4>
                <ul className="space-y-3">
                  {colonne.liens.map((lien) => (
                    <li key={lien.labelKey}>
                      <LienLocalise
                        href={lien.href}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t(`${colonne.cle}.${lien.labelKey}`)}
                      </LienLocalise>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
        </div>

        <div className="border-t border-border pt-8 flex justify-center">
          <p className="text-muted-foreground text-sm">{t('copyright', { year })}</p>
        </div>
      </div>
    </footer>
  );
}
