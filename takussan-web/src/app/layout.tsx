import type { Metadata } from 'next';
import { Geist, Manrope, Inter, Bricolage_Grotesque, DM_Sans, Fraunces } from 'next/font/google';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { getMe } from '@/lib/auth';
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.home');
  return { title: t('title'), description: t('description') };
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
