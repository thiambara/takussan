'use client';

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { User } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { EnTeteMobile } from './EnTeteMobile';
import { FournisseurDEnTete, useDeclarationDEnTete } from './en-tete-de-la-coque';
import { formeDeLaRoute, parentDeLaRoute, titreDeLaRoute } from '@/lib/navigation/en-tete-de-la-coque';
import { useMenuDeLEspace } from './useMenuDeLEspace';
import { AppSidebar } from './AppSidebar';
import { BarreDOnglets } from './BarreDOnglets';
import { EMPLACEMENT_BARRE_D_ACTION } from '@/components/ui/barre-d-action';
import { PaletteDeCommandes, RetenirLaPageRecente } from './PaletteDeCommandes';
import { useRaccourciDeLaPalette } from './usePaletteDeCommandes';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { BandeauxDuSite } from '@/components/announcements/BandeauxDuSite';
import { LienEvitement } from '@/components/shared/LienEvitement';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';
import { ImpersonationBanner } from '@/components/admin/super/ImpersonationBanner';
import { AgencySuspendedBanner } from '@/components/agency/AgencySuspendedBanner';
import { AgencyStandardWelcomeWizard } from '@/components/agency/AgencyStandardWelcomeWizard';
import type { MarqueurAccueilAgence } from '@/hooks/useAgencyStandardWelcomeOnce';
import { AgentWelcomeWizard } from '@/components/agent/AgentWelcomeWizard';
import { CustomerWelcomeWizard } from '@/components/customer/CustomerWelcomeWizard';
import { MinimalProfileTriggerProvider } from '@/components/customer/MinimalProfileTriggerProvider';
import { OwnerWelcomeWizard } from '@/components/owner/OwnerWelcomeWizard';
import { TenantWelcomeWizard } from '@/components/tenant/TenantWelcomeWizard';
import { isAgencyAdmin, isAgent, isCustomerOnly, isOwner } from '@/lib/roles';
import { estPleinEcran, porteLaBarreDOnglets } from './plein-ecran';
import { EnveloppeDuContenu } from './PagePleineLargeur';
import { PreferencesDuMenuProvider } from './PreferencesDuMenu';
import { ContexteDuMenuDeLaCoque } from './contexte-du-menu-de-la-coque';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import { personaDeLaCoque } from '@/lib/navigation/personas';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';

interface AppShellProps {
  user: User;
  children: React.ReactNode;
  /**
   * TCK-267 — server-resolved flags consumed by the sidebar's
   * "Passer en pro" card. Computed in the dashboard layout so the
   * client tree doesn't have to fetch the agency on every navigation.
   */
  agencyIsStandard?: boolean;
  hasPendingUpgrade?: boolean;
  /** TCK-600 — l'agence du profil actif est suspendue : bandeau « lecture seule ». */
  agencySuspended?: boolean;
  /**
   * TCK-1766 (P136.03) — le marqueur d'accueil de l'agence, lu par le layout avec l'agence.
   * `undefined` quand le layout ne l'a pas lue : l'assistant ne s'ouvre pas.
   */
  agencyStandardWelcome?: MarqueurAccueilAgence;
  /** TCK-2477 — le type du profil actif, pour le persona du menu (ADR-0089). */
  typeProfilActif?: ProfileType | null;
  /**
   * TCK-2480 — le mode icônes de l'appareil, lu par le layout sur le cookie `menu_icones`. Absent
   * (tests) : `complet`, la barre de toujours.
   */
  modeIcones?: ModeIcones;
  /**
   * TCK-2483 (ADR-0089, amendement « modules par agence ») — les codes de module que l'agence du
   * profil actif masque, lus par le layout (`modulesMasquesDe`). Un fait de l'agence, passé à TOUT
   * lecteur du menu (barre, tiroir, onglets, palette) ; `composerMenu` décide à quel persona il
   * s'applique. Absent (tests) : aucun.
   */
  modulesMasques?: readonly string[];
}

/**
 * TCK-2617 — la coque, sous le fournisseur des déclarations d'en-tête : la page (rendue dans `<main>`)
 * déclare son titre, sa forme ou une conversation ouverte, et la coque — en-tête du téléphone, barre
 * d'onglets, attributs lus par `globals.css` — la lit. Les enfants (la page) sont le même élément d'un
 * rendu à l'autre : une déclaration ne re-rend pas la page.
 */
export function AppShell(props: AppShellProps) {
  return (
    <FournisseurDEnTete>
      <CoqueDeLApp {...props} />
    </FournisseurDEnTete>
  );
}

function CoqueDeLApp({
  user,
  children,
  agencyIsStandard,
  hasPendingUpgrade,
  agencySuspended = false,
  agencyStandardWelcome,
  typeProfilActif,
  modeIcones = 'complet',
  modulesMasques = [],
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations('nav.sidebar');
  // TCK-631 — le parcours de publication se montre sans la chrome de la console : il porte son
  // propre en-tête et sa propre sortie. Les bandeaux (impersonation, suspension, site) restent :
  // ils disent quelque chose sur la session, pas sur la navigation.
  const pathname = usePathname();
  const pleinEcran = estPleinEcran(pathname);
  // TCK-2617 — la forme de l'en-tête du téléphone : celle de la route, que la page précise. Une
  // conversation ouverte (un ÉTAT de `/app/messages`) et un formulaire plein écran n'ont pas de barre
  // d'onglets — sous `md` seulement : la colonne, la palette et les récents restent (≠ `pleinEcran`).
  const declaration = useDeclarationDEnTete();
  const forme = declaration.forme ?? formeDeLaRoute(pathname);
  // TCK-2635 — et une section du profil à enregistrer : sa barre « Enregistrer » prend la place des onglets.
  const sansOnglets = forme === 'plein-ecran' || declaration.conversation === true || declaration.formulaire === true;
  // TCK-2481 — sous `md`, la barre d'onglets ; « Menu » y ouvre le tiroir, qui lui rend le focus.
  const barreDOnglets = porteLaBarreDOnglets(pathname) && !sansOnglets;
  const boutonMenu = useRef<HTMLButtonElement>(null);
  // TCK-2481 (revue, M1) — le tiroir se referme-t-il sur une NAVIGATION ? Posé par `onNavigate`, lu
  // par `finalFocus` : « Menu » est le dernier focalisable du document, y rendre le focus après le
  // choix d'une page laisserait toute la nouvelle page AVANT lui. Un ref et non `closeType` : Base UI
  // n'y passe que la modalité (souris, clavier…), jamais la raison de la fermeture.
  const fermeParUnLien = useRef(false);
  const focusAuRetour = () => {
    if (fermeParUnLien.current) {
      fermeParUnLien.current = false;
      return false; // ne rien forcer : le focus repart du début du document, comme avec l'ancien burger
    }
    return boutonMenu.current; // Échap, voile : « Menu » (arbitrage 10)
  };
  // TCK-2482 — la palette de commandes : une par coque, ouverte par ⌘K / Ctrl K, par « Aller à » de la
  // colonne ou par le bouton de l'en-tête mobile (TCK-2491).
  // A7 — l'élément focalisé à l'ouverture (le bouton touché, que Safari iOS ne focalise pas) reçoit le
  // focus à la fermeture ; la palette retombe sur le défaut de Base UI s'il a quitté le DOM.
  const [paletteOuverte, setPaletteOuverte] = useState(false);
  const retourDuFocus = useRef<HTMLElement | null>(null);
  const changerPalette = (ouverte: boolean, depuis?: HTMLElement | null) => {
    if (ouverte) {
      const focalise = document.activeElement;
      retourDuFocus.current = depuis ?? (focalise instanceof HTMLElement ? focalise : null);
    }
    setPaletteOuverte(ouverte);
  };
  // A6 — rien en plein écran : le parcours porte sa propre sortie, le navigateur garde son raccourci.
  useRaccourciDeLaPalette({ actif: !pleinEcran, ouverte: paletteOuverte, changer: changerPalette });
  // A17 — les mêmes arguments que ceux du menu de la barre (`AppSidebar`, `BarreDOnglets`), pour la
  // palette ET l'écrivain de ses récents — TCK-2483 : les modules masqués compris.
  const contexteDuMenu = { user, agencyIsStandard, typeProfilActif, agencySuspended, modulesMasques };
  // TCK-253 — Customer-only onboarding surfaces. Gated server-side via the
  // SSR-resolved roles so we never paint the welcome modale (or arm the
  // deferred profile sheet) for agents / owners / admins.
  // TCK-492 — `isCustomerOnly` : `customer` étant devenu le plancher,
  // `isCustomer` aurait armé la modale de bienvenue acheteur pour les agents,
  // bailleurs et administrateurs — c'est-à-dire exactement ce que le
  // commentaire ci-dessus dit vouloir éviter.
  const customerOnboardingActive = isCustomerOnly(user.roles);
  // TCK-1477 (P101.03) — une file : le parcours du locataire attend que celui du client soit
  // réglé (déjà vu, ou fermé). Montés ensemble, les deux `Dialog` modaux s'ouvraient l'un sur
  // l'autre (mesuré le 2026-10-21). Décision du porteur : le client d'abord, le locataire ensuite.
  const [customerWelcomeSettled, setCustomerWelcomeSettled] = useState(false);
  // TCK-257 — Owner welcome modale, mounted once on /app for users
  // with the `owner` role. Independent of the customer wizard (its
  // welcome key is distinct), so an owner who is also a customer sees
  // both modales (each gated by its own `welcome-seen` row).
  const ownerWelcomeActive = isOwner(user.roles);
  // TCK-259 — Agent welcome modale, mounted once on /app for users with
  // the `agent` role (or its senior / manager flavours, both surfaced
  // through the same `agent` spatie role from the invite acceptance).
  const agentWelcomeActive = isAgent(user.roles);
  // TCK-269 — Agency-admin welcome modale fired once after a successful
  // `individual → standard` upgrade. Strict `agency_admin` check excludes
  // super-admin impersonation. The hook itself only opens the modale when
  // `agency.metadata.welcome.standard_unlocked_at` is present, so admins
  // of always-standard agencies never see it.
  const agencyStandardWelcomeActive = isAgencyAdmin(user.roles);
  // TCK-2480 — le persona AFFICHÉ, par la même formule que la barre (`personaDeLaCoque`) : la section
  // « Menu » du profil réinitialise celui-là, jamais un voisin.
  const accesAdmin = useAccesAdminOuRepli({ roles: user.roles, agencyId: user.agency_id, agencyIsStandard });
  const persona = personaDeLaCoque({
    roles: user.roles,
    typeProfilActif,
    espaceIndividuel: accesAdmin.espaceIndividuel,
    agencyIsStandard,
  });

  /**
   * TCK-503 — `h-dvh`, jamais `h-screen`. Relevé au navigateur le 2026-08-31, à 390 px : le
   * document de `/app/*` ne défile NULLE PART (`scrollHeight - clientHeight === 0`), parce que
   * cette boîte fait exactement la hauteur du viewport et que c'est le `<main>` qui absorbe le
   * débord. Or sur un téléphone, la barre d'adresse ne se rétracte QUE sur un défilement du
   * DOCUMENT : elle reste donc déployée pour toute la vie de la page, pendant que `100vh`
   * continue de valoir la hauteur SANS elle. La bande du bas — exactement la hauteur de la
   * barre — est hors de portée, et l'`overflow-y-auto` du `<main>` ne l'absorbe pas : arrivé au
   * bout de son défilement, le dernier pixel de contenu est à `100vh`, donc sous le pli.
   * Mesuré sur `/app/properties` : la pagination est à 24 px de ce bord ; sur
   * `/app/profile`, le dernier bouton est à 86 px.
   *
   * `dvh` suit le viewport réellement visible. Même correction que TCK-501 un cran plus bas ;
   * `md:h-full` sur la barre latérale continue de résoudre, `h-dvh` restant une hauteur DÉFINIE.
   */
  return (
    <MinimalProfileTriggerProvider roles={user.roles}>
      {/* TCK-2480 — les préférences du menu (épingles, replis, mode icônes), tenues pour les DEUX
          montages de la barre (fixe et tiroir) et la section « Menu » du profil. */}
      <PreferencesDuMenuProvider
        navigationInitiale={user.preferences?.navigation}
        persona={persona}
        modeIconesInitial={modeIcones}
      >
        {/* TCK-2481 — `data-barre-onglets` : la coque porte la barre d'onglets (sous `md`).
            TCK-2685 — `data-portee-app` : la portée `/app` (trait d'icône, densité…), lue par
            `:root:has(…)` dans `globals.css`, et qui atteint donc aussi les portails. */}
        {/* TCK-2617 — `data-forme-en-tete` : sous `md`, une racine a SON H1 dans l'en-tête, celui du
            contenu est masqué (`globals.css`) — un seul H1 exposé à toute largeur. */}
        <div
          className="flex h-dvh flex-col bg-background"
          data-barre-onglets={barreDOnglets ? '' : undefined}
          data-forme-en-tete={pleinEcran ? undefined : forme}
          data-portee-app=""
        >
          {/* TCK-905 (P31.04) — avant la bannière, l'en-tête mobile et la colonne. */}
          <LienEvitement />
          {/* TCK-600 (ADR-0055) — la session d'impersonation, lue sur le serveur du front : rien
              ne s'affiche hors session. Au-dessus de la barre : elle ne défile pas avec la page. */}
          <ImpersonationBanner />
          {agencySuspended ? <AgencySuspendedBanner /> : null}
          {/* TCK-2491 (ADR-0090 §2, §8) — plus de barre du haut : dès `md`, la colonne porte la marque, la
              cloche et le compte ; sous `md`, une en-tête compacte (marque, « Aller à », cloche). */}
          {pleinEcran || declaration.conversation ? null : (
            <EnTeteDeLaCoque
              contexteDuMenu={contexteDuMenu}
              forme={forme}
              libelleRole={t(`personas.${persona}`)}
              onOuvrirPalette={(depuis) => changerPalette(true, depuis)}
            />
          )}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {pleinEcran ? null : (
              <>
                <div className="hidden md:block md:h-full md:shrink-0">
                  <AppSidebar
                    user={user}
                    agencyIsStandard={agencyIsStandard}
                    hasPendingUpgrade={hasPendingUpgrade}
                    typeProfilActif={typeProfilActif}
                    agencySuspended={agencySuspended}
                    modulesMasques={modulesMasques}
                    onOuvrirPalette={(depuis) => changerPalette(true, depuis)}
                  />
                </div>
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                  {/* TCK-2481 — `finalFocus` explicite : au doigt, Safari iOS ne focalise pas le bouton
                      touché, et le défaut de Base UI (« l'élément focalisé à l'ouverture ») rendrait
                      le focus à `body`. Sauf fermeture par un lien (revue, M1) : `focusAuRetour`. */}
                  {/* TCK-2490 — `bg-background` : la colonne pose son lin (`--muted` à 45 %) sur le MÊME fond
                      que sur la coque fixe, et ses contrastes mesurés valent aussi dans le tiroir. */}
                  <SheetContent side="left" className="bg-background p-0" aria-label={t('navLabel')} finalFocus={focusAuRetour}>
                    <AppSidebar
                      user={user}
                      onNavigate={() => {
                        fermeParUnLien.current = true;
                        setSidebarOpen(false);
                      }}
                      agencyIsStandard={agencyIsStandard}
                      hasPendingUpgrade={hasPendingUpgrade}
                      typeProfilActif={typeProfilActif}
                      agencySuspended={agencySuspended}
                      modulesMasques={modulesMasques}
                      tiroir
                      // TCK-2490 — « Aller à » depuis le tiroir : le tiroir se ferme, la palette s'ouvre, et
                      // c'est « Menu » (qui a ouvert le tiroir) qui reprend le focus à sa fermeture.
                      onOuvrirPalette={() => {
                        fermeParUnLien.current = true;
                        setSidebarOpen(false);
                        changerPalette(true, boutonMenu.current);
                      }}
                    />
                  </SheetContent>
                </Sheet>
              </>
            )}
            <main
              id={CONTENU_PRINCIPAL_ID}
              // `-1` : hors du parcours de tabulation, mais cible focalisable du lien d'évitement.
              tabIndex={-1}
              // TCK-2804 — sous `md`, des onglets de page collent en haut du `<main>` (`ONGLETS_DE_PAGE`) : le
              // défilement vers une ancre ou un focus s'arrête sous eux (48 px, rangée de 45 à 47), pas dessous.
              className="relative min-h-0 flex-1 overflow-y-auto bg-background focus:outline-none max-md:has-[[data-onglets-de-page]]:scroll-pt-12"
            >
              {/* TCK-572 — les bandeaux du site DANS la zone qui défile. Rendus par le layout racine,
                  ils précédaient cette coque `h-dvh` : le document débordait de leur hauteur (183 px
                  à 320, mesuré) et la maintenance, collante, recouvrait la barre haute une fois
                  défilé. Ici ils défilent avec la page et la coque tient l'écran. */}
              <BandeauxDuSite emplacement="page" />
              {/* TCK-2691 (ADR-0106, C1 et C2) — la marge des pages : `px-8` dès `lg` (28,8 px, largeur
                  utile de la maquette), et rien au téléphone pour une page qui adopte la pleine largeur. */}
              {/* TCK-2619 — le menu de l'espace à la portée des pages (la page introuvable y cherche). */}
              <ContexteDuMenuDeLaCoque.Provider value={contexteDuMenu}>
                <EnveloppeDuContenu>{children}</EnveloppeDuContenu>
              </ContexteDuMenuDeLaCoque.Provider>
            </main>
          </div>
          {/* TCK-2689 — l'emplacement de la barre d'action collante (`ui/barre-d-action.tsx`), qu'une page
              y rend en portail : ENTRE la rangée du contenu et la barre d'onglets, en flux — le
              `<main>` rétrécit de sa hauteur, rien ne passe dessous. `contents` : vide, il ne prend
              aucune place. Sans barre d'onglets, la barre est le bas de l'écran et ajoute la zone sûre.
              Emplacement provisoire : TCK-2617 le reprend. */}
          <div
            id={EMPLACEMENT_BARRE_D_ACTION}
            className="contents"
            data-bas-de-l-ecran={barreDOnglets ? undefined : ''}
          />
          {/* TCK-2482 — DANS `PreferencesDuMenuProvider` : le menu de la palette est celui de la barre
              (épingles comprises). Son contenu n'est monté que palette ouverte (A13). */}
          {/* A8 — les pages récentes, retenues sur l'appareil par compte ; jamais une page plein écran.
              Revue I3 — dans le fournisseur : dédoublonnées par entrée du menu RENDU. */}
          {pleinEcran ? null : (
            <RetenirLaPageRecente contexteDuMenu={contexteDuMenu} chemin={pathname} />
          )}
          {pleinEcran ? null : (
            <PaletteDeCommandes
              ouverte={paletteOuverte}
              onOuverteChange={(ouverte) => changerPalette(ouverte)}
              contexteDuMenu={contexteDuMenu}
              retourDuFocus={retourDuFocus}
            />
          )}
          {/* TCK-2481 (ADR-0089 §3) — la barre d'onglets, sous `md`. Enfant flex de la coque `h-dvh`
              et non `fixed` : le `<main>` rétrécit de sa hauteur exacte, et rien de la page ne passe
              dessous (TCK-503). Après le `<main>` dans le document comme à l'écran ; le lien
              d'évitement reste le premier focalisable. */}
          {/* TCK-2617 — sans onglets (conversation, formulaire), la barre ne rend que sa région `aria-live`
              des non-lus : l'annonce ne se tait pas parce qu'un fil est ouvert. */}
          {barreDOnglets || (sansOnglets && porteLaBarreDOnglets(pathname)) ? (
            <BarreDOnglets
              masquee={!barreDOnglets}
              user={user}
              agencyIsStandard={agencyIsStandard}
              typeProfilActif={typeProfilActif}
              agencySuspended={agencySuspended}
              modulesMasques={modulesMasques}
              menuOuvert={sidebarOpen}
              onOuvrirMenu={() => {
                fermeParUnLien.current = false;
                setSidebarOpen(true);
              }}
              refMenu={boutonMenu}
            />
          ) : null}
          {customerOnboardingActive ? (
            <CustomerWelcomeWizard onSettled={() => setCustomerWelcomeSettled(true)} />
          ) : null}
          {/* TCK-265 — per-lease welcome modale for tenants. TCK-1477 — montée seulement une fois
              le parcours client réglé : jamais deux fenêtres de bienvenue ouvertes ensemble. */}
          {customerOnboardingActive && customerWelcomeSettled ? <TenantWelcomeWizard /> : null}
          {ownerWelcomeActive ? <OwnerWelcomeWizard /> : null}
          {agentWelcomeActive ? <AgentWelcomeWizard /> : null}
          {agencyStandardWelcomeActive ? <AgencyStandardWelcomeWizard marqueur={agencyStandardWelcome} /> : null}
        </div>
      </PreferencesDuMenuProvider>
    </MinimalProfileTriggerProvider>
  );
}

/**
 * TCK-2617 — l'en-tête du téléphone, nourri par la route (forme, titre du menu, repli du retour) et
 * par la déclaration de la page, qui l'emporte. Le titre dérivé est rendu dès le serveur : une page
 * qui ne déclare rien n'est jamais sans titre, et celle qui déclare le même ne fait rien bouger.
 */
function EnTeteDeLaCoque({
  contexteDuMenu,
  forme,
  libelleRole,
  onOuvrirPalette,
}: {
  readonly contexteDuMenu: Parameters<typeof useMenuDeLEspace>[0];
  readonly forme: ReturnType<typeof formeDeLaRoute>;
  readonly libelleRole: string;
  readonly onOuvrirPalette: (depuis: HTMLElement) => void;
}) {
  const pathname = usePathname();
  const declaration = useDeclarationDEnTete();
  const { ctx, persona } = useMenuDeLEspace(contexteDuMenu);
  const t = useTranslations();
  const derive = titreDeLaRoute(pathname, ctx, persona);
  const titre = declaration.titre ?? (derive ? t(`${derive.espace}.${derive.cle}`) : null);
  return (
    <EnTeteMobile
      forme={forme}
      titre={titre}
      repli={declaration.repli ?? parentDeLaRoute(pathname)}
      action={declaration.action}
      actions={declaration.actions}
      etape={declaration.etape}
      sousTitre={declaration.sousTitre}
      droite={declaration.droite}
      compte={{ user: contexteDuMenu.user, libelleRole }}
      onOuvrirPalette={forme === 'racine' || forme === 'accueil' ? onOuvrirPalette : undefined}
    />
  );
}
