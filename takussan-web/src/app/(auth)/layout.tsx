import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { ArriveeEnHaut } from '@/components/auth/ArriveeEnHaut';
import { ReinitialiserSessionClient } from '@/components/auth/ReinitialiserSessionClient';
import { RetourAuth } from '@/components/auth/RetourAuth';
import { CoqueDEntree } from '@/components/entree/CoqueDEntree';
import { libellesDeLaCoque } from '@/components/entree/libelles-de-la-coque';

/**
 * Layout des écrans de connexion — la coque d'entrée commune (TCK-2598).
 *
 * Applied to all routes inside `(auth)` (login, register, forgot-password,
 * reset-password, verify-email, oauth). Routes stay on `/auth/...` URLs —
 * the parentheses make the segment URL-invisible while still grouping the
 * layout.
 *
 * TCK-2598 — plus de photo de villa ni de slogan : le bandeau du téléphone prenait 236 px et
 * poussait « Recevoir un code » sous le clavier (594 px mesurés, audit 02-entree § 1) ; au bureau, la
 * villa occupait 45 % de l'écran sans rien dire de ce que la personne venait faire. Sans intention,
 * la marque seule ; l'objet de l'intention (le bien quitté) est le panneau de TCK-2604.
 *
 * SEO: noindex for all auth pages — these are transactional.
 */
// `metadata` est une constante figée à la compilation : elle ne peut pas voir la locale de la
// requête. `generateMetadata` le peut, et c'est la seule primitive qui traduise un titre d'onglet.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: {
      template: t('template'),
      default: t('default'),
    },
    robots: { index: false, follow: false },
  };
}

/**
 * i18n (TCK-337) : frontière de dictionnaire du groupe `(auth)`. Les libellés de la coque sont lus
 * ici, par le serveur (`libellesDeLaCoque`), et passés en props : la frontière ne grossit pas.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const libelles = await libellesDeLaCoque();
  return (
    <IntlProvider messages={await messagesPour('(auth)')}>
      {/* TCK-509 — arriver ici avec une session côté client : le serveur dit si elle est périmée. */}
      <ReinitialiserSessionClient />
      {/* TCK-568 — arriver d'une page défilée ouvrait l'écran défilé, le retour hors de la vue. */}
      <ArriveeEnHaut />
      {/* TCK-568 — un retour vers la page quittée (la recherche, typiquement) : le logo seul menait
          à l'accueil. La flèche unique au téléphone, la pastille au bureau ; même destination. */}
      <CoqueDEntree
        libelles={libelles}
        densiteDesChamps
        retour={{
          telephone: <RetourAuth forme="fleche" libelle={libelles.retourAuSite} />,
          bureau: (
            <RetourAuth
              libelle={libelles.retourAuSite}
              className="h-9 border border-border bg-card px-3.5 text-foreground hover:bg-muted"
            />
          ),
        }}
      >
        {children}
      </CoqueDEntree>
    </IntlProvider>
  );
}
