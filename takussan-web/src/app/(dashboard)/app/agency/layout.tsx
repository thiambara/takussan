import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { accesAdmin } from '@/lib/access/pages-admin-server';
import { isAdmin } from '@/lib/roles';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * La section d'agence de `/app` — l'administration d'une agence (TCK-649, ADR-0064 §2).
 *
 * Elle n'a PAS de coque à elle : c'est celle de `/app` (`AppShell`, montée par `app/layout.tsx`),
 * qui fournit déjà `AccesAdminProvider` — la barre y porte la section d'agence, dérivée de la table
 * des pages. Ce layout ne fait que deux choses :
 *
 *  1. **la garde du segment** — un compte qui n'a aucune page ici est renvoyé sur `/app`, là où la
 *     table renvoie un profil qui n'en a aucune (`garderPageAdmin`). Le rôle d'administration
 *     suffit ; sans lui, c'est la table qui décide, par capacité, délégations comprises
 *     (TCK-1412, P148.01) : un agent qui tient `team.invite` a la page Équipe.
 *     Chaque page reste gardée par SON chemin (`garderPageAdmin`, `check-pro-routes`) ; ce refus-ci
 *     est la défense en profondeur que portait le layout de l'ancienne console. Décidé dans un
 *     layout sans `loading.tsx` au-dessus de lui, il rend 307 (TCK-426) ;
 *  2. **la frontière de dictionnaire** de l'administration (ADR-0022, TCK-337) : ses pages adressent
 *     des espaces de noms que la frontière de `/app` ne sert pas. Ensemble CUMULÉ, cf.
 *     `src/i18n/IntlProvider.tsx` — sans lui, une clé manquante lève.
 *
 * ⚠ Aucun `loading.tsx` dans ce sous-arbre ni au-dessus : il effacerait le 307 de la garde de
 * chaque page (`app/__tests__/etats-de-route.test.ts`, TCK-649).
 */
export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const user = await getMeAction();
  if (!isAdmin(user.roles) && (await accesAdmin(user)).chemins.length === 0) redirect('/app');

  return (
    <IntlProvider messages={await messagesPour('(dashboard)/app/agency')}>{children}</IntlProvider>
  );
}
