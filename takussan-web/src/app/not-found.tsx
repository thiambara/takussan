import { useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';

/**
 * Le 404 du site (TCK-438).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI À LA RACINE, ET NULLE PART AILLEURS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Trois emplacements étaient plausibles une fois la langue passée en segment d'URL (TCK-434), et
 * ils ne sont pas interchangeables. Mesuré le 2026-08-27, `next dev` 16.3.1, un marqueur distinct
 * par candidat, serveur redémarré entre les campagnes :
 *
 * | URL demandée                    | `[locale]/(public)/not-found.tsx` | `[locale]/not-found.tsx` | `app/not-found.tsx` |
 * |---------------------------------|-----------------------------------|--------------------------|---------------------|
 * | `/fr/une-url-qui-nexiste-pas`   | jamais atteint                    | jamais atteint           | **atteint, 404**    |
 * | `/fr/agencies/<slug-inconnu>`   | jamais atteint                    | atteint                  | atteint             |
 *
 * **Une URL qui ne correspond à AUCUNE route ne descend dans aucun segment** — ni dans le groupe
 * `(public)`, ni même dans `[locale]`, pourtant dynamique et qui accepterait `fr`. Le seul
 * `not-found.tsx` qu'elle rencontre est celui de la racine. C'est la raison d'être de ce fichier :
 * les deux autres candidats rendaient un écran que personne n'aurait vu.
 *
 * ⚠️ **Le premier segment inconnu n'arrive pas ici, il est REDIRIGÉ.** `/une-url-hors-locale` rend
 * **307** vers `/fr/une-url-hors-locale` — le proxy traite tout premier segment non reconnu comme
 * une URL héritée — et c'est cette seconde URL qui rend 404. Un test qui suivrait la redirection
 * (`curl -L`) verrait le 404 final et conclurait à tort que le premier saut n'existe pas.
 *
 * ⚠️ **Sa présence ne dégrade AUCUN statut, et il fallait le vérifier plutôt que l'espérer** : une
 * frontière posée trop bas peut faire rendre 200 à un vrai 404, exactement comme un `loading.tsx`
 * (cf. `[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts`). Relevé avant / après
 * création de ce fichier, serveur neuf : `/fr/properties/<inconnu>` **404 → 404**,
 * `/fr/agencies/<inconnu>` **404 → 404**.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI SA CHROME EST ÉCRITE ICI ET N'IMPORTE PAS `Navbar` / `Footer`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce fichier est un fichier de routeur à la RACINE : tout espace de noms qu'il atteint entre dans
 * le socle servi à **toutes** les pages du produit, et le socle est hérité par chaque frontière
 * (`messagesPour('.')`, TCK-337). Importer la chrome marketing y fait entrer `common`, `favorites`,
 * `footer`, `nav`, `property` et `search`. Le prix a été mesuré, pas supposé —
 * `node scripts/check-i18n-namespaces.mjs --update`, part du dictionnaire gzippé, en points :
 *
 * ```
 * frontière                  avant → après
 * .                            13  →  26        (auth)        18 → 30
 * (dashboard)                  16  →  28        publish       18 → 31
 * [locale]/(public)            36  →  37        onboarding    42 → 54
 * ```
 *
 * **Le socle double**, et `/auth`, `/publish`, `/onboarding` paient le catalogue et la recherche —
 * pour une page que la quasi-totalité des visites ne voit jamais. C'est exactement le défaut que
 * TCK-337 a corrigé, réintroduit par une page d'erreur. La chrome est donc écrite ici, à partir du
 * seul espace `errors`, déjà au socle : le visiteur obtient une page qui appartient au site et un
 * chemin de retour, ce que l'AC4 demande, sans taxer les 110 autres pages.
 *
 * *Les `not-found.tsx` d'agence et d'agent, eux, gardent la vraie chrome* : ils vivent sous
 * `[locale]/(public)`, qui a déjà payé `nav` et `footer` (+1 point, mesuré ci-dessus).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA LANGUE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `not-found.tsx` ne reçoit pas de `params` : il ne peut pas lire `[locale]` dans l'URL. La langue
 * vient donc du contexte monté par la disposition racine — l'en-tête posé par `src/proxy.ts`, qui
 * tourne sur cette URL comme sur les autres, à défaut le cookie. C'est ce qui fait rendre
 * `/en/inconnu` en anglais sans que ce fichier connaisse le schéma d'URL.
 */
export default function NotFound() {
  const t = useTranslations('errors.siteNotFound');
  // ⚠ Le nom de marque vient de `common.appName`, source unique du dépôt, et non d'une copie sous
  // `errors` : `scripts/check-i18n.mjs` refuse un libellé en dur dans un écran neuf, et dupliquer
  // la marque pour l'esquiver aurait créé deux endroits à corriger le jour d'un changement de nom.
  // Le socle paie `common` pour cela — mesuré à **+1 point** du dictionnaire gzippé (`.` 13 → 14),
  // contre les +13 qu'aurait coûtés `Navbar`/`Footer`.
  const tc = useTranslations('common');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center px-6 md:px-12">
          <LienLocalise
            href="/"
            className="font-display text-xl font-semibold tracking-tight text-foreground"
          >
            {tc('appName')}
          </LienLocalise>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24 text-center md:px-12">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t('eyebrow')}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mx-auto mt-4 max-w-prose text-muted-foreground">{t('body')}</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <LienLocalise
            href="/properties"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('browseListings')}
          </LienLocalise>
          <LienLocalise
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t('backHome')}
          </LienLocalise>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-8 text-sm text-muted-foreground md:px-12">
          {t('footer')}
        </div>
      </footer>
    </div>
  );
}
