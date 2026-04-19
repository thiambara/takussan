import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-stone-900 mb-3">Bien introuvable</h1>
      <p className="text-stone-600 mb-8">
        Ce bien n&apos;est plus disponible ou a été retiré. Consultez nos autres annonces pour découvrir des
        biens similaires.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Voir les annonces
        </Link>
        <Link
          href="/search"
          className="inline-flex items-center justify-center rounded-md border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
        >
          Lancer une recherche
        </Link>
      </div>
    </div>
  );
}
