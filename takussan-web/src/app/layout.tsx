import type { Metadata } from 'next';
import { Geist, Manrope, Inter, Bricolage_Grotesque, DM_Sans, Fraunces } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { getMe } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { AuthProvider } from '@/context/AuthContext';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { MaintenanceBanner } from '@/components/maintenance/MaintenanceBanner';
import { TIMEZONE } from '@/i18n/config';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', weight: ['400', '500', '600', '700'] });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', weight: ['400', '500', '600', '700'] });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', weight: ['400', '500', '600'], style: ['normal', 'italic'] });

export const metadata: Metadata = {
  title: 'Takussan — Immobilier au Sénégal',
  description: 'Louez, achetez, vendez en toute confiance. Des milliers de biens au Sénégal vous attendent.',
};

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
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${geist.variable} ${manrope.variable} ${inter.variable} ${bricolage.variable} ${dmSans.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={TIMEZONE}>
          <QueryProvider>
            <AuthProvider initialUser={initialUser} initialToken={token ?? null}>
              <MaintenanceBanner />
              {children}
            </AuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
