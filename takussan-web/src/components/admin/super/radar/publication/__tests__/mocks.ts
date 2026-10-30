import type {
  RadarPublication,
  RadarPublicationAccount,
  RadarPublicationListing,
  RadarPublicationPreview,
  RadarPublishedMessage,
} from '@/types/radar';

/** Les fiches de test de « Publier pour lui » (TCK-2389) : la forme exacte de `RadarPublisher::preview()`. */

export function photo(id: number) {
  return { id, url: `https://media.takussan.test/reserve-${id}.jpg?signature=abc` };
}

export function annonce(id: number, partiel: Partial<RadarPublicationListing> = {}): RadarPublicationListing {
  return {
    id,
    title: `Appartement ${id}`,
    title_built: false,
    price: 350000,
    contract: 'rent',
    property_type: 'apartment',
    neighborhood_id: 4,
    neighborhood: 'Almadies',
    photo_preparation: { status: 'done', total: 2, done: 2 },
    photos: [photo(id * 10 + 1), photo(id * 10 + 2)],
    matches: [],
    duplicate_of_listing_id: null,
    duplicate_of_property_id: null,
    blocking: [],
    ...partiel,
  };
}

export function compte(partiel: Partial<RadarPublicationAccount> = {}): RadarPublicationAccount {
  return {
    exists: false,
    first_name: 'Moussa',
    last_name: 'Immo',
    phone: '+221771234567',
    space_name: 'Espace de Moussa',
    ...partiel,
  };
}

export function apercu(partiel: Partial<RadarPublicationPreview> = {}): RadarPublicationPreview {
  return {
    advertiser: { id: 7, display_name: 'Moussa Immo', nature: 'probable_owner', do_not_contact_at: null, mandate_at: null },
    account: compte(),
    listings: [annonce(12), annonce(13)],
    published: [],
    max_photos: 30,
    blocking: [],
    // TCK-2394 — drapeau `radar_mandate` éteint : ce que l'API rend par défaut.
    mandate: { enabled: false, space: null, blocking: [] },
    ...partiel,
  };
}

export const WA_ME_PUBLIE = 'https://wa.me/221771234567?text=Bonjour%20Moussa';

export function messagePublie(partiel: Partial<RadarPublishedMessage> = {}): RadarPublishedMessage {
  return {
    text: 'Bonjour Moussa, vos annonces sont en ligne sur Takussan :\nhttps://takussan.test/fr/properties/appartement-12\nRépondez STOP pour ne plus être contacté.',
    wa_me: WA_ME_PUBLIE,
    version: 'publie.v2',
    ...partiel,
  };
}

export function publiee(partiel: Partial<RadarPublication> = {}): RadarPublication {
  return {
    user: { id: 90, first_name: 'Moussa', last_name: 'Immo', phone: '+221771234567' },
    agency: { id: 40, name: 'Espace de Moussa', slug: 'espace-de-moussa' },
    created_account: true,
    properties: [
      { id: 501, slug: 'appartement-12', title: 'Appartement 12', radar_listing_id: 12, public_url: 'https://takussan.test/fr/properties/appartement-12' },
      { id: 502, slug: 'appartement-13', title: 'Appartement 13', radar_listing_id: 13, public_url: 'https://takussan.test/fr/properties/appartement-13' },
    ],
    ...partiel,
  };
}
