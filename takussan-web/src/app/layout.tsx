import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { DELAI_ME_RACINE_MS } from '@/lib/auth';
import { origineSite } from '@/lib/alternates';
import { scriptDeConfigPublique } from '@/lib/config-publique';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { utilisateurDuRendu } from '@/lib/utilisateur-du-rendu';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { AuthProvider } from '@/context/AuthContext';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { FeatureFlagProvider } from '@/components/providers/FeatureFlagProvider';
import { UserLocationProvider } from '@/components/providers/UserLocationProvider';
import { BandeauxDuSite } from '@/components/announcements/BandeauxDuSite';
import { ChatWidget } from '@/components/chat-widget/ChatWidget';
import { IndicateurDeNavigation } from '@/components/shared/IndicateurDeNavigation';
import { MemoireDeLaPagePublique } from '@/components/auth/MemoireDeLaPagePublique';
import { ChatDraftProvider } from '@/context/ChatDraftContext';
import { FloatingDockProvider } from '@/components/floating-dock';
import { IntlProviderRacine } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import './globals.css';

// TCK-742 (P33.01) — seules les deux familles du design system. Toute famille déclarée ici est
// PRÉCHARGÉE par toutes les routes : Manrope, Inter et Fraunces, que seul `/playground` lit, sont
// déclarées par sa page ; Geist, lue nulle part, est retirée. Garde :
// `src/app/__tests__/polices-du-layout-racine.test.ts`.
//
// ADR-0074 — les fichiers sont VERSIONNÉS (`src/app/fonts/`, provenance et mise à jour dans son
// README) et chargés par `next/font/local` : le build ne télécharge plus rien chez Google Fonts,
// dont les pannes intermittentes le cassaient. Ce qui reproduit ce que servait `next/font/google` :
//
// · un fichier VARIABLE à axe `wght` seul, celui que Google servait (même cmap, même axe) ;
// · `weight: '400 700'` : Google déclarait les quatre graisses demandées (400 à 700) sur ce même
//   fichier — une plage plus large ferait rendre un `font-light` en 300 au lieu de 400 ;
// · deux appels par famille, comme les deux @font-face de Google : `latin`, PRÉCHARGÉ, et
//   `latin-ext`, chargé à la demande par son `unicode-range` — c'est lui qui porte le « ŋ » du
//   wolof (295 occurrences dans `wo.json`). `next/font/local` applique `declarations` à toutes
//   les faces d'un appel : un `unicode-range` par fichier exige un appel par fichier. La variable
//   `-ext` se place AVANT l'autre dans `globals.css` (§ @theme) : sa face ne couvre pas U+0020,
//   elle ne fixe donc pas les métriques de la ligne, et le texte latin la traverse sans la charger.
//
// ⚠ Les valeurs sont des LITTÉRAUX : le compilateur de `next/font` refuse toute constante.
const bricolage = localFont({
  src: './fonts/bricolage-grotesque-latin-wght-normal.woff2',
  variable: '--font-bricolage',
  weight: '400 700',
  display: 'swap',
  adjustFontFallback: 'Arial',
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
});
const bricolageExt = localFont({
  src: './fonts/bricolage-grotesque-latin-ext-wght-normal.woff2',
  variable: '--font-bricolage-ext',
  weight: '400 700',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
});
const dmSans = localFont({
  src: './fonts/dm-sans-latin-wght-normal.woff2',
  variable: '--font-dm-sans',
  weight: '400 700',
  display: 'swap',
  adjustFontFallback: 'Arial',
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
});
const dmSansExt = localFont({
  src: './fonts/dm-sans-latin-ext-wght-normal.woff2',
  variable: '--font-dm-sans-ext',
  weight: '400 700',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
});

/**
 * `metadataBase` est posé ICI, et une seule fois — TCK-433.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL RÉSOUT, ET CE QU'IL NE RÉSOUT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Next résout contre lui toute URL RELATIVE d'un objet `Metadata` : `openGraph.images`,
 * `twitter.images`, `alternates.canonical`, `alternates.languages`. Son absence ne produit ni
 * erreur ni rouge — elle produit un **repli silencieux sur `http://localhost:3000`**, c'est-à-dire
 * une carte sociale qui pointe la machine du développeur, servie en production.
 *
 * Trois pages déclarent des `openGraph.images` rendues par l'API (`properties/[slug]`,
 * `agencies/[slug]`, `agents/[slug]`). Elles sont absolues aujourd'hui ; le jour où l'une arrive
 * relative — un `logo_url` servi en `/storage/…` suffit —, elle devient absolue sur la bonne
 * origine au lieu de se casser sans un mot.
 *
 * ⚠️ **Il est à la RACINE et non sous `[locale]/(public)`**, parce que `metadata` d'un layout
 * imbriqué ne couvre que ses descendants : la console, `/auth` et `/onboarding` en resteraient
 * privés. Elles ne s'indexent pas, mais leurs cartes sociales existent, et une origine juste ne
 * coûte rien à poser une fois.
 *
 * ⚠️ **Poser `metadataBase` ne DISPENSE PAS les `hreflang` d'être absolus** : `src/lib/alternates.ts`
 * les émet en absolu délibérément, pour ne dépendre d'aucun réglage qu'on puisse retirer sans
 * s'en apercevoir. Ne pas les « simplifier » en relatif pour en profiter.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.home');
  return {
    metadataBase: new URL(origineSite()),
    title: t('title'),
    description: t('description'),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  // TCK-600 (ADR-0055 §6) — pendant une session d'impersonation, la page se lit en tant que la
  // cible, et `AuthContext` ne reçoit AUCUN jeton : les appels du navigateur passent par le relais.
  const impersonation = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  const token = impersonation ? undefined : cookieStore.get(AUTH_COOKIE_NAME)?.value;

  let initialUser = null;
  if (impersonation ?? token) {
    // TCK-1374 (P138.02, P138.03) — la même promesse que `getMeAction` : un seul `/api/auth/me`
    // par document, lu sous le profil actif (sans lui, un compte de plusieurs agences recevait
    // `agency_id: null`). TCK-1217 (P79.02) — borné : au-delà, le repli anonyme, au lieu d'une
    // page qui ne part pas tant que l'API ne répond pas. La borne n'abandonne pas la lecture
    // partagée, que la coque de `/app` attend de toute façon.
    const borne = AbortSignal.timeout(DELAI_ME_RACINE_MS);
    initialUser = await Promise.race([
      utilisateurDuRendu(),
      new Promise<never>((_resoudre, rejeter) => {
        borne.addEventListener('abort', () => rejeter(borne.reason), { once: true });
      }),
    ]).catch(() => null);
  }

  const locale = await getLocale();
  // ⚠ PAS `getMessages()`. Le dictionnaire ENTIER — 60 espaces de noms, ~60 ko gzip — était
  // sérialisé ici, dans la charge RSC du document, servie `no-store` : repayée à CHAQUE
  // chargement de page, et pesant 83,1 % des octets de `/properties`. Le socle ne porte que ce
  // que la chrome racine et les frontières d'erreur adressent ; chaque groupe de routes ajoute
  // le sien (`src/i18n/messages.ts`, TCK-337).
  const messages = await messagesPour('.');

  return (
    <html lang={locale} className={`${bricolage.variable} ${bricolageExt.variable} ${dmSans.variable} ${dmSansExt.variable}`}>
      <head>
        {/* ADR-0069 § 3 — l'origine de l'API et celle des médias, lues à l'exécution par le
            serveur et transmises au navigateur AVANT tout bundle : un script en ligne s'exécute
            pendant l'analyse du document, les bundles de Next sont différés. Le seul lecteur est
            `src/lib/config-publique.ts`. Rien de secret : cf. son en-tête. */}
        <script id="config-publique" dangerouslySetInnerHTML={{ __html: scriptDeConfigPublique() }} />
      </head>
      <body className="font-sans antialiased">
        <IntlProviderRacine locale={locale} messages={messages}>
          <QueryProvider>
            <AuthProvider initialUser={initialUser} initialToken={token ?? null}>
              <FeatureFlagProvider>
                <UserLocationProvider>
                  <FloatingDockProvider>
                    {/* TCK-500 — enveloppe le widget ET `{children}` : la fiche d'un bien
                        demande l'ouverture d'une discussion, le widget l'exécute, et ce
                        sont deux frères dans cet arbre. */}
                    <ChatDraftProvider>
                      <IndicateurDeNavigation />
                      {/* TCK-568 — le retour de l'écran de connexion y relit la recherche quittée. */}
                      <MemoireDeLaPagePublique />
                      {/* TCK-572 — repli : une page à barre fixe ou à coque pleine hauteur monte
                          ses bandeaux SOUS sa barre (`NavbarSpacer`, `AppShell`), et celui-ci
                          s'efface. Ici, ils passaient sous la barre publique fixe. */}
                      <BandeauxDuSite emplacement="racine" />
                      <ChatWidget />
                      {children}
                    </ChatDraftProvider>
                  </FloatingDockProvider>
                </UserLocationProvider>
              </FeatureFlagProvider>
            </AuthProvider>
          </QueryProvider>
        </IntlProviderRacine>
      </body>
    </html>
  );
}
