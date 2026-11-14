import Link from 'next/link';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { hrefLocalise } from '@/i18n/navigation';
import { formatCurrency } from '@/lib/format';
import { rechercherBiensPublics } from '@/lib/queries/public-search';
import { cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';
import type { UserPreferences } from '@/types/user';

/**
 * TCK-595 → TCK-2625 — l'invitation à chercher selon l'intention, venue de « Ma situation »
 * (`/app/overview/tenant`, absorbée par l'accueil) sans rien perdre : la ville et l'intention du
 * profil (louer / acheter), quatre biens de la recherche publique existante (`city`,
 * `contract_type`), « Voir les annonces » vers la recherche. Sans ville connue, la recherche sans
 * filtre ; une panne de la recherche rend une rangée vide, jamais une erreur.
 *
 * Composant serveur : la lecture se fait au rendu de la page, comme dans « Ma situation ».
 */
type Invitation = {
  readonly ville: string | null;
  readonly contrat: 'rent' | 'sale';
  readonly biens: readonly PropertyListItem[];
};

export async function lireInvitationARechercher(preferences: UserPreferences | undefined, locale: Locale): Promise<Invitation> {
  const ville = preferences?.city?.trim() || null;
  const contrat = preferences?.search_intent === 'buy' ? 'sale' : 'rent';
  if (!ville) return { ville, contrat, biens: [] };
  const requete = new URLSearchParams({ city: ville, contract_type: contrat, per_page: '4' }).toString();
  const resultat = await rechercherBiensPublics(requete, locale);
  return { ville, contrat, biens: resultat?.data ?? [] };
}

export function InvitationARechercher({ invitation, locale, className }: { readonly invitation: Invitation; readonly locale: Locale; readonly className?: string }) {
  const t = useTranslations('dashboard.tenant');
  const { ville, contrat, biens } = invitation;
  const filtres = new URLSearchParams({ contract_type: contrat });
  if (ville) filtres.set('city', ville);
  const recherche = hrefLocalise(`/properties?${filtres.toString()}`, locale);
  const titre = ville ? t(contrat === 'sale' ? 'inviteBuyIn' : 'inviteRentIn', { city: ville }) : t('inviteSearch');
  return (
    <section aria-labelledby="invitation-a-rechercher" className={cn('rounded-2xl border border-dashed border-border bg-card p-5', className)} data-slot="invitation-a-rechercher">
      <h2 id="invitation-a-rechercher" className="text-corps font-semibold text-foreground">
        {titre}
      </h2>
      {biens.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {biens.map((bien) => (
            <li key={bien.id}>
              <Link
                href={hrefLocalise(`/properties/${bien.slug}`, locale)}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
              >
                <span className="min-w-0 truncate text-foreground">{bien.title}</span>
                <span className="shrink-0 font-semibold text-foreground tabular-nums">{formatCurrency(bien.price, locale, { currency: bien.currency ?? 'XOF' })}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link href={recherche} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-4 w-full sm:w-auto')}>
        <Search className="size-4" aria-hidden="true" />
        {t('inviteCta')}
      </Link>
    </section>
  );
}
