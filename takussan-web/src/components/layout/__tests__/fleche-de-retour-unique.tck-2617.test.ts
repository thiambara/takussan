import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TCK-2617 (demande du porteur, README de l'audit § Maquettes) — LA FLÈCHE DE RETOUR EST UNIQUE. Elle
 * vit dans `navigation-publique/FlecheDeRetour.tsx` (`LienFlecheDeRetour`, un lien ; `BoutonFlecheDeRetour`,
 * un bouton ; sa variante sur photo), et le lien texte « ← Retour à … » dans `shared/BoutonRetour.tsx`.
 *
 * Tout autre fichier qui nomme une flèche ou un chevron vers la gauche doit figurer ci-dessous, avec la
 * raison pour laquelle ce N'EST PAS un retour. La liste est FERMÉE : un fichier neuf qui en importe une
 * fait rougir — on l'y ajoute avec sa catégorie, ou on passe par la flèche unique.
 *
 * Catégories : les quatre du ticket (période, pagination, carrousel, calendrier), plus deux relevées en
 * le faisant (prémisse qui différait) : `etape` (l'étape précédente d'un assistant : un pas dans un
 * formulaire, pas une page quittée) et `hors-app` (le site public, l'authentification, l'onboarding et
 * `/super-admin`, hors du périmètre de la coque — leurs retours suivent leurs propres tickets).
 */
type Categorie = 'flèche unique' | 'periode' | 'pagination' | 'carrousel' | 'calendrier' | 'etape' | 'registre' | 'hors-app';

const PERMIS: Readonly<Record<string, Categorie>> = {
  'src/components/navigation-publique/FlecheDeRetour.tsx': 'flèche unique',
  'src/components/shared/BoutonRetour.tsx': 'flèche unique',
  // Le registre d'icônes réexporte lucide sans rien rendre.
  'src/components/icons.tsx': 'registre',
  'src/components/calendar/CalendarPage.tsx': 'periode',
  'src/components/ui/calendar.tsx': 'calendrier',
  'src/components/bookings/CalendrierDesNuits.tsx': 'calendrier',
  'src/components/console/Pagination.tsx': 'pagination',
  'src/components/inventory/InventoryList.tsx': 'pagination',
  'src/components/maintenance/MaintenanceList.tsx': 'pagination',
  'src/components/maintenance/MaintenanceHistoryByProperty.tsx': 'pagination',
  // TCK-2659 — le pied du registre des encaissements (bureau) : « page précédente », pas un retour. Le
  // retour de l'écran de détail du téléphone est celui de la coque (`DeclarerEnTete forme="detail"`).
  'src/components/admin/finances/argent/EncaissementsAgence.tsx': 'pagination',
  'src/components/public/index/ProfilePagination.tsx': 'pagination',
  // TCK-2618 — la pagination des favoris a suivi le contenu de la page, sorti de `PublicFavoritesPage`.
  'src/components/favorites/SuiviDesFavoris.tsx': 'pagination',
  'src/components/property/cards/PropertyRow.tsx': 'carrousel',
  'src/components/public/profile/TeamStrip.tsx': 'carrousel',
  'src/app/[locale]/(public)/properties/[slug]/components/PropertyLightbox.tsx': 'carrousel',
  'src/app/[locale]/(public)/properties/[slug]/components/PropertyMobileGallery.tsx': 'carrousel',
  'src/app/[locale]/(public)/properties/[slug]/components/PropertySimilar.tsx': 'carrousel',
  'src/components/wizard/WizardReprenable.tsx': 'etape',
  'src/components/bookings/BookingTunnel.tsx': 'hors-app',
  'src/components/auth/RetourAuth.tsx': 'hors-app',
  'src/components/home/Navbar.tsx': 'hors-app',
  'src/components/onboarding/OnboardingShell.tsx': 'hors-app',
  'src/components/layout/SuperAdminSidebar.tsx': 'hors-app',
  'src/app/(super-admin)/super-admin/agency-upgrade-requests/[id]/page.tsx': 'hors-app',
  'src/components/admin/super/agency-detail.tsx': 'hors-app',
  'src/components/admin/super/radar/annonceur/RadarAdvertiserCard.tsx': 'hors-app',
  'src/components/admin/super/radar/cibles/RadarCibleFiche.tsx': 'hors-app',
  'src/components/admin/super/radar/cibles/RevisionsDemande.tsx': 'hors-app',
  'src/components/admin/super/radar/fiche/RadarListingFiche.tsx': 'hors-app',
  'src/components/admin/super/radar/publication/RadarPublication.tsx': 'hors-app',
};

/**
 * Une flèche vers la gauche, NOMMÉE dans le code (import, JSX, alias) — pas une chaîne : la touche
 * `'ArrowLeft'` d'un gestionnaire clavier n'est pas un glyphe.
 */
export const FLECHE_A_GAUCHE = /(?<![\w'"`])(ArrowLeft|ChevronLeft|ArrowLeftIcon|ChevronLeftIcon|MoveLeft|ChevronsLeft|CornerUpLeft|Undo2)\b/;

const RACINE = process.cwd();

function fichiers(dossier: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === '__tests__' || nom === 'playground' || nom === 'node_modules') continue;
      sortie.push(...fichiers(chemin));
    } else if (/\.tsx?$/.test(nom)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

const AVEC_FLECHE = fichiers(join(RACINE, 'src'))
  .filter((f) => FLECHE_A_GAUCHE.test(readFileSync(f, 'utf8')))
  .map((f) => relative(RACINE, f).split(sep).join('/'))
  .sort();

describe('TCK-2617 — une seule flèche de retour', () => {
  it('aucun fichier ne nomme une flèche à gauche hors de la liste fermée', () => {
    expect(AVEC_FLECHE.filter((f) => !(f in PERMIS))).toEqual([]);
  });

  it('la liste n’a pas d’entrée morte (un fichier qui n’en nomme plus sort de la liste)', () => {
    expect(Object.keys(PERMIS).filter((f) => !AVEC_FLECHE.includes(f))).toEqual([]);
  });

  it('la flèche unique : ArrowLeft de 20 px au trait 2 (réf. a-2, au-dessus du 1,75 de la portée) dans une cible de 44 px', () => {
    const source = readFileSync(join(RACINE, 'src/components/navigation-publique/FlecheDeRetour.tsx'), 'utf8');
    expect(source).toMatch(/inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground/);
    expect(source.match(/<ArrowLeft className="size-5 stroke-2" aria-hidden="true" \/>/g)).toHaveLength(2);
  });

  it('la touche « ArrowLeft » d’un gestionnaire clavier n’est pas une flèche', () => {
    expect(FLECHE_A_GAUCHE.test("case 'ArrowLeft':")).toBe(false);
    expect(FLECHE_A_GAUCHE.test("import { ArrowLeft } from 'lucide-react';")).toBe(true);
    expect(FLECHE_A_GAUCHE.test('<ChevronLeft className="size-4" />')).toBe(true);
  });
});
