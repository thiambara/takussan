'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/Logo';
import { DeclarerEntree } from '@/components/entree/CoqueDEntree';
import { BoutonFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';

import { BarreDuBien, avecBien, type IntentionAffichee } from './IntentionDEntree';

/**
 * TCK-2606 — le retour d'un écran qui SUIT la connexion (« Mot de passe oublié », « Lien envoyé ») :
 * vers la connexion, pas vers le site public (maquette : « Retour à la connexion »).
 *
 * Au téléphone, la barre du bien quitté quand il y en a un (TCK-2604 : « le bien quitté reste dans
 * la barre »), sinon une barre de 56 px — la flèche et la marque. Au bureau, la pastille de la barre.
 */
export function RetourDEntree({ href, libelle, intention }: { readonly href: string; readonly libelle: string; readonly intention: IntentionAffichee | null }) {
  const router = useRouter();
  const tCommun = useTranslations('common');
  const enTete = avecBien(intention) ? (
    <BarreDuBien intention={intention} libelleRetour={libelle} onRetour={() => router.push(href)} />
  ) : (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border/70 bg-background px-1">
      <BoutonFlecheDeRetour libelle={libelle} onClick={() => router.push(href)} />
      <Logo nom={tCommun('appName')} />
    </header>
  );
  return (
    <DeclarerEntree
      enTete={enTete}
      retourBureau={
        <Link
          href={href}
          // Le plancher de 44 px des retours (TCK-560, W3), comme `RetourAuth` et `BoutonRetour`.
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {libelle}
        </Link>
      }
    />
  );
}
