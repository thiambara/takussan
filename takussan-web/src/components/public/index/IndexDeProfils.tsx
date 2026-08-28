import { AlertTriangle, SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import type { Locale } from '@/i18n/config';
import {
  RESSOURCES_DE_PROFIL,
  listerProfilsPublics,
  type PageDeProfils,
  type RessourceDeProfil,
} from '@/lib/queries/public-profiles';

import { ProfileCard } from './ProfileCard';
import { ProfileFilters } from './ProfileFilters';
import { ProfilePagination } from './ProfilePagination';

type Props = {
  readonly ressource: RessourceDeProfil;
  readonly locale: Locale;
  readonly params: URLSearchParams;
  readonly page: number;
  readonly forme: 'rond' | 'carre';
};

/**
 * Le corps partagé de `/agencies` et `/agents` — TCK-436.
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

  const ville = params.get('city')?.trim() || undefined;
  const recherche = params.get('q')?.trim() || undefined;

  let resultat: PageDeProfils | null;
  try {
    resultat = await listerProfilsPublics(ressource, { page, ville, recherche }, locale);
  } catch (err) {
    // Nommer la ressource : « la page est vide » n'apprend rien, « l'index `agents` a échoué »
    // dit où chercher. Même patron que les sources de `src/app/sitemap.ts`.
    console.error(`[index-profils] « ${ressource} » indisponible.`, err);
    resultat = null;
  }

  const base = RESSOURCES_DE_PROFIL[ressource].chemin;

  const libellesDeCarte = {
    portefeuille: (n: number) => tCommun('card.portfolio', { count: n }),
    aLouer: (n: number) => tCommun('card.rent', { count: n }),
    aVendre: (n: number) => tCommun('card.sale', { count: n }),
    avis: (n: number) => tCommun('card.reviews', { count: n }),
    verifie: tCommun('card.verified'),
    noteAria: (note: number) => tCommun('card.ratingAria', { rating: note }),
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="h-[133px]" />

      <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-10 md:px-12">
        <header className="relative mb-10">
          {/* Le même watermark bogolan que les fiches de TCK-276 : l'index et la fiche
              appartiennent au même monde visuel. */}
          <div className="absolute inset-x-[-12px] inset-y-[-24px] -z-10 overflow-hidden rounded-[28px] bg-card md:inset-x-[-24px]">
            <div className="absolute inset-0 text-foreground opacity-[0.04]">
              <BogolanPattern className="h-full w-full" color="currentColor" />
            </div>
          </div>

          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">
            {t('heading')}
          </h1>
          <p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground md:text-lg">
            {t('intro')}
          </p>
        </header>

        {resultat === null ? (
          <div
            role="alert"
            className="rounded-2xl border border-border bg-card p-10 text-center"
          >
            <AlertTriangle className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-display text-xl text-foreground">{tCommun('error.title')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{tCommun('error.body')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            <ProfileFilters
              base={base}
              villes={resultat.villes}
              placeholderRecherche={t('searchPlaceholder')}
            />

            {resultat.profils.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-10 text-center">
                <SearchX className="mx-auto size-6 text-muted-foreground" aria-hidden />
                <p className="mt-3 font-display text-xl text-foreground">{t('emptyTitle')}</p>
                <p className="mt-2 text-sm text-muted-foreground">{tCommun('empty.body')}</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('count', { count: resultat.total })}
                </p>

                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {resultat.profils.map((profil) => (
                    <ProfileCard
                      key={profil.id}
                      profil={profil}
                      base={base}
                      libelles={libellesDeCarte}
                      forme={forme}
                    />
                  ))}
                </ul>
              </>
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
        )}
      </main>

      <Footer />
    </div>
  );
}
