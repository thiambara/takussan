'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';

import { ChoixDeLangue } from '@/components/shared/ChoixDeLangue';
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
  const appName = tCommon('appName');

  // ⚠ Les titres sont résolus AVANT le filtre : `useTranslations` n'est pas appelable dans une
  // branche. Une colonne dont le titre manquerait au dictionnaire rendrait donc sa clé à
  // l'écran — d'où `footer.professionalsHeading`, présent dans les trois langues alors que sa
  // colonne est encore vide (cf. `src/data/navigation.ts`).
  //
  // TCK-580 — chaque colonne porte sa PISTE au bureau (`lg:col-start-*`) : la grille de douze
  // place la signature sur 1-4, laisse 5-6 respirer, et range les trois colonnes sur 7-12.
  const colonnes: readonly {
    cle: string;
    titre: string;
    liens: readonly LienDePiedDePage[];
    piste: string;
  }[] = [
    { cle: 'discover', titre: t('discoverHeading'), liens: footerLinks.discover, piste: 'lg:col-start-7' },
    {
      cle: 'professionals',
      titre: t('professionalsHeading'),
      liens: footerLinks.professionnels,
      piste: 'lg:col-start-9',
    },
    { cle: 'tools', titre: t('toolsHeading'), liens: footerLinks.tools, piste: 'lg:col-start-11' },
  ];

  return (
    <footer
      className={`relative overflow-hidden bg-muted text-foreground border-t border-border ${className || ''}`}
    >
      <div className="max-w-[1440px] mx-auto px-5 md:px-16 pt-12 md:pt-16">
        {/*
          TCK-580 — UNE grille, trois gabarits.

          · Mobile (2 pistes) : la signature sur toute la largeur, puis Découvrir | Professionnels,
            puis Vos outils | Langue. La langue COMBLE la case que « Vos outils » laissait vide
            (mesuré avant : un trou de 171 px sur une rangée de 358).
          · `md` (3 pistes) : les trois colonnes côte à côte, la langue sur sa propre rangée.
          · Bureau (12 pistes) : la signature et la langue empilées sur 1-4, les colonnes sur 7-12.

          ⚠ Le choix de langue n'existe qu'UNE fois dans l'arbre et ne passe jamais par `hidden` :
          c'est sa POSITION qui change, par la grille. Deux exemplaires masqués tour à tour
          feraient six boutons, et `Footer.test.tsx` en exige trois, visibles.
        */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 md:gap-y-10 md:gap-x-10 lg:grid-cols-12 lg:gap-x-8 lg:gap-y-8">
          <div className="col-span-2 md:col-span-3 lg:col-span-4 lg:row-start-1">
            <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.03em] md:text-[32px]">
              {appName}
            </p>
            <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {t('tagline')}
            </p>
            {/*
              L'action du pied de page : déposer un bien. Même encre inversée que « Publier » dans
              la barre du haut (`bg-foreground text-background`) — un seul geste de publication,
              une seule apparence. `/publish` résout lui-même la suite (connexion, assistant).
            */}
            {footerLinks.action.map((lien) => (
              <LienLocalise
                key={lien.labelKey}
                href={lien.href}
                className="group mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground pl-5 pr-4 text-sm font-semibold text-background shadow-sm outline-none transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-0"
              >
                {t(lien.labelKey)}
                <ArrowRight
                  aria-hidden
                  className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                />
              </LienLocalise>
            ))}
          </div>

          {colonnes
            .filter((colonne) => colonne.liens.length > 0)
            .map((colonne) => (
              <nav
                key={colonne.cle}
                aria-labelledby={`pied-${colonne.cle}`}
                className={`lg:col-span-2 lg:row-span-2 lg:row-start-1 ${colonne.piste}`}
              >
                <h4 id={`pied-${colonne.cle}`} className="text-sm font-semibold text-foreground">
                  {colonne.titre}
                </h4>
                <ul className="mt-2 lg:mt-4 lg:space-y-1">
                  {colonne.liens.map((lien) => (
                    <li key={lien.labelKey}>
                      <LienLocalise
                        href={lien.href}
                        className="inline-flex min-h-11 items-center text-[15px] text-muted-foreground underline-offset-4 decoration-1 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
                      >
                        {t(`${colonne.cle}.${lien.labelKey}`)}
                      </LienLocalise>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

          {/*
            TCK-550 — le même choix que le menu mobile, pour qui ne passe jamais par le menu. Des
            BOUTONS et non des liens : ce sont les seuls non-liens du pied de page, et
            `Footer.test.tsx` (AC1) les tolère nommément, en exigeant qu'ils agissent.
          */}
          <ChoixDeLangue className="self-start md:col-span-3 lg:col-span-4 lg:col-start-1 lg:row-start-2 lg:self-end" />
        </div>

        {/*
          TCK-531 — les trois documents juridiques dans la barre du bas : c'est là qu'on les
          cherche. TCK-580 — alignés à GAUCHE sous `md` : centrés, ils se repliaient en trois
          lignes d'inégale longueur, et l'œil n'avait plus de bord où s'appuyer.
        */}
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 md:mt-16 md:flex-row md:items-center md:justify-between md:gap-6">
          <nav aria-labelledby="pied-legal" className="md:order-2">
            <h4 id="pied-legal" className="sr-only">{t('legalHeading')}</h4>
            <ul className="flex flex-wrap gap-x-5 md:justify-end md:gap-x-6">
              {footerLinks.legal.map((lien) => (
                <li key={lien.labelKey}>
                  <LienLocalise
                    href={lien.href}
                    className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
                  >
                    {t(`legal.${lien.labelKey}`)}
                  </LienLocalise>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-sm text-muted-foreground tabular-nums md:order-1">{t('copyright', { year })}</p>
        </div>
      </div>

      {/*
        TCK-580 — la signature du bas : le nom, à la largeur du pied de page, coupé par son bord.

        Un SVG et non un texte stylé, pour deux raisons mesurables : `textLength` cale le mot sur
        la largeur EXACTE du conteneur quelle que soit la fonte chargée (un `font-size` en `vw`
        débordait ou flottait selon le repli), et la teinte passe par `fill`, qu'aucune garde de
        contraste ne mesure — ce qui est juste : c'est une surface, pas un texte à lire.
        `aria-hidden` : le nom est déjà dit plus haut, une seconde lecture serait du bruit.
      */}
      <div aria-hidden className="pointer-events-none mx-auto mt-6 max-w-[1440px] select-none px-3 md:mt-8 md:px-12">
        <svg viewBox="0 0 1000 150" className="block h-auto w-full" preserveAspectRatio="xMidYMin meet">
          <text
            x="500"
            y="188"
            textAnchor="middle"
            textLength="992"
            lengthAdjust="spacing"
            className="fill-primary/[0.1] font-display font-semibold"
            style={{ fontSize: 244 }}
          >
            {appName}
          </text>
        </svg>
      </div>
    </footer>
  );
}
