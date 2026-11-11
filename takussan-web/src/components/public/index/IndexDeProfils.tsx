import { AlertTriangle, SearchX, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { EmptyState } from '@/components/feedback';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { enTeteAuTelephone } from '@/lib/navigation/barre-publique';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/config';
import {
  RESSOURCES_DE_PROFIL,
  compterProfils,
  listerProfilsPublics,
  type PageDeProfils,
  type RessourceDeProfil,
} from '@/lib/queries/public-profiles';

import { CarteMiseEnAvant } from './CarteMiseEnAvant';
import { OngletsDeLAnnuaire } from './OngletsDeLAnnuaire';
import { ProfileCard } from './ProfileCard';
import { ProfileFilters } from './ProfileFilters';
import { ProfilePagination } from './ProfilePagination';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

type Props = {
  readonly ressource: RessourceDeProfil;
  readonly locale: Locale;
  readonly params: URLSearchParams;
  readonly page: number;
  readonly forme: 'rond' | 'carre';
};

/**
 * L'annuaire « Professionnels » — `/agencies` et `/agents` en sont les deux ONGLETS (TCK-2521,
 * maquette `p=annuaire&a=d`) ; le corps partagé date de TCK-436.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX URL, UN ANNUAIRE — ET C'EST L'URL QUI CHOISIT L'ONGLET
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les onglets sont des LIENS vers l'autre URL, pas un état client : chaque onglet reste une page
 * rendue côté serveur, indexée, avec sa canonique, son titre et sa place au sitemap. La ville
 * passe d'un onglet à l'autre ; la recherche par nom non (elle visait des noms de l'autre onglet).
 * Le compte d'un onglet est celui de la ville, recherche ignorée (`compterProfils`).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA VITRINE EN TÊTE NE CHANGE PAS LA LISTE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Au plus une carte « Mise en avant » (`spotlight` de TCK-2520), et seulement sur l'onglet Agences.
 * L'agence y figure AUSSI à son rang (décision 1a) : rien n'est retiré de `profils`. Sans place
 * offerte, la liste commence directement — et le premier résultat arrive sous 300 px à 390 × 844.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * RENDU CÔTÉ SERVEUR, ET C'EST UNE DÉCISION
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `/properties` est rendue côté client (`useSearchParams`), ce qui fait qu'un explorateur reçoit
 * la même coque HTML sur toutes ses pages — le défaut que TCK-432 est ouvert pour corriger. Ces
 * deux index-ci n'ont aucune raison de répéter ce choix : leur contenu ne dépend que de l'URL,
 * ils n'ont ni carte ni rail de filtres, et leur raison d'être est d'être INDEXÉS. Seul le petit
 * formulaire de filtre est client, parce qu'il écrit dans l'URL.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * L'ÉTAT VIDE ET L'ÉTAT D'ERREUR SONT EXCLUSIFS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * C'est la leçon de TCK-335 sur `/properties`, où les deux s'affichaient ENSEMBLE. Ici la
 * distinction est portée par le type : `listerProfilsPublics` **lève** quand l'API est en panne,
 * et le `catch` ci-dessous rend `null`. Trois branches, mutuellement exclusives par construction :
 *
 *   null           → l'API n'a pas répondu ...... bandeau d'erreur, aucun « aucun résultat »
 *   0 profil       → le filtre ne rend rien ..... état vide, aucun bandeau d'erreur
 *   n > 0 profils  → la grille
 *
 * Un tableau vide rendu en cas de panne aurait affiché « aucune agence ne correspond » sur un
 * catalogue intact. *Une liste vide et une liste absente ne se disent pas de la même façon.*
 *
 * ⚠ Le filtre et la pagination restent rendus dans l'état VIDE — sans quoi le visiteur qui a
 * filtré trop finement n'a plus aucun moyen de revenir en arrière. Ils disparaissent en revanche
 * dans l'état d'ERREUR : filtrer un catalogue injoignable ne mène nulle part.
 */
export async function IndexDeProfils({ ressource, locale, params, page, forme }: Props) {
  const t = await getTranslations(`publicProfileIndex.${ressource}`);
  const tCommun = await getTranslations('publicProfileIndex');
  // TCK-2568 — la barre du site est-elle ôtée de cette route au téléphone ? (`barre-publique.ts`)
  const sansBarreAuTelephone = enTeteAuTelephone(`/${locale}/${ressource}`) === 'en-tete-de-page';

  const ville = params.get('city')?.trim() || undefined;
  const recherche = params.get('q')?.trim() || undefined;
  const autre: RessourceDeProfil = ressource === 'agencies' ? 'agents' : 'agencies';

  const chargerLaListe = async (): Promise<PageDeProfils | null> => {
    try {
      return await listerProfilsPublics(ressource, { page, ville, recherche }, locale);
    } catch (err) {
      // Nommer la ressource : « la page est vide » n'apprend rien, « l'index `agents` a échoué »
      // dit où chercher. Même patron que les sources de `src/app/sitemap.ts`.
      console.error(`[index-profils] « ${ressource} » indisponible.`, err);
      return null;
    }
  };

  // Les trois requêtes partent ensemble : les comptes des onglets ne retardent pas la liste. Sans
  // recherche par nom, le compte de l'onglet actif EST le total de la liste — pas de requête de plus.
  const [resultat, compteAutre, compteActifSeul] = await Promise.all([
    chargerLaListe(),
    compterProfils(autre, ville, locale),
    recherche ? compterProfils(ressource, ville, locale) : Promise.resolve(undefined),
  ]);
  const compteActif = compteActifSeul !== undefined ? compteActifSeul : (resultat?.total ?? null);
  const comptes: Record<RessourceDeProfil, number | null> = {
    [ressource]: compteActif,
    [autre]: compteAutre,
  } as Record<RessourceDeProfil, number | null>;

  const base = RESSOURCES_DE_PROFIL[ressource].chemin;
  const hrefOnglet = (cible: RessourceDeProfil) => {
    const chemin = RESSOURCES_DE_PROFIL[cible].chemin;
    return ville ? `${chemin}?${new URLSearchParams({ city: ville }).toString()}` : chemin;
  };

  // `?? null` : un double de test ou une réponse ancienne sans `vitrine` se lit « pas de vitrine ».
  // La vitrine n'est qu'en TÊTE DE LA LISTE PARCOURUE (maquette D) : page 1, sans recherche par nom,
  // et jamais au-dessus de l'état vide. L'API la calcule sur la seule ville (TCK-2520) et la sert à
  // toute page et toute recherche ; elle ne compte aucune impression, le tri se fait donc ici. Revue
  // du 2026-11-09 : sur `?q=zzz`, la carte payante surmontait « Aucune agence ne correspond » ; sur
  // `?q=Dakar Immo`, une AUTRE agence passait devant le résultat cherché ; et elle revenait à chaque page.
  const vitrine =
    ressource === 'agencies' &&
    resultat !== null &&
    page <= 1 &&
    resultat.page <= 1 &&
    !recherche &&
    resultat.profils.length > 0
      ? (resultat.vitrine ?? null)
      : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <NavbarSpacer />

      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="group/index mx-auto max-w-[1280px] px-4 pb-24 sm:px-6 lg:px-8 lg:pt-10 focus:outline-none">
        {/* TCK-2521 — le haut de l'écran au téléphone est celui de la maquette (`EnTeteAnnuaire`) :
            quand `barre-publique.ts` ôte la barre du site de ces routes sous `lg` (TCK-2568), un titre
            à `pt-5`, et titre, onglets, champ et villes COLLÉS en haut pendant qu'on fait défiler la
            liste. En bureau, la `Navbar` revient et l'en-tête ne colle plus.
            Plus de sur-titre en capitales ni d'intro au téléphone : le titre se suffit, et chaque
            ligne gagnée rapproche le premier résultat (716 px avant, sous 300 px après). */}
        {/* Juste dans les DEUX états de la règle : la page lit le même prédicat que la `Navbar` et sa
            cale, sur son propre chemin. Sans la barre, l'en-tête colle au bord (`top-0`) ; avec elle
            (fixe, 69 px sous `lg`), il colle juste dessous — à `top-0`, il passerait sous la barre. */}
        <div
          data-barre-du-site={sansBarreAuTelephone ? undefined : ''}
          className={cn(
            'sticky z-10 -mx-4 bg-background px-4 pb-1 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:px-0 lg:pb-0 lg:pt-0',
            // Sous la barre, sa bordure basse sépare déjà : 12 px suffisent, et le premier résultat
            // reste sous 300 px (AC1 : 302 à `pt-5`, mesuré le 2026-11-09).
            sansBarreAuTelephone ? 'top-0 pt-5' : 'top-[69px] pt-3',
          )}
        >
          <header className="flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
            <div>
              <h1 className="font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-foreground lg:text-[2.75rem]">
                {tCommun('heading')}
              </h1>
              <p className="mt-3 hidden max-w-[60ch] text-[1.0625rem] text-muted-foreground text-pretty lg:block">
                {tCommun('intro')}
              </p>
            </div>

            <OngletsDeLAnnuaire
              aria={tCommun('tabs.aria')}
              onglets={(['agencies', 'agents'] as const).map((cible) => ({
                cible,
                href: hrefOnglet(cible),
                libelle: tCommun(`tabs.${cible}`),
                compte: comptes[cible],
                actif: cible === ressource,
              }))}
            />
          </header>

          {resultat !== null && (
            <div className="mt-2 lg:mt-8">
              <ProfileFilters
                base={base}
                villes={resultat.villes}
                placeholderRecherche={t('searchPlaceholder')}
              />
            </div>
          )}
        </div>

        {resultat === null ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-border bg-card p-10 text-center lg:mt-8"
          >
            <AlertTriangle className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-display text-xl text-foreground">{tCommun('error.title')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{tCommun('error.body')}</p>
          </div>
        ) : (
          <>
            {/* Estompés pendant qu'une navigation de `ProfileFilters` est en cours : ce qu'on voit
                n'est plus le résultat du critère affiché. */}
            <div className="transition-opacity duration-200 group-has-[[data-en-cours]]/index:opacity-50">
              {vitrine !== null && (
                <div className="mt-4 lg:mt-8">
                  <CarteMiseEnAvant agence={vitrine} base={base} />
                </div>
              )}

              <div
                className={
                  'mt-2 lg:mt-8 lg:grid lg:gap-8 ' +
                  (ressource === 'agencies' ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : '')
                }
              >
                <div className="space-y-6">
                  {resultat.profils.length === 0 ? (
                    // L'état vide du produit, et pas un bloc local (design-guidelines § États vides).
                    // Les filtres restent au-dessus : un visiteur qui a trop filtré garde son retour.
                    <EmptyState
                      icon={<SearchX className="size-8" aria-hidden />}
                      title={t('emptyTitle')}
                      description={tCommun('empty.body')}
                    />
                  ) : (
                    <section aria-labelledby="annuaire-compte">
                      {/* TCK-946 — le compte est le titre de la liste : sans `h2`, le `<h1>` menait
                          droit au `<h3>` de la première ligne (axe, `heading-order`). */}
                      <div className="text-[0.8125rem] text-muted-foreground lg:text-sm">
                        <h2 id="annuaire-compte" className="inline font-normal">
                          {t('count', { count: resultat.total })}
                        </h2>
                        {', '}
                        {t('sorted', { count: resultat.total })}
                        {ressource === 'agents' && <> {t('ownersNote')}</>}
                      </div>

                      <ul
                        className={
                          'divide-y divide-border lg:mt-3 lg:grid lg:gap-4 lg:divide-y-0 ' +
                          (ressource === 'agencies' ? 'lg:grid-cols-2' : 'lg:grid-cols-3')
                        }
                      >
                        {resultat.profils.map((profil) => (
                          <ProfileCard key={profil.id} profil={profil} base={base} forme={forme} />
                        ))}
                      </ul>
                    </section>
                  )}

                  <ProfilePagination
                    base={base}
                    params={params}
                    page={resultat.page}
                    dernierePage={resultat.dernierePage}
                    libelles={{
                      navAria: tCommun('pagination.navAria'),
                      precedent: tCommun('pagination.previous'),
                      suivant: tCommun('pagination.next'),
                      position: (p, total) => tCommun('pagination.position', { page: p, total }),
                    }}
                  />
                </div>

                {ressource === 'agencies' && <AppelAuxAgences />}
              </div>
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

/**
 * « Ton agence n'est pas encore là ? » — en pied de liste au téléphone, en colonne en bureau.
 *
 * ⚠ Il n'existe pas d'inscription d'agence en libre-service : une agence entre par l'espace créé au
 * premier « Publier », puis la demande de passage en agence. Le lien mène donc à `/publish`, l'entrée
 * universelle des professionnels, qui résout lui-même la suite (connexion, assistant).
 */
function AppelAuxAgences() {
  const t = useTranslations('publicProfileIndex.join');
  return (
    <aside className="mt-6 flex items-start gap-3.5 rounded-2xl bg-secondary/60 p-4 lg:mt-0 lg:flex-col lg:gap-0 lg:self-start lg:p-6">
      <Store className="size-6 shrink-0 text-primary-deep lg:size-7" aria-hidden />
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold text-foreground lg:mt-3 lg:font-display lg:text-xl lg:tracking-[-0.02em]">
          {t('title')}
        </h2>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground lg:mt-2">{t('body')}</p>
        <LienLocalise
          href="/publish"
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-[0.9375rem] font-medium text-background outline-none transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] lg:mt-5"
        >
          {t('cta')}
        </LienLocalise>
      </div>
    </aside>
  );
}
