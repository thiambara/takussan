/**
 * TCK-493 — la question d'orientation posée juste après la création du compte.
 *
 * **Ce qu'elle remplace.** `OAuthProvisioningService::provision()` crée un
 * compte sans aucun profil ; le callback OAuth redirigeait ensuite en dur vers
 * `/app`, c'est-à-dire un tableau de bord qui n'affiche rien et ne demande rien.
 * Le chemin e-mail, lui, passait au moins par une étape — et l'asymétrie était
 * le point : le parcours le plus court menait au plus vide.
 *
 * ⚠ **Toute la décision « faut-il poser la question ? » vit ICI, et nulle part
 * ailleurs.** Les quatre chemins d'inscription redirigent inconditionnellement
 * vers cette page, qui renvoie plus loin quand elle n'a rien à demander. Répartir
 * ce jugement sur quatre appelants serait le motif que ce dépôt paie depuis
 * TCK-329 : une règle recopiée est juste le jour où on l'écrit.
 *
 * TCK-2608 — la question devient TROIS portes, un geste (`Orientation`). La page monte la coque
 * d'entrée elle-même, SANS sortie : chaque écran de l'orientation déclare sa barre (« Plus tard »,
 * « Passer », « ← Retour »), et la marque reste la sortie vers le site.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { getMyProfilesAction } from '@/app/actions/profiles';
import { CoqueDEntree } from '@/components/entree/CoqueDEntree';
import { libellesDeLaCoque } from '@/components/entree/libelles-de-la-coque';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { EtapePrenom } from '@/components/onboarding/EtapePrenom';
import { Orientation } from '@/components/onboarding/orientation/Orientation';
import { apiFetch } from '@/lib/api';
import { origineSite } from '@/lib/config-publique';
import { getNotificationPreferences } from '@/lib/notification-preferences';
import { canalWhatsAppDuChercheur, ecranAReprendre } from '@/lib/orientation';
import { formaterTelephone } from '@/lib/phone';
import { fetchPublicAlertChannels } from '@/lib/queries/public-search-alerts';
import {
  avecRedirection,
  DESTINATION_PAR_DEFAUT,
  destinationInterne,
  doitPoserLaQuestionDIntention,
  estUneDestinationExplicite,
} from '@/lib/redirection-interne';
import { getToken } from '@/lib/session';
import { prenomDe } from '@/lib/identite';
import type { User } from '@/types/user';

export const dynamic = 'force-dynamic';

/** Les pastilles de quartier du chercheur : les plus fournis de Dakar, comme la maquette (huit, puis « Autre »). */
const QUARTIERS_SUGGERES = 8;
const VILLE_DES_QUARTIERS = 'Dakar';
/** Les rôles qu'une invitation peut proposer (`invitationAccept.roles`), dits par la carte « Rejoindre ». */
const ROLES_D_INVITATION = ['owner', 'tenant', 'agent', 'agent_senior', 'agent_manager', 'agency_admin', 'service_provider', 'super_admin', 'autre'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.intention');
  return { title: t('metaTitle') };
}

async function quartiersSuggeres(): Promise<string[]> {
  try {
    const reponse = await apiFetch<{ data: readonly { value: string | null; count: number }[] }>(
      `/public/properties/neighborhoods?city=${VILLE_DES_QUARTIERS}`,
    );
    return [...reponse.data]
      .filter((q): q is { value: string; count: number } => Boolean(q.value) && q.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, QUARTIERS_SUGGERES)
      .map((q) => q.value);
  } catch {
    // Sans suggestions, « Autre » reste : la question se pose quand même.
    return [];
  }
}

/** L'interrupteur WhatsApp du chercheur : la règle est `canalWhatsAppDuChercheur` (`lib/orientation.ts`). */
async function canalWhatsApp(token: string, user: User | null): Promise<{ numero: string } | null> {
  if (!user?.phone) return null;
  try {
    const [canaux, preferences] = await Promise.all([fetchPublicAlertChannels(), getNotificationPreferences(token)]);
    return canalWhatsAppDuChercheur(canaux, preferences.preferences, user.phone, formaterTelephone);
  } catch {
    return null;
  }
}

export default async function PageDIntention({
  searchParams,
}: {
  readonly searchParams: Promise<{ redirect?: string; etape?: string }>;
}) {
  // TCK-2598 — l'intention de la barre de la coque : le compte vient d'être créé, deux écrans au plus.
  const tCoque = await getTranslations('coqueDEntree');
  const { redirect: brute, etape } = await searchParams;
  // Le filtre est PARTAGÉ avec le callback OAuth (`lib/redirection-interne.ts`) :
  // cette page reçoit le paramètre de quatre chemins d'inscription, et un
  // contrôle de sécurité recopié n'est corrigé qu'à un seul endroit.
  const demandee = destinationInterne(brute, '');
  const apres = demandee || DESTINATION_PAR_DEFAUT;

  const token = await getToken();
  if (!token) {
    // TCK-624 — la destination survit : la connexion ramène ici, avec elle.
    redirect(avecRedirection('/auth/login', demandee));
  }

  const user = await getMeAction();
  const prenom = prenomDe(user);

  // TCK-624 — la PORTE UNIQUE de sortie de l'authentification. Elle demande ce qui manque, dans
  // l'ordre : un prénom (un compte ouvert par téléphone ou par OAuth n'en a pas), puis — seulement
  // si la destination ne dit pas déjà ce que la personne vient faire — l'orientation.
  if (!prenom) {
    // TCK-2608 — le titre est dans l'écran (maquette a-0), plus dans la coque.
    return (
      <OnboardingShell intention={tCoque('compteCree')} pas={1} total={2} largeur="etroite">
        <EtapePrenom />
      </OnboardingShell>
    );
  }

  const profils = await getMyProfilesAction();

  // La règle est dans `lib/redirection-interne.ts` pour être éprouvable sans
  // monter un composant serveur : c'est ce qui rend AC5 mesuré et non raisonné.
  const listeDesProfils = profils.ok ? profils.data.data : [];
  const intention = user?.preferences?.entry_intent;
  // TCK-2608 — la question, OU l'écran de l'orientation à reprendre (`?etape=`) : une server action
  // qui pose un cookie re-rend cette page, réponse déjà écrite (cf. `ecranAReprendre`).
  const ecran = estUneDestinationExplicite(demandee)
    ? null
    : doitPoserLaQuestionDIntention(intention, listeDesProfils)
      ? // La porte pro du site (`PublierSansCompte`, après la connexion) : l'écran du professionnel d'emblée.
        etape === 'pro'
        ? 'pro'
        : 'portes'
      : ecranAReprendre(etape, intention, listeDesProfils.some((p) => typeof p.agency_id === 'number'));
  if (!ecran) {
    redirect(apres);
  }

  const [libelles, quartiers, whatsapp, tInvitation] = await Promise.all([
    libellesDeLaCoque(),
    quartiersSuggeres(),
    canalWhatsApp(token, user),
    getTranslations('invitationAccept'),
  ]);

  return (
    <CoqueDEntree libelles={libelles} titre={tCoque('compteCree')} densiteDesChamps>
      <Orientation
        ecranInitial={ecran}
        ecrireProfessionnel={ecran === 'pro' && intention !== 'professional'}
        prenom={prenom}
        apres={apres}
        marque={libelles.marque}
        quartiersSuggeres={quartiers}
        whatsapp={whatsapp}
        compte={{
          telephone: user?.phone ?? null,
          telephoneVerifie: Boolean(user?.phone_verified_at),
          origineDuSite: origineSite(),
          roles: Object.fromEntries(ROLES_D_INVITATION.map((r) => [r, tInvitation(`roles.${r}`)])),
        }}
      />
    </CoqueDEntree>
  );
}
