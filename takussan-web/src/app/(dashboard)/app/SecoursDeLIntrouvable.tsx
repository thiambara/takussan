'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { History } from 'lucide-react';

import { useContexteDuMenuDeLaCoque } from '@/components/layout/contexte-du-menu-de-la-coque';
import { useOptionsDeLaPalette } from '@/components/layout/PaletteDeCommandes';
import { useCheminsRecents } from '@/components/layout/RecentsDeLaBarre';
import type { ParametresDuMenu } from '@/components/layout/useMenuDeLEspace';
import { useCurrentLocale } from '@/i18n/hooks';
import { hrefLocalise } from '@/i18n/navigation';
import { chercherDansLaPalette, type OptionDeLaPalette } from '@/lib/navigation/palette';

/** Maquette `app-coque`, « Page introuvable » : quatre récents, puis quatre entrées du menu. */
const RECENTS_PROPOSES = 4;
const ENTREES_PROPOSEES = 4;

interface ListeDeSecoursProps {
  /** L'`id` du champ que `CorpsDeLIntrouvable` rend au serveur. */
  readonly idChamp: string;
  readonly idListe: string;
}

/**
 * TCK-2619 — « Aller à… » OUVERT dans la page introuvable, sa moitié CLIENT : sous le champ (rendu au
 * serveur, `CorpsDeLIntrouvable`), à vide les récents puis quatre entrées du menu ; à la saisie, les
 * pages qui répondent — mêmes mots, même index que la palette (`useOptionsDeLaPalette`). Des LIENS, pas
 * une liste d'options : la page n'est pas un dialogue, on y circule à la tabulation, et Entrée dans le
 * champ ouvre la première.
 *
 * Hors de la coque (aucun menu à lire), rien : le champ reste seul.
 */
export function ListeDeSecours(props: ListeDeSecoursProps) {
  const contexte = useContexteDuMenuDeLaCoque();
  return contexte ? <Recherche contexteDuMenu={contexte} {...props} /> : null;
}

function Recherche({ contexteDuMenu, idChamp, idListe }: ListeDeSecoursProps & { readonly contexteDuMenu: ParametresDuMenu }) {
  const t = useTranslations('dashboard.notFound');
  const tPalette = useTranslations('nav.palette');
  const router = useRouter();
  const locale = useCurrentLocale();
  const [saisie, setSaisie] = useState('');
  const recents = useCheminsRecents(contexteDuMenu.user.id);
  // Des pages seulement : la bascule d'espace reste à la palette (elle a sa confirmation d'état).
  const options = useOptionsDeLaPalette(contexteDuMenu, { actif: true, recents }).filter((o) => o.cible.type === 'lien');
  const requete = saisie.trim();

  const proposees: OptionDeLaPalette[] = (() => {
    if (requete !== '') return chercherDansLaPalette(options, requete);
    const recentes = options.filter((o) => o.groupe === 'recents').slice(0, RECENTS_PROPOSES);
    const vues = new Set(recentes.map((o) => (o.cible.type === 'lien' ? o.cible.href : '')));
    // Le menu, dans son ordre, sans l'accueil (c'est le bouton de retour) ni ce qui est déjà récent.
    const entrees = options
      .filter((o) => o.groupe === 'aller-a' && o.cible.type === 'lien' && o.cible.href !== '/app' && !vues.has(o.cible.href))
      .slice(0, ENTREES_PROPOSEES);
    return [...recentes, ...entrees];
  })();
  const hrefDe = (o: OptionDeLaPalette) =>
    o.cible.type === 'lien' ? (o.cible.publique ? hrefLocalise(o.cible.href, locale) : o.cible.href) : '/app';

  const ouvrirLaPremiere = useEffectEvent(() => {
    const premiere = proposees[0];
    if (premiere) router.push(hrefDe(premiere));
  });

  // Le champ est rendu au serveur, hors de React : on l'écoute. Ce qui a été tapé AVANT l'hydratation
  // est repris au branchement.
  useEffect(() => {
    const champ = document.getElementById(idChamp);
    if (!(champ instanceof HTMLInputElement)) return;
    const lire = () => setSaisie(champ.value);
    const envoyer = (event: Event) => {
      event.preventDefault();
      ouvrirLaPremiere();
    };
    champ.addEventListener('input', lire);
    champ.form?.addEventListener('submit', envoyer);
    if (champ.value !== '') queueMicrotask(lire);
    return () => {
      champ.removeEventListener('input', lire);
      champ.form?.removeEventListener('submit', envoyer);
    };
  }, [idChamp]);

  return (
    <>
      <p role="status" className="sr-only">
        {requete === '' ? '' : tPalette('resultats', { count: proposees.length })}
      </p>
      {proposees.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left text-sm text-muted-foreground">
          {tPalette('aucun', { q: requete })}
        </p>
      ) : (
        <ul
          id={idListe}
          data-slot="secours-de-l-introuvable"
          aria-label={tPalette('titre')}
          className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-left lg:grid lg:grid-cols-2 lg:divide-y-0"
        >
          {proposees.map((o) => {
            const Icone = o.groupe === 'recents' ? History : o.icone;
            return (
              <li key={o.cle}>
                <Link
                  href={hrefDe(o)}
                  className="flex h-12 items-center gap-3 px-3.5 text-corps text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:h-10 lg:text-sm"
                >
                  <Icone className="size-icone shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{o.libelle}</span>
                  {o.groupe === 'recents' ? <span className="shrink-0 text-xs text-muted-foreground">{t('recent')}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
