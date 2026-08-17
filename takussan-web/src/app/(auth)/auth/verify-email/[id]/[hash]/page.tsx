import { getToken } from '@/lib/session';
import { apiRequest } from '@/lib/api';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';

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

  if (token) {
    try {
      const queryString = new URLSearchParams(query).toString();
      const path = `/api/auth/verify-email/${id}/${hash}${queryString ? `?${queryString}` : ''}`;
      await apiRequest<{ message: string }>(path, { token });
      success = true;
    } catch {
      // success reste false
    }
  }

  if (success) {
    return (
      <div>
        <div className="flex items-center justify-center size-14 rounded-full bg-green-50 text-green-600 mb-6">
          <CheckCircle2 className="size-7" />
        </div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
          {t('successTitle')}
        </h1>
        <p className="text-muted-foreground text-sm mb-8">{t('successBody')}</p>
        <Link href="/app">
          <Button className="w-full rounded-full h-11 text-base font-semibold">
            {t('successCta')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-center size-14 rounded-full bg-destructive/10 text-destructive mb-6">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
        {t('failureTitle')}
      </h1>
      <p className="text-muted-foreground text-sm mb-8">{t('failureBody')}</p>
      <Link href="/auth/verify-email">
        <Button className="w-full rounded-full h-11 text-base font-semibold">
          {t('failureCta')}
        </Button>
      </Link>
    </div>
  );
}
