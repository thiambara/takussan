'use client';

import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { useAuth } from '@/context/AuthContext';
import { requeteDesCriteres } from '@/lib/favoris-suivi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useMarquerRechercheVue, useNouveauxDesRecherches, useSavedSearchesQuery, type NouveauxDUneRecherche, type SavedSearch } from '@/lib/queries/saved-searches';

import { Disque, TitreBloc, TitreColonne } from '../pieces';

/** Les recherches montrées sur l'accueil ; « Toutes » mène à la page des recherches au-delà. */
export const RECHERCHES_DE_L_ACCUEIL = 3;

/**
 * TCK-2625 (maquette `app-accueil` a, écran « Client ») — « Vos recherches » : les recherches
 * sauvegardées et leurs biens nouveaux, lus comme la page des favoris les lit (TCK-2508 :
 * `useSavedSearchesQuery` + `useNouveauxDesRecherches`, une requête par recherche montrée) : les trois
 * premières, dans l'ordre de leur page, celles qui ont des nouveautés devant. L'ouvrir la marque vue,
 * comme sur sa page.
 *
 * Rien à rendre sans recherche, ni en chargement ou en échec : le bloc est un complément de l'accueil,
 * l'invitation à chercher reste dessous.
 *
 * Sous le nom, la ligne COURTE de la maquette (« Moins de 200 000 F · alerte WhatsApp ») : le plafond
 * de prix des critères et le canal de l'alerte tel que l'API le sert (`alert_channels`, TCK-599 —
 * jamais une supposition). Pas le résumé complet des favoris (`useResumeDeCriteres`) : il fait servir
 * à l'accueil les espaces `search` et `property` entiers, +11 points du dictionnaire pour une ligne
 * (mesuré par `check-i18n-namespaces.mjs --report`, 47 → 58 %).
 */
export function VosRecherches({ bureau = false }: { readonly bureau?: boolean }) {
  const t = useTranslations('accueil.client.recherches');
  const { token } = useAuth();
  const lues = useSavedSearchesQuery({ enabled: !!token });
  const toutes = lues.data?.data ?? [];
  const montrees = toutes.slice(0, RECHERCHES_DE_L_ACCUEIL);
  const nouveaux = useNouveauxDesRecherches(montrees);
  if (montrees.length === 0) return null;
  const ordonnees = [...montrees].sort((a, b) => (nouveaux.get(b.id)?.total ?? 0) - (nouveaux.get(a.id)?.total ?? 0));

  return (
    <section aria-labelledby={bureau ? 'client-recherches-bureau' : 'client-recherches'} className="space-y-2" data-slot="vos-recherches">
      <div className="flex items-baseline justify-between max-md:pr-4">
        {bureau ? <TitreColonne id="client-recherches-bureau">{t('titre')}</TitreColonne> : <TitreBloc id="client-recherches">{t('titre')}</TitreBloc>}
        {toutes.length > montrees.length ? (
          <Link href="/app/saved-searches" className="rounded text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
            {t('toutes')}
          </Link>
        ) : null}
      </div>
      <ul className="space-y-3 max-md:px-4">
        {ordonnees.map((r) => (
          <LigneDeRecherche key={r.id} recherche={r} nouveaux={nouveaux.get(r.id)} />
        ))}
      </ul>
    </section>
  );
}

function LigneDeRecherche({ recherche, nouveaux }: { readonly recherche: SavedSearch; readonly nouveaux: NouveauxDUneRecherche | undefined }) {
  const t = useTranslations('accueil.client.recherches');
  const resume = useResumeCourt();
  const marquerVue = useMarquerRechercheVue();
  const qs = requeteDesCriteres(recherche.criteria ?? {});
  const total = nouveaux?.total ?? 0;
  const ouvrir = () => marquerVue(recherche.id);

  return (
    <li>
      <LienLocalise
        href={`/properties${qs ? `?${qs}` : ''}`}
        onClick={ouvrir}
        onAuxClick={(e: React.MouseEvent) => {
          if (e.button === 1) ouvrir();
        }}
        className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring"
        data-slot="ligne-de-recherche"
      >
        <Disque icone={Search} ton="neutre" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-corps font-medium">{recherche.name}</span>
          {resume(recherche) ? <span className="block truncate text-ui text-muted-foreground">{resume(recherche)}</span> : null}
        </span>
        {total > 0 ? (
          <span className="inline-flex h-6 flex-none items-center rounded-full bg-primary px-2 text-xs font-semibold tabular-nums text-primary-foreground" data-slot="compte-nouveaux">
            {t('nouveaux', { n: total })}
          </span>
        ) : null}
        <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </LienLocalise>
    </li>
  );
}

/** Le canal le plus parlant d'abord : WhatsApp, puis l'e-mail, puis l'application seule. */
const CANAUX = ['whatsapp', 'email', 'inapp'] as const;

/** « Moins de {prix} · alerte {canal} » ; `null` quand ni plafond ni canal n'est connu. */
function useResumeCourt() {
  const t = useTranslations('accueil.client.recherches');
  const f = useFormatteurs();
  return (recherche: SavedSearch): string | null => {
    const plafond = Number(recherche.criteria?.price_max);
    const prix = Number.isFinite(plafond) && plafond > 0 ? t('moinsDe', { prix: f.montantCourt(plafond, 'XOF') }) : null;
    const canaux = recherche.alert_channels;
    const canal = canaux === undefined ? null : canaux.length === 0 ? 'coupee' : (CANAUX.find((c) => canaux.includes(c)) ?? null);
    const morceaux = [prix, canal ? t(`alerte.${canal}`) : null].filter(Boolean);
    return morceaux.length > 0 ? morceaux.join(' · ') : null;
  };
}
