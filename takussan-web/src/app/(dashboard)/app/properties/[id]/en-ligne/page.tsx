import type { Metadata } from 'next';

import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { CoqueDEntree } from '@/components/entree/CoqueDEntree';
import { libellesDeLaCoque } from '@/components/entree/libelles-de-la-coque';
import { AnnonceEnLigne, type AnnonceEnLigneDonnees } from '@/components/publication/AnnonceEnLigne';
import { PROPERTY_ENUM_NAMESPACES, enumLabel } from '@/components/property-form/options';
import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { origineSite } from '@/lib/config-publique';
import { lireBienDuRendu } from '@/lib/detail/ressource-de-detail';
import { propertyTypeValues } from '@/lib/schemas/property';
import { etatDeLAnnonce } from '@/lib/publication/annonce-en-ligne';
import { getToken } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('property.wizard.enLigne');
  return { title: t('metaTitre') };
}

export const dynamic = 'force-dynamic';

/**
 * TCK-2602 — `/app/properties/{id}/en-ligne` : « Votre annonce est en ligne », la sortie de la
 * publication d'un espace particulier (`individual`), depuis `/publish` (TCK-2601) comme depuis
 * `/app/properties/new`. L'assistant y mène au lieu du toast et de la fiche.
 *
 * ## Une route, et non un état de l'assistant
 *
 * L'écran survit au rechargement et au retour arrière : un état de l'assistant mourait avec lui
 * (rechargé, il rouvrait un assistant vide). Il lit le bien publié — la lecture mémoïsée que le
 * `layout.tsx` du segment a déjà faite (`lireBienDuRendu`), aucune requête de plus — plutôt que de
 * croire ce que l'assistant lui aurait passé.
 *
 * ## Plein écran, dans la coque d'entrée
 *
 * La route est plein écran (`components/layout/plein-ecran.ts`) : `AppShell` n'y rend ni barre ni
 * colonne, et la page monte la coque des écrans d'entrée (TCK-2598) — la marque seule au téléphone,
 * « Aller à mon espace » à droite de la barre au bureau, comme la maquette `app-entree-publier` a-8.
 * `absolute inset-0` : la page sort du rembourrage de `<main>` (cf. `properties/new/page.tsx`).
 *
 * ⚠ Sous le `loading.tsx` du segment, la redirection vers la fiche rend 200 puis navigue (TCK-426) :
 * elle n'est pas une garde d'accès — l'API l'est, la lecture du layout a déjà rendu 404 ou refusé —,
 * seulement le chemin d'un bien que l'écran ne sert pas.
 */
export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getToken();
  // Inatteignable : le layout du segment a refusé l'absence de jeton (cf. `[id]/page.tsx`).
  if (!token) return null;

  const bien = await lireBienDuRendu(token, Number(id));
  const etat = etatDeLAnnonce(bien);
  if (etat === null) redirect(`/app/properties/${bien.id}`);

  const [utilisateur, capacites, locale, libelles, tType] = await Promise.all([
    getMeAction(),
    capacitesDuProfilActif(),
    getLocale(),
    libellesDeLaCoque(),
    getTranslations(PROPERTY_ENUM_NAMESPACES.type),
  ]);

  // Le front possède le texte affiché : `type_label` arrive de l'API en anglais (cf. `[id]/page.tsx`).
  const typeLibelle = bien.type ? enumLabel(tType, propertyTypeValues, bien.type) : bien.type_label;
  const urlPublique = bien.slug ? `${origineSite()}${hrefLocalise(`/properties/${bien.slug}`, locale as Locale)}` : null;
  // Les demandes arrivent sur WhatsApp au numéro VÉRIFIÉ que l'auteur a déclaré WhatsApp (feuille de compte).
  const numeroWhatsApp = utilisateur.phone && utilisateur.phone_verified_at && utilisateur.phone_whatsapp ? utilisateur.phone : null;
  const photo = bien.photos?.[0]?.preview ?? bien.main_photo_url ?? null;

  const annonce: AnnonceEnLigneDonnees = {
    id: bien.id,
    titre: bien.title,
    reference: bien.reference_number,
    etat,
    type: bien.type,
    typeLibelle,
    contrat: bien.contract_type,
    periode: bien.rent_period,
    prix: bien.price,
    devise: bien.currency,
    quartier: bien.location?.quarter ?? null,
    ville: bien.location?.city ?? null,
    meuble: bien.furnished,
    surface: bien.area,
    etage: bien.floor_number ?? null,
    entree: bien.entry_cost?.total ?? null,
    photo,
    nombrePhotos: bien.photos?.length ?? 0,
    urlPublique,
  };

  return (
    <div className="absolute inset-0">
      <CoqueDEntree libelles={libelles}>
        <AnnonceEnLigne annonce={annonce} numeroWhatsApp={numeroWhatsApp} peutBooster={(capacites ?? []).includes('boost.spend')} />
      </CoqueDEntree>
    </div>
  );
}
