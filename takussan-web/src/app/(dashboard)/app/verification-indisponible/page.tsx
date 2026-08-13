import { AlertTriangle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

/**
 * « Nous n'avons pas pu vérifier vos accès » — et c'est une PAGE, pas un message d'erreur.
 *
 * Les gardes Standard-only sont fail-closed : sans réponse de l'API, elles refusent. Mais un
 * refus muet vers `/app`, tous les accès pro cadenassés, est indiscernable d'un déclassement de
 * forfait pour un `agency_admin` d'une agence `standard`.
 *
 * La première tentative levait une erreur marquée, reconnue par `(dashboard)/error.tsx`. Elle ne
 * fonctionnait qu'en développement : Next expurge les messages d'erreur des Server Components en
 * production. Une redirection, elle, ne dépend d'aucune sérialisation.
 *
 * `/app` veut dire « non » ; cette route dit « je n'ai pas pu demander ». Deux réponses
 * différentes à deux questions différentes.
 */
export default async function VerificationIndisponiblePage() {
  const t = await getTranslations('errors.boundary');

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="size-10 text-app-accent" aria-hidden />
      <h1 className="text-xl font-semibold text-app-ink">{t('agencyTitle')}</h1>
      <p className="max-w-md text-sm text-app-ink-muted">{t('agencyBody')}</p>
      <Link href="/app" className={buttonVariants()}>
        {t('retry')}
      </Link>
    </div>
  );
}
