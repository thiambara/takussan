'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, ChevronRight, MapPin, Phone } from 'lucide-react';

import { telHref, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { CARTE, GesteItineraire } from '@/components/visits/par-le-temps/pieces';
import { initiales } from '@/lib/fiche-publique';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-2587, lot B — les pièces de la fiche d'une visite (maquette `app-visites-a-mobile.tsx`,
 * « Fiche de visite », et `app-visites-a.tsx`, « Détail — bureau »).
 */

/** Le sur-titre d'une carte : petites capitales espacées. */
export function Etiquette({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <p className={cn('text-xs font-semibold uppercase tracking-surtitre text-muted-foreground', className)}>{children}</p>;
}

/** Les initiales du visiteur en disque (48 px au téléphone, 44 au bureau). */
export function Monogramme({ nom, className }: { readonly nom: string; readonly className?: string }) {
  return (
    <span className={cn('inline-flex flex-none items-center justify-center rounded-full bg-secondary font-semibold text-primary-deep', className)} aria-hidden="true">
      {initiales(nom)}
    </span>
  );
}

/** Où en est la visite : quatre temps, celui d'aujourd'hui en terracotta. */
export function Etapes({ courant }: { readonly courant: number }) {
  const t = useTranslations('visits.fiche.etapes');
  const etapes = [t('demandee'), t('confirmee'), t('visite'), t('compteRendu')];
  return (
    <ol aria-label={t('label')} data-slot="etapes-de-la-visite" className="mt-5 grid grid-cols-4 gap-1.5">
      {etapes.map((e, i) => (
        <li key={e} aria-current={i === courant ? 'step' : undefined}>
          <span className={cn('block h-1 rounded-full', i < courant ? 'bg-foreground' : i === courant ? 'bg-primary' : 'bg-muted')} aria-hidden="true" />
          <span className={cn('mt-2 block text-xs', i === courant ? 'font-semibold text-foreground' : i < courant ? 'text-encre-douce' : 'text-muted-foreground')}>{e}</span>
        </li>
      ))}
    </ol>
  );
}

/** La pastille de statut posée sur la photo : un point de couleur et le mot. */
export function PastilleDeStatut({ libelle, point }: { readonly libelle: string; readonly point: string }) {
  return (
    <span data-slot="statut-de-la-fiche" className="inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-ui font-semibold text-foreground">
      <span className={cn('size-2 rounded-full', point)} aria-hidden="true" />
      {libelle}
    </span>
  );
}

/** La photo du bien en tête de la fiche ; sans photo, un fond neutre. */
export function PhotoDuBien({ src, className }: { readonly src: string | null | undefined; readonly className?: string }) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {src ? (
        <Image src={src} alt="" fill sizes="(width < 48rem) 100vw, 12rem" className="object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-muted-foreground" aria-hidden="true">
          <Building2 className="size-8" strokeWidth={1.5} />
        </span>
      )}
    </div>
  );
}

/** Où : le bien, son prix et sa référence, l'adresse en clair et « Itinéraire » à côté d'elle. */
export function CarteLieu({ v, detail, itinerairePlein }: { readonly v: PropertyVisit; readonly detail: string | null; readonly itinerairePlein: boolean }) {
  const t = useTranslations('visits.fiche.lieu');
  const a = v.property?.address;
  const ville = a?.city?.trim() || null;
  const quartier = a?.neighborhood?.trim() || null;
  return (
    <section data-slot="carte-lieu" className={cn(CARTE, 'overflow-hidden')}>
      <div className="flex items-start gap-3 px-4 pt-4 pb-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg leading-snug font-semibold tracking-titre text-foreground">{v.property?.title}</h2>
          {detail ? <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{detail}</p> : null}
        </div>
        {v.property?.slug ? (
          <Link
            href={`/properties/${v.property.slug}`}
            className="-my-2 inline-flex h-11 flex-none items-center gap-0.5 rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('voirLeBien')}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {a?.line || quartier ? (
        <div className="flex items-center gap-3 border-t border-border/70 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-action leading-snug font-semibold text-balance text-foreground">{a?.line || quartier}</p>
            {a?.line && (quartier || ville) ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{quartier && ville ? t('ville', { quartier, ville }) : (quartier ?? ville)}</p>
            ) : null}
          </div>
          <GesteItineraire v={v} plein={itinerairePlein} className={cn('px-4', itinerairePlein && 'h-11 text-sm')} />
        </div>
      ) : null}
    </section>
  );
}

const ROND = 'inline-flex size-11 flex-none items-center justify-center rounded-full border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring';

/** Qui : le visiteur, ses deux canaux à portée de pouce, et sa fiche. */
export function CarteVisiteur({
  nom,
  numero,
  email,
  rang,
  ficheHref,
  messageWhatsApp,
}: {
  readonly nom: string;
  readonly numero: string | null;
  readonly email: string | null;
  readonly rang: string | null;
  readonly ficheHref: string | null;
  readonly messageWhatsApp: string;
}) {
  const t = useTranslations('visits.parLeTemps');
  const tFiche = useTranslations('visits.fiche.visiteur');
  return (
    <section data-slot="carte-visiteur" className={cn(CARTE, 'px-4 pt-4', !(rang || ficheHref) && 'pb-4')}>
      <div className="flex items-center gap-3">
        <Monogramme nom={nom} className="size-12 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-action font-semibold text-foreground">{nom}</p>
          {numero && formaterTelephone(numero) !== nom ? <p className="text-sm tabular-nums text-muted-foreground">{formaterTelephone(numero)}</p> : null}
          {email ? (
            <a href={`mailto:${email}`} className="block truncate text-sm text-muted-foreground hover:text-foreground hover:underline">
              {email}
            </a>
          ) : null}
        </div>
        {numero ? (
          <>
            <a href={telHref(numero)} aria-label={t('appeler', { nom })} data-slot="geste-appeler" className={cn(ROND, 'text-foreground')}>
              <Phone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
            </a>
            <a
              href={whatsappHref(numero, messageWhatsApp)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('whatsapp', { nom })}
              data-slot="geste-whatsapp"
              className={cn(ROND, 'text-success')}
            >
              <IconeWhatsApp className="size-5" />
            </a>
          </>
        ) : null}
      </div>
      {rang || ficheHref ? (
        <div className="mt-3.5 flex h-12 items-center border-t border-border/70 text-sm">
          {rang ? <span className="font-medium text-foreground">{rang}</span> : null}
          {ficheHref ? (
            <Link
              href={ficheHref}
              className="ml-auto inline-flex h-11 items-center gap-0.5 rounded-md font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              {tFiche('voirSaFiche')}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Le message prêt à partir (jour J) : la bulle verte, et ce que fait le bouton. */
export function CarteEnRoute({ message }: { readonly message: string }) {
  const t = useTranslations('visits.fiche.enRoute');
  return (
    <section data-slot="carte-en-route" className={cn(CARTE, 'p-4')}>
      <Etiquette>{t('titre')}</Etiquette>
      <p className="mt-2.5 rounded-2xl rounded-br-md bg-success/10 px-3.5 py-2.5 text-corps leading-relaxed text-foreground">{message}</p>
      <p className="mt-2.5 text-ui text-muted-foreground">{t('aide')}</p>
    </section>
  );
}

/** Le créneau : six données en deux colonnes (trois au bureau). */
export function CarteCreneau({
  titre,
  lignes,
  colonnes = 2,
  action,
  children,
}: {
  readonly titre: string;
  readonly lignes: readonly (readonly [string, ReactNode])[];
  readonly colonnes?: 2 | 3;
  readonly action?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section data-slot="carte-creneau" className={cn(CARTE, colonnes === 3 ? '' : 'p-4')}>
      {colonnes === 3 ? (
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="min-w-0 flex-1 text-corps font-semibold text-foreground">{titre}</h2>
          {action}
        </div>
      ) : (
        <Etiquette>{titre}</Etiquette>
      )}
      <dl className={cn('grid gap-x-4 gap-y-4', colonnes === 3 ? 'grid-cols-2 gap-x-6 p-4 lg:grid-cols-3' : 'mt-3.5 grid-cols-2')}>
        {lignes.map(([cle, valeur]) => (
          <div key={cle} className="min-w-0">
            <dt className="text-ui text-muted-foreground">{cle}</dt>
            <dd className={cn('mt-0.5 font-medium tabular-nums text-foreground', colonnes === 3 ? 'text-sm' : 'text-corps')}>{valeur}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

/** Un geste de la liste « Autres gestes » (le menu « ⋯ » écrit en bas de la fiche). */
export interface AutreGeste {
  readonly cle: string;
  readonly libelle: string;
  readonly detail?: string;
  readonly icone: typeof Phone;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly href?: string;
  /** `href` hors de l'app (WhatsApp) : un nouvel onglet. */
  readonly externe?: boolean;
  /** Le geste ouvre un choix (« Attribuer à un collègue ») : l'appelant enveloppe le déclencheur. */
  readonly envelopper?: (declencheur: ReactElement) => ReactNode;
}

const LIGNE_DE_GESTE = 'flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left outline-none focus-visible:bg-muted disabled:opacity-60';

function ContenuDuGeste({ g }: { readonly g: AutreGeste }) {
  const I = g.icone;
  return (
    <>
      <span className={cn('inline-flex size-9 flex-none items-center justify-center rounded-full', g.danger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-encre-douce')}>
        <I className="size-icone" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-corps font-medium', g.danger ? 'text-destructive' : 'text-foreground')}>{g.libelle}</span>
        {g.detail ? <span className="block text-ui leading-snug text-muted-foreground">{g.detail}</span> : null}
      </span>
      <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
    </>
  );
}

/** Le déclencheur d'un geste : un lien, ou un bouton (éventuellement enveloppé). */
export function DeclencheurDeGeste({ g, className }: { readonly g: AutreGeste; readonly className?: string }) {
  if (g.href && g.externe) {
    return (
      <a href={g.href} target="_blank" rel="noopener noreferrer" data-geste={g.cle} className={cn(LIGNE_DE_GESTE, className)}>
        <ContenuDuGeste g={g} />
      </a>
    );
  }
  if (g.href) {
    return (
      <Link href={g.href} className={cn(LIGNE_DE_GESTE, className)}>
        <ContenuDuGeste g={g} />
      </Link>
    );
  }
  const bouton = (
    <button type="button" onClick={g.onClick} disabled={g.disabled} data-geste={g.cle} className={cn(LIGNE_DE_GESTE, className)}>
      <ContenuDuGeste g={g} />
    </button>
  );
  return g.envelopper ? <>{g.envelopper(bouton)}</> : bouton;
}

/** « Autres gestes » : aucun geste du menu n'est perdu, tous écrits en bas de la fiche. */
export function AutresGestes({ gestes }: { readonly gestes: readonly AutreGeste[] }) {
  const t = useTranslations('visits.fiche.autres');
  if (gestes.length === 0) return null;
  return (
    <section data-slot="autres-gestes" className="pt-3">
      <Etiquette className="px-1">{t('titre')}</Etiquette>
      <ul className={cn(CARTE, 'mt-3 divide-y divide-border/70 overflow-hidden')}>
        {gestes.map((g) => (
          <li key={g.cle}>
            <DeclencheurDeGeste g={g} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** L'adresse courte du bureau : « 12, rue Carnot, Dakar ». */
export function AdresseCourte({ v }: { readonly v: PropertyVisit }) {
  const a = v.property?.address;
  const texte = [a?.line, a?.city].filter(Boolean).join(', ');
  if (!texte) return null;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
      <MapPin className="size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
      {texte}
    </p>
  );
}
