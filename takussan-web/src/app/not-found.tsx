import { House, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { Logo } from '@/components/brand/Logo';
import { Input } from '@/components/ui/input';
import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';

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
 * `/en/inconnu` en anglais sans que ce fichier connaisse le schéma d'URL. Le formulaire de
 * recherche, qui n'est pas un `LienLocalise`, lit la même langue par `useLocale()`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * UNE ISSUE UTILE (TCK-2515)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Plus de sur-titre « Erreur 404 » : le titre dit tout. À la place, une recherche et trois
 * raccourcis. La recherche est un **simple formulaire GET** vers `/<langue>/properties?q=…` (`q`,
 * clé de texte libre de la liste, `SEARCH_FILTER_KEYS.q`) — sans autocomplétion :
 * `SearchAutocomplete` ferait entrer `search` au socle, au prix mesuré ci-dessus, et un
 * formulaire natif marche sans JavaScript. Statut inchangé : 404, mesuré avant et après.
 */
/**
 * TCK-2515 — les raccourcis d'un 404 : louer, acheter, les agences. Aucune ville n'y est supposée :
 * le visiteur arrivé d'un lien périmé peut chercher n'importe où.
 */
const RACCOURCIS = [
  { cle: 'shortcutRent', href: '/properties?contract_type=rent' },
  { cle: 'shortcutBuy', href: '/properties?contract_type=sale' },
  { cle: 'shortcutAgencies', href: '/agencies' },
] as const;

export default function NotFound() {
  const t = useTranslations('errors.siteNotFound');
  // ⚠ Le nom de marque vient de `common.appName`, source unique du dépôt, et non d'une copie sous
  // `errors` : `scripts/check-i18n.mjs` refuse un libellé en dur dans un écran neuf, et dupliquer
  // la marque pour l'esquiver aurait créé deux endroits à corriger le jour d'un changement de nom.
  // Le socle paie `common` pour cela — mesuré à **+1 point** du dictionnaire gzippé (`.` 13 → 14),
  // contre les +13 qu'aurait coûtés `Navbar`/`Footer`.
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center px-6 md:px-12">
          <LienLocalise
            href="/"
            className="inline-flex rounded-md py-1"
          >
            {/* TCK-621 — la marque, comme la `Navbar` qu'on n'a pas les moyens de charger ici. */}
            <Logo nom={tc('appName')} />
          </LienLocalise>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[640px] flex-1 px-5 pb-16 pt-14 md:px-8 md:pt-24">
        <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-foreground md:text-5xl md:leading-[1.05]">
          {t('title')}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-pretty text-muted-foreground md:mt-4 md:text-lg">
          {t('body')}
        </p>

        {/* TCK-2515 — un formulaire GET natif : il marche sans JavaScript, et n'importe rien qui
            ferait entrer `search` au socle (cf. le second bloc de l'en-tête). */}
        <form
          role="search"
          aria-label={t('searchLabel')}
          method="get"
          action={hrefLocalise('/properties', locale)}
          className="mt-7 flex h-12 items-center gap-2.5 rounded-full border border-border bg-card pl-4 pr-1.5 focus-within:ring-3 focus-within:ring-ring md:mt-8 md:h-14"
        >
          <Search className="size-[18px] flex-none text-muted-foreground" aria-hidden="true" />
          {/* La primitive (TCK-2460), sans sa bordure : la coque arrondie porte le champ et son
              anneau de focus, comme la barre de recherche du site. */}
          <Input
            type="search"
            name="q"
            aria-label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            enterKeyHint="search"
            className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 focus-visible:ring-0 dark:bg-transparent md:text-base"
          />
          <button
            type="submit"
            className="inline-flex h-9 flex-none items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[background-color,scale] hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] motion-reduce:active:scale-100 md:h-11 md:px-5"
          >
            {t('searchSubmit')}
          </button>
        </form>

        <nav aria-label={t('shortcutsLabel')} className="mt-4 md:mt-5">
          <ul className="flex flex-wrap gap-2">
            {RACCOURCIS.map(({ cle, href }) => (
              <li key={cle}>
                <LienLocalise
                  href={href}
                  className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {t(cle)}
                </LienLocalise>
              </li>
            ))}
          </ul>
        </nav>

        <LienLocalise
          href="/"
          className="mt-6 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring md:mt-8"
        >
          <House className="size-4" aria-hidden="true" />
          {t('backHome')}
        </LienLocalise>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-8 text-sm text-muted-foreground md:px-12">
          {t('footer')}
        </div>
      </footer>
    </div>
  );
}
