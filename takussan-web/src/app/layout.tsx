import type { Metadata } from 'next';
import { Geist, Manrope, Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { getMe } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { AuthProvider } from '@/context/AuthContext';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

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

  return (
    <html lang="fr" className={`${geist.variable} ${manrope.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider initialUser={initialUser}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
