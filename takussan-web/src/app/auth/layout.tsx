import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[45%_55%]">
      {/* Visual panel — desktop left */}
      <div className="relative hidden lg:block">
        <Image
          src="https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&auto=format&fit=crop"
          alt="Villa contemporaine au Sénégal"
          fill
          priority
          className="object-cover"
          sizes="45vw"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-primary/40 to-black/60" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <Link
            href="/"
            className="font-headline font-bold text-2xl tracking-tight hover:opacity-90 transition-opacity"
          >
            Takussan
          </Link>
          <div>
            <h2 className="font-headline text-4xl font-bold mb-3 leading-tight">
              Votre porte d&apos;entrée vers l&apos;immobilier du Sénégal.
            </h2>
            <p className="text-white/85 max-w-md text-base">
              Des milliers de biens, une expérience soignée, des partenaires de confiance.
            </p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-6 md:p-10 bg-background">
        {/* Mobile banner */}
        <div className="lg:hidden absolute top-0 inset-x-0 h-[28vh] overflow-hidden -z-0">
          <Image
            src="https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&auto=format&fit=crop"
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/30 to-background" />
          <Link
            href="/"
            className="absolute top-6 left-6 font-headline font-bold text-xl tracking-tight text-white"
          >
            Takussan
          </Link>
        </div>

        <div className="w-full max-w-md animate-fade-in-up lg:mt-0 mt-[22vh] relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
}
