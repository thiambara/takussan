import { getToken } from '@/lib/session';
import { apiRequest } from '@/lib/api';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';
import { avecRedirection } from '@/lib/redirection-interne';

// Un lien stylé en bouton, et non un `<button>` DANS un `<a>` : deux éléments interactifs
// imbriqués, c'est deux arrêts de tabulation pour une seule action, et un HTML invalide.
const CTA = cn(buttonVariants(), 'w-full rounded-full h-11 text-base font-semibold');

type Props = {
  params: Promise<{ id: string; hash: string }>;
  searchParams: Promise<Record<string, string>>;
};

export default async function VerifyEmailHashPage({ params, searchParams }: Props) {
  const t = await getTranslations('auth.verifyEmailLink');
  const { id, hash } = await params;
  const query = await searchParams;
  const token = await getToken();

  let success = false;

  // TCK-624 — le lien se vérifie SANS session : on l'ouvre là où la boîte est relevée, souvent un
  // autre appareil que celui de l'inscription. Il n'était appelé qu'avec un cookie, et rendait
  // « échec » à tous les autres. La signature et le hash de l'adresse font la preuve, côté API.
  try {
    const queryString = new URLSearchParams(query).toString();
    const path = `/api/auth/verify-email/${id}/${hash}${queryString ? `?${queryString}` : ''}`;
    await apiRequest<{ message: string }>(path, token ? { token } : {});
    success = true;
  } catch {
    // success reste false
  }

  if (success) {
    return (
      <div>
        <div className="flex items-center justify-center size-14 rounded-full bg-success/10 text-success mb-6">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
          {t('successTitle')}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">{t('successBody')}</p>
        {/* Connecté : la porte unique de sortie (prénom, orientation). Sinon : se connecter. */}
        <Link href={token ? '/onboarding/intention' : '/auth/login'} className={CTA}>
          {token ? t('successCta') : t('successCtaSignedOut')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-center size-14 rounded-full bg-destructive/10 text-destructive mb-6">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
        {t('failureTitle')}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">{t('failureBody')}</p>
      {/* Renvoyer un lien exige le compte : sans session, on passe par la connexion. */}
      <Link
        href={token ? '/auth/verify-email' : avecRedirection('/auth/login', '/auth/verify-email')}
        className={CTA}
      >
        {t('failureCta')}
      </Link>
    </div>
  );
}
