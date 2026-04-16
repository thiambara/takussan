export function Footer() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-stone-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Takussan — Immobilier à Dakar
      </div>
    </footer>
  );
}
