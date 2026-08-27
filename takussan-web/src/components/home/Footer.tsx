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
    <footer className={`bg-slate-900 text-white ${className || ''}`}>
      <div className="max-w-[1440px] mx-auto px-8 md:px-16 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          <div className="lg:col-span-1">
            <h3 className="text-2xl font-bold tracking-tighter mb-4">{tCommon('appName')}</h3>
            <p className="text-slate-400 max-w-sm">{t('tagline')}</p>
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
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        {t(`${colonne.cle}.${lien.labelKey}`)}
                      </LienLocalise>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
        </div>

        <div className="border-t border-slate-800 pt-8 flex justify-center">
          <p className="text-slate-500 text-sm">{t('copyright', { year })}</p>
        </div>
      </div>
    </footer>
  );
}
