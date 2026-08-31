/**
 * Les rôles que l'API émet dans `User.roles`.
 *
 * **Source de vérité : `HasProfiles::profileTypes()` côté back**, et cette
 * union en est une RECOPIE. `types/__tests__/user-roles.parity.test.ts`
 * (TCK-494) lit le fichier PHP et fait rougir tout écart — parce que la
 * recopie avait dérivé sur les trois valeurs à la fois : `broker` était émis
 * et absent d'ici, `customer` et `tenant` étaient déclarés ici et jamais émis
 * (TCK-492). Ajouter une valeur ici sans l'ajouter là-bas, ou l'inverse, casse
 * la suite.
 *
 * ⚠ **TCK-495 — `broker` a été RETIRÉ de cette union le 2026-08-31, un jour
 * après y avoir été ajouté par TCK-494.** Ce n'est pas une hésitation : c'est
 * la garde qui a fonctionné comme prévu. TCK-494 a rendu l'écart VISIBLE en
 * mettant le front en accord avec ce que le back émettait ; ce que la ligne
 * `broker: []` de la table d'audience du menu montrait alors — un rôle qui
 * n'ouvre AUCUN écran au-delà du socle — est ce que TCK-495 a tranché
 * (ADR-0027). Le back a cessé d'émettre l'alias, le front suit.
 *
 * Deux natures se cachent dans une seule union, et la nuance compte à la
 * lecture : `agency_admin`, `agent`, `owner`, `service_provider` et
 * `super_admin` correspondent à des profils polymorphes — commutables, présents
 * dans `PROFILE_TYPES`. `customer` et `tenant` sont DÉRIVÉS d'un état : aucune
 * ligne en base, aucune entrée dans le sélecteur de profil.
 */
export const USER_ROLES = [
  'super_admin',
  'agency_admin',
  'agent',
  'owner',
  'service_provider',
  'customer',
  'tenant',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type UserStatus = 'active' | 'inactive' | 'banned';

/**
 * TCK-253 — Opt-in personalisation hints stored in `users.preferences`
 * (JSON column on the API). All fields are optional and user-tunable.
 */
export type UserPreferences = {
  city?: string;
  search_intent?: 'rent' | 'buy' | 'both';
  /**
   * TCK-493 — la réponse à la question d'orientation posée juste après la
   * création du compte.
   *
   * ⚠ Elle ORIENTE, elle n'attribue rien : aucun profil n'est créé, aucune
   * capacité accordée. `'publish'` mène à `/onboarding/host`, qui reste seul
   * juge de ce qu'il crée.
   *
   * `'skipped'` est une réponse à part entière, et c'est le point qui compte :
   * sans valeur enregistrée, « passer » deviendrait « repousser à la prochaine
   * connexion », ce qui n'est pas passer.
   */
  entry_intent?: EntryIntent;
};

/** Les réponses possibles à la question d'orientation (TCK-493). */
export const ENTRY_INTENTS = ['search', 'publish', 'skipped'] as const;
export type EntryIntent = (typeof ENTRY_INTENTS)[number];

export type User = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  two_factor_enabled: boolean;
  /**
   * TCK-272 — `false` quand le hash stocké côté API est une valeur machine
   * (inscription OAuth, invitation acceptée sans mot de passe, compte
   * provisionné par la plateforme). Le step-up de suppression de compte
   * passe alors par un code à 6 chiffres envoyé par e-mail. **Le backend
   * est seul arbitre** : ce champ ne sert qu'à afficher le bon parcours,
   * jamais à décider ce qui est accepté.
   */
  has_usable_password?: boolean;
  /**
   * TCK-263 / TCK-264 — set to true on bootstrap or super-admin coopt
   * acceptance, flipped back to false once the freshly-onboarded user
   * has confirmed their TOTP factor. Frontend gates the super-admin
   * onboarding wizard on this flag.
   */
  force_2fa_at_first_login?: boolean;
  agency_id?: number | null;
  roles: UserRole[];
  status: UserStatus;
  /** TCK-253 — empty `{}` when the user has set nothing yet. */
  preferences?: UserPreferences;
  created_at: string;
};
