import type { Metadata } from 'next';
import { Geist, Manrope, Inter, Bricolage_Grotesque, DM_Sans, Fraunces } from 'next/font/google';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { getMe } from '@/lib/auth';
import { ORIGINE_SITE } from '@/lib/alternates';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { AuthProvider } from '@/context/AuthContext';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { FeatureFlagProvider } from '@/components/providers/FeatureFlagProvider';
import { UserLocationProvider } from '@/components/providers/UserLocationProvider';
import { MaintenanceBanner } from '@/components/maintenance/MaintenanceBanner';
import { GlobalAnnouncementBanner } from '@/components/announcements/GlobalAnnouncementBanner';
import { ChatWidget } from '@/components/chat-widget/ChatWidget';
import { FloatingDockProvider } from '@/components/floating-dock';
import { IntlProviderRacine } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', weight: ['400', '500', '600', '700'] });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', weight: ['400', '500', '600', '700'] });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', weight: ['400', '500', '600'], style: ['normal', 'italic'] });

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
    metadataBase: new URL(ORIGINE_SITE),
    title: t('title'),
    description: t('description'),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  let initialUser = null;
  if (token) {
    try {
      initialUser = await getMe(token);
    } catch {
      initialUser = null;
    }
  }

  const locale = await getLocale();
  // ⚠ PAS `getMessages()`. Le dictionnaire ENTIER — 60 espaces de noms, ~60 ko gzip — était
  // sérialisé ici, dans la charge RSC du document, servie `no-store` : repayée à CHAQUE
  // chargement de page, et pesant 83,1 % des octets de `/properties`. Le socle ne porte que ce
  // que la chrome racine et les frontières d'erreur adressent ; chaque groupe de routes ajoute
  // le sien (`src/i18n/messages.ts`, TCK-337).
  const messages = await messagesPour('.');

  return (
    <html lang={locale} className={`${geist.variable} ${manrope.variable} ${inter.variable} ${bricolage.variable} ${dmSans.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <IntlProviderRacine locale={locale} messages={messages}>
          <QueryProvider>
            <AuthProvider initialUser={initialUser} initialToken={token ?? null}>
              <FeatureFlagProvider>
                <UserLocationProvider>
                  <FloatingDockProvider>
                    <MaintenanceBanner />
                    <GlobalAnnouncementBanner />
                    <ChatWidget />
                    {children}
                    <Analytics />
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
