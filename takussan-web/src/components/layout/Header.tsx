import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-slate-800 tracking-tight">
          Takussan
        </Link>
        <nav className="text-sm text-stone-600">
          <Link href="/" className="hover:text-slate-800 transition-colors duration-150">
            Annonces
          </Link>
        </nav>
      </div>
    </header>
  );
}
