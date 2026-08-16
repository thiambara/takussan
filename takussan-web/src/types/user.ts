export type UserRole = 'customer' | 'tenant' | 'agent' | 'agency_admin' | 'owner' | 'service_provider' | 'super_admin';

export type UserStatus = 'active' | 'inactive' | 'banned';

/**
 * TCK-253 — Opt-in personalisation hints stored in `users.preferences`
 * (JSON column on the API). All fields are optional and user-tunable.
 */
export type UserPreferences = {
  city?: string;
  search_intent?: 'rent' | 'buy' | 'both';
};

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
