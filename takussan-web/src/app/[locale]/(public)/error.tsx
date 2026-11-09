'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, House, RotateCw, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Footer } from '@/components/home/Footer';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

/**
 * L'erreur d'une page publique — TCK-2515, « une issue utile ».
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET CE QUE ÇA CHANGE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Avant, seule la racine avait un `error.tsx` (`src/app/error.tsx`) : une exception levée par
 * n'importe quelle page publique remplaçait **tout** le rendu — navigation comprise — par une barre
 * de marque et un seul bouton, « Réessayer ». Si réessayer échouait, le visiteur était bloqué.
 *
 * Posée sous `[locale]/(public)`, cette frontière est rendue DANS le layout du groupe : la barre
 * d'onglets du téléphone, le comparateur et les fournisseurs restent. La `Navbar` et le pied de
 * page, eux, sont montés par chaque page publique et non par le layout — la frontière les remplace
 * donc avec la page, et les remonte elle-même. Ils ne coûtent rien au dictionnaire : la coque de
 * `(public)` sert déjà `nav` et `footer` (`scripts/check-i18n-namespaces.mjs`).
 *
 * *Une frontière d'erreur ne couvre pas le code qui la monte* (cf. l'en-tête de la racine) : ce que
 * lève `(public)/layout.tsx` reste à `src/app/error.tsx`, qui garde son écran autonome.
 *
 * ⚠ Elle n'attrape pas `notFound()` : les 404 restent des 404, rendus par les `not-found.tsx`.
 *
 * Deux sorties, la référence en petit — **pas de « Signaler le problème »** (décision du porteur,
 * 2026-11-08) : la référence (`digest`) suffit à l'équipe pour retrouver l'erreur dans ses
 * journaux si on la lui donne. Vouvoiement.
 */
export default function ErreurPublique({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const t = useTranslations('errors.publicBoundary');
  const [copiee, setCopiee] = useState(false);

  useEffect(() => {
    console.error('[erreur-publique]', error);
  }, [error]);

  async function copier(digest: string) {
    try {
      await navigator.clipboard.writeText(digest);
      setCopiee(true);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : la référence reste lisible.
    }
  }

  return (
    <>
      {/* TCK-2568 — au téléphone, une page d'erreur ouvre sur la barre de MARQUE (logo seul, écrans
          « Page inconnue » / « Erreur serveur » de la maquette), quel que soit son chemin. */}
      <Navbar auTelephone="marque" />
      <NavbarSpacer auTelephone="marque" />
      <main
        id={CONTENU_PRINCIPAL_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-[560px] px-4 pb-20 pt-14 focus:outline-none md:px-8 md:pt-24"
      >
        <span
          className="inline-flex size-12 items-center justify-center rounded-2xl bg-secondary text-[var(--primary-deep)]"
          aria-hidden="true"
        >
          <TriangleAlert className="size-6" />
        </span>
        <h1 className="mt-5 font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-balance text-foreground md:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-pretty text-muted-foreground">{t('body')}</p>

        <div className="mt-7 grid gap-2.5 sm:flex">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-[background-color,scale] hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <RotateCw className="size-4" aria-hidden="true" />
            {t('retry')}
          </button>
          <LienLocalise
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-[15px] font-semibold text-foreground transition-[background-color,scale] hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <House className="size-4" aria-hidden="true" />
            {t('backHome')}
          </LienLocalise>
        </div>

        {error.digest ? (
          <div className="mt-8 border-t border-border pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 items-center rounded-lg bg-muted px-3 font-mono text-[13px] text-muted-foreground">
                {t('reference', { digest: error.digest })}
              </span>
              <button
                type="button"
                onClick={() => void copier(error.digest!)}
                aria-label={copiee ? t('copied') : t('copyReference')}
                className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {copiee ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
              <span role="status" className="sr-only">
                {copiee ? t('copied') : ''}
              </span>
            </div>
            <p className="mt-2 text-sm text-pretty text-muted-foreground">{t('referenceHint')}</p>
          </div>
        ) : null}
      </main>
      <Footer />
    </>
  );
}
