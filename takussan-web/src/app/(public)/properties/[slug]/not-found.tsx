import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('errors.propertyNotFound');

  return (
    <div className="max-w-3xl mx-auto px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-stone-900 mb-3">{t('title')}</h1>
      <p className="text-stone-600 mb-8">{t('body')}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {t('browseListings')}
        </Link>
        <Link
          href="/properties"
          className="inline-flex items-center justify-center rounded-md border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
        >
          {t('startSearch')}
        </Link>
      </div>
    </div>
  );
}
