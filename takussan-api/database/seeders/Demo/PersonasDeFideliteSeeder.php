<?php

namespace Database\Seeders\Demo;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Enums\UserStatus;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Geo\GeoAddressCanonicalizer;
use App\Services\Notifications\ContactSansCompte;
use Database\Seeders\Support\DemoUsersSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Scout\ModelObserver;
use RuntimeException;

/**
 * TCK-2798 — les personas des relevés de fidélité, semées une fois pour toutes dans la base de démo locale.
 *
 *   php artisan db:seed --class='Database\Seeders\Demo\PersonasDeFideliteSeeder'
 *   php artisan db:seed --class='Database\Seeders\Demo\RetirerPersonasDeFideliteSeeder'   (le retrait exact)
 *
 * Chaque relevé d'un écran que la démo n'atteint pas (un invité, une intervention d'origine, un compte neuf)
 * négociait ses écritures temporaires puis les défaisait (TCK-2608, TCK-2611, TCK-2613). Ce seeder les remplace.
 *
 *  - **Repérable** : tous les comptes sous `@personas.takussan.test`, les deux agences par leur slug
 *    (`personas-…`). Rien d'autre n'est lu ni écrit : la démo de `migrate:fresh --seed` n'est pas touchée.
 *  - **Idempotent, et convergent** : une deuxième exécution ne crée aucune ligne ; elle REMET chaque persona dans
 *    l'état déclaré ici (invitation de nouveau utilisable, intervention de nouveau non assignée, lien de nouveau
 *    non consommé, intention d'entrée effacée). Seule exception : un invité dont l'invitation a été ACCEPTÉE
 *    (un compte est né sur son e-mail) n'est pas ramené en arrière — retirer puis semer de nouveau.
 *  - **Sans envoi** : aucun service d'invitation ni d'onboarding n'est appelé (ils envoient courriel et SMS) ;
 *    les lignes sont écrites comme `InvitationSeeder` les écrit. Les invitations en attente expirent dans un an
 *    et sont marquées rappelées : `invitations:remind` et l'expiration du planificateur ne les touchent pas.
 *  - **Sans trace hors de ses lignes** : ni journal d'activité, ni index de recherche (les biens des personas
 *    n'apparaissent pas dans la recherche publique ; ils sont en outre `private`).
 *
 * Le nom, le rôle et l'écran servi de chaque persona : ticket TCK-2798, § « Personas ».
 */
class PersonasDeFideliteSeeder extends Seeder
{
    public const DOMAINE = 'personas.takussan.test';

    public const AGENCE = 'personas-agence';

    public const ESPACE_HOTE = 'personas-espace-hote';

    public const GERANT = 'gerant@personas.takussan.test';

    public const BAILLEUR_INVITE = 'bailleur-invite@personas.takussan.test';

    public const AGENT_INVITE = 'agent-invite@personas.takussan.test';

    public const PRESTATAIRE_INVITE = 'prestataire-invite@personas.takussan.test';

    public const PRESTATAIRE_INTERVENTION = 'prestataire-intervention@personas.takussan.test';

    public const ORIENTATION_AVEC_PRENOM = 'orientation-awa@personas.takussan.test';

    public const ORIENTATION_SANS_PRENOM = 'orientation-sans-prenom@personas.takussan.test';

    public const HOTE = 'hote@personas.takussan.test';

    /** Le bien de la demande d'intervention : un slug fixe, pour le retrouver d'une exécution à l'autre. */
    public const BIEN_DE_LA_DEMANDE = 'personas-logement-mermoz';

    public const DEMANDE = 'Fuite sous l’évier de la cuisine';

    /** Les biens de l'hôte, par slug fixe. */
    public const BIENS_DE_L_HOTE = [
        'personas-hote-studio-ngor' => ['Studio meublé à Ngor', PropertyType::Studio, ContractType::Rent, 250000, 'Ngor'],
        'personas-hote-appartement-ouakam' => ['Appartement F3 à Ouakam', PropertyType::Apartment, ContractType::Rent, 400000, 'Ouakam'],
        'personas-hote-terrain-saly' => ['Terrain de 300 m² à Saly', PropertyType::Land, ContractType::Sale, 18000000, 'Saly'],
    ];

    /** Numéros fictifs, vérifiés : un numéro vérifié est unique dans `users` (`users_phone_verified_unique`). */
    public const TELEPHONES = [
        self::PRESTATAIRE_INTERVENTION => '+221700027910',
        self::ORIENTATION_AVEC_PRENOM => '+221700027920',
        self::ORIENTATION_SANS_PRENOM => '+221700027921',
        self::HOTE => '+221700027930',
    ];

    /**
     * TCK-2838 — le téléphone public (fictif) de l'agence des personas : la carte « Votre interlocuteur à l'agence » du
     * bailleur invité le montre quand la gérante, qui n'a pas de numéro, l'a invité.
     */
    public const TELEPHONE_DE_L_AGENCE = '+221338279940';

    /** Les modèles indexés que ce seeder écrit. */
    private const INDEXES = [User::class, Agency::class, Property::class, MaintenanceRequest::class];

    /** Une invitation en attente reste utilisable un an : les relevés n'ont pas à la relancer chaque semaine. */
    private const VALIDITE_DES_INVITATIONS_EN_JOURS = 365;

    public function run(): void
    {
        self::refuserHorsDuPoste();
        self::sansEffetsDeBord(fn () => DB::transaction(function (): void {
            $this->refuserUnTelephoneDejaPris();

            $gerant = $this->compte(self::GERANT, 'Mariama', 'Faye', null);
            $agence = $this->agence(self::AGENCE, 'Agence des personas', AgencyKind::Standard, $gerant);
            $agence->forceFill(['phone' => self::TELEPHONE_DE_L_AGENCE])->save();
            $this->profil(AgencyAdminProfile::class, $gerant, $agence, AgencyAdminProfileStatus::Active->value);

            $this->invites($agence, $gerant);
            $this->prestataireDeLIntervention($agence, $gerant);

            $this->compte(self::ORIENTATION_AVEC_PRENOM, 'Awa', 'Diop', self::TELEPHONES[self::ORIENTATION_AVEC_PRENOM]);
            $this->compte(self::ORIENTATION_SANS_PRENOM, '', '', self::TELEPHONES[self::ORIENTATION_SANS_PRENOM]);

            $this->hote();
        }));

        $this->command?->getOutput()?->writeln('  > Personas de fidélité semées sous @'.self::DOMAINE.' (TCK-2798).');
    }

    /** Des comptes au mot de passe connu, un gérant d'agence compris : jamais hors du poste ni de la suite de tests. */
    public static function refuserHorsDuPoste(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('Les personas de fidélité ne se sèment (ni ne se retirent) que sur la base locale ou de test.');
        }
    }

    /**
     * Ni journal d'activité ni index de recherche le temps du rappel : les deux écriraient hors des lignes du seeder
     * (`activity_log`, et l'index Meilisearch par la file `jobs` quand `SCOUT_QUEUE` est vrai).
     *
     * @template T
     *
     * @param  callable(): T  $rappel
     * @return T
     */
    public static function sansEffetsDeBord(callable $rappel): mixed
    {
        // Seules les classes qui synchronisaient sont rallumées après : la suite de tests coupe Scout par défaut
        // (`Tests\TestCase::setUp()`), et `withoutSyncingToSearch()` la rallumerait sans condition.
        $rallumer = array_values(array_filter(self::INDEXES, fn (string $classe) => ! ModelObserver::syncingDisabledFor($classe)));
        activity()->disableLogging();
        foreach (self::INDEXES as $classe) {
            ModelObserver::disableSyncingFor($classe);
        }
        try {
            return $rappel();
        } finally {
            foreach ($rallumer as $classe) {
                ModelObserver::enableSyncingFor($classe);
            }
            activity()->enableLogging();
        }
    }

    /** Un numéro des personas déjà vérifié sur un compte qui n'est pas le leur : on s'arrête avant d'écrire. */
    private function refuserUnTelephoneDejaPris(): void
    {
        foreach (self::TELEPHONES as $email => $telephone) {
            $pris = User::withTrashed()
                ->where('phone', $telephone)
                ->whereNotNull('phone_verified_at')
                ->where('email', '!=', $email)
                ->exists();
            if ($pris) {
                throw new RuntimeException("Le numéro de la persona {$email} est déjà vérifié sur un autre compte : rien n'est semé.");
            }
        }
    }

    private function compte(string $email, string $prenom, string $nom, ?string $telephone): User
    {
        /** @var User $user */
        $user = User::withTrashed()->firstOrNew(['email' => $email]);
        $user->forceFill([
            'first_name' => $prenom,
            'last_name' => $nom,
            'password' => Hash::make(DemoUsersSeeder::DEFAULT_PASSWORD),
            'status' => UserStatus::Active,
            'email_verified_at' => $user->email_verified_at ?? now(),
            'phone' => $telephone,
            'phone_verified_at' => $telephone === null ? null : ($user->phone_verified_at ?? now()),
            'preferred_language' => 'fr',
            'timezone' => 'Africa/Dakar',
            // Aucune réponse à l'orientation (TCK-2608) : un compte neuf, à chaque exécution.
            'preferences' => null,
            'deleted_at' => null,
        ])->save();

        return $user;
    }

    private function agence(string $slug, string $nom, AgencyKind $kind, User $titulaire): Agency
    {
        /** @var Agency $agence */
        $agence = Agency::withTrashed()->firstOrNew(['slug' => $slug]);
        $agence->forceFill([
            'name' => $nom,
            'kind' => $kind,
            'status' => AgencyStatus::Active,
            'is_verified' => false,
            'currency' => Currency::XOF,
            'primary_admin_id' => $titulaire->id,
            'moderation_required' => false,
            'deleted_at' => null,
        ])->save();

        return $agence;
    }

    /**
     * @param  class-string<Model>  $classe
     */
    private function profil(string $classe, User $user, Agency $agence, string $statut): Model
    {
        $profil = $classe::withTrashed()->firstOrNew(['user_id' => $user->id, 'agency_id' => $agence->id]);
        $profil->forceFill(['status' => $statut, 'deleted_at' => null])->save();

        return $profil;
    }

    /**
     * (a) Un bailleur, un agent et un prestataire invités, sans compte : le profil `draft` sans titulaire, et
     * l'invitation `sent` qui le désigne — ce qu'écrivent `OwnerInvitationService`, `AgentInvitationService` et
     * `ServiceProviderInvitationService` (le prestataire a en plus sa collaboration `paused`).
     */
    private function invites(Agency $agence, User $gerant): void
    {
        $invites = [
            ['owner', OwnerProfile::class, self::BAILLEUR_INVITE, 'Moussa', 'Ndiaye'],
            ['agent', AgentProfile::class, self::AGENT_INVITE, 'Khady', 'Sarr'],
            ['service_provider', ServiceProviderProfile::class, self::PRESTATAIRE_INVITE, 'Ibrahima', 'Fall'],
        ];

        foreach ($invites as [$role, $classe, $email, $prenom, $nom]) {
            $invitation = $this->invitationDe($agence, $email, $role);
            $profil = $invitation?->invitable_id === null ? null : $classe::withTrashed()->find($invitation->invitable_id);

            if ($profil !== null && $profil->user_id !== null) {
                // Acceptée depuis : un compte est né sur cet e-mail. On ne le défait pas ici.
                $this->command?->getOutput()?->writeln("    ! {$email} : invitation acceptée depuis — retirer puis semer de nouveau pour la rouvrir.");

                continue;
            }

            $metadata = ['email' => $email, 'first_name' => $prenom, 'last_name' => $nom, 'phone' => null, 'invited_by' => $gerant->id];
            $profil ??= new $classe;
            $profil->forceFill(match ($role) {
                'owner' => [
                    'user_id' => null, 'agency_id' => $agence->id, 'status' => OwnerProfileStatus::Draft->value,
                    'metadata' => [...$metadata, 'owner_type' => 'individual', 'company_name' => null],
                ],
                'agent' => [
                    'user_id' => null, 'agency_id' => $agence->id, 'status' => AgentProfileStatus::Draft->value,
                    'metadata' => [...$metadata, 'invited_role' => 'agent'],
                ],
                default => [
                    'user_id' => null, 'status' => ServiceProviderProfileStatus::Draft->value,
                    'specialties' => ['plumbing'], 'service_areas' => ['Mermoz'],
                    'metadata' => [...$metadata, 'trades' => ['plumbing'], 'intervention_zones' => ['Mermoz']],
                ],
            })->forceFill(['deleted_at' => null])->save();

            if ($profil instanceof ServiceProviderProfile) {
                $this->collaboration($profil, $agence, CollaborationStatus::Paused, ['invited_by' => $gerant->id]);
            }

            $invitation ??= new Invitation(['token' => Str::random(64)]);
            $invitation->forceFill([
                'email' => $email,
                'phone' => null,
                'invited_user_id' => null,
                'invited_by' => $gerant->id,
                'invitable_type' => $profil->getMorphClass(),
                'invitable_id' => $profil->getKey(),
                'agency_id' => $agence->id,
                'role' => $role,
                'status' => InvitationStatus::Sent->value,
                'accepted_at' => null,
                'revoked_at' => null,
                'expires_at' => now()->addDays(self::VALIDITE_DES_INVITATIONS_EN_JOURS),
                // Tenue pour rappelée : `remindPending()` ne la prend pas (ni d'ailleurs son échéance lointaine).
                'last_reminded_at' => now(),
                'metadata' => [
                    'first_name' => $prenom,
                    'last_name' => $nom,
                    'locale' => ContactSansCompte::DEFAULT_LOCALE,
                    ...($role === 'owner' ? ['owner_type' => 'individual'] : []),
                    ...($role === 'service_provider' ? ['trades' => ['plumbing'], 'intervention_zones' => ['Mermoz'], 'existing_sp_other_agency' => false] : []),
                ],
            ])->save();
        }
    }

    /**
     * (b) Le prestataire invité depuis une demande d'intervention, qui vient d'accepter : compte au numéro vérifié,
     * profil `active` (l'acceptation l'active, P208.02), une seule collaboration `active`, invitation `accepted` qui
     * porte `from_maintenance_request_id`, lien non consommé, demande ouverte et non assignée dans la même agence —
     * l'état que `ServiceProviderOnboardingService::demandeDOrigine()` exige (TCK-2613).
     */
    private function prestataireDeLIntervention(Agency $agence, User $gerant): void
    {
        $prestataire = $this->compte(self::PRESTATAIRE_INTERVENTION, 'Demba', 'Sow', self::TELEPHONES[self::PRESTATAIRE_INTERVENTION]);

        $bien = $this->bien(self::BIEN_DE_LA_DEMANDE, $agence, $gerant, 'Appartement F4 à Mermoz', PropertyType::Apartment, ContractType::Rent, 450000, 'Mermoz', '12 rue Carnot, immeuble Fatou');

        /** @var MaintenanceRequest $demande */
        $demande = MaintenanceRequest::withTrashed()
            ->where('property_id', $bien->id)
            ->where('title', self::DEMANDE)
            ->first() ?? new MaintenanceRequest;
        $demande->forceFill([
            'property_id' => $bien->id,
            'lease_id' => null,
            'requester_id' => $gerant->id,
            'assigned_to' => null,
            'title' => self::DEMANDE,
            'description' => 'Le siphon goutte depuis hier soir, le placard est mouillé.',
            'category' => MaintenanceCategory::Plumbing,
            'priority' => MaintenancePriority::Normal,
            'status' => MaintenanceStatus::Open,
            'accepted_at' => null,
            'scheduled_at' => null,
            'started_at' => null,
            'completed_at' => null,
            'quote_amount' => null,
            'quote_currency' => null,
            'quote_submitted_at' => null,
            'quote_decision_at' => null,
            'quote_decision_by_id' => null,
            'quote_rejection_reason' => null,
            'deleted_at' => null,
        ])->save();

        /** @var ServiceProviderProfile $profil */
        $profil = ServiceProviderProfile::withTrashed()->firstOrNew(['user_id' => $prestataire->id]);
        $profil->forceFill([
            'status' => ServiceProviderProfileStatus::Active->value,
            'specialties' => ['plumbing'],
            'service_areas' => ['Mermoz'],
            'metadata' => [
                'email' => self::PRESTATAIRE_INTERVENTION, 'first_name' => 'Demba', 'last_name' => 'Sow',
                'phone' => self::TELEPHONES[self::PRESTATAIRE_INTERVENTION], 'trades' => ['plumbing'],
                'intervention_zones' => ['Mermoz'], 'invited_by' => $gerant->id,
            ],
            'deleted_at' => null,
        ])->save();

        $invitation = $this->invitationDe($agence, self::PRESTATAIRE_INTERVENTION, 'service_provider') ?? new Invitation(['token' => Str::random(64)]);
        $invitation->forceFill([
            'email' => self::PRESTATAIRE_INTERVENTION,
            'phone' => null,
            'invited_user_id' => $prestataire->id,
            'invited_by' => $gerant->id,
            'invitable_type' => $profil->getMorphClass(),
            'invitable_id' => $profil->id,
            'agency_id' => $agence->id,
            'role' => 'service_provider',
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
            'revoked_at' => null,
            'expires_at' => now()->addDays(self::VALIDITE_DES_INVITATIONS_EN_JOURS),
            'last_reminded_at' => now(),
            // Réécrite entière : `deep_link_consumed_at`, posé par une fin d'onboarding, disparaît.
            'metadata' => [
                'first_name' => 'Demba',
                'last_name' => 'Sow',
                'trades' => ['plumbing'],
                'intervention_zones' => ['Mermoz'],
                'existing_sp_other_agency' => false,
                'locale' => ContactSansCompte::DEFAULT_LOCALE,
                'from_maintenance_request_id' => $demande->id,
            ],
        ])->save();

        $this->collaboration($profil, $agence, CollaborationStatus::Active, ['invited_by' => $gerant->id, 'invitation_id' => $invitation->id]);
    }

    /**
     * (d) L'hôte d'un espace `individual`, bailleur de chacun de ses biens : `AgencyAdminProfile` et `OwnerProfile`
     * actifs, comme `HostIndividualOnboardingService` les écrit — sans son événement `SpaceCreated`.
     */
    private function hote(): void
    {
        $hote = $this->compte(self::HOTE, 'Fatou', 'Ba', self::TELEPHONES[self::HOTE]);
        $espace = $this->agence(self::ESPACE_HOTE, 'Espace de Fatou', AgencyKind::Individual, $hote);
        $this->profil(AgencyAdminProfile::class, $hote, $espace, AgencyAdminProfileStatus::Active->value);
        $this->profil(OwnerProfile::class, $hote, $espace, OwnerProfileStatus::Active->value);

        foreach (self::BIENS_DE_L_HOTE as $slug => [$titre, $type, $contrat, $prix, $quartier]) {
            $this->bien($slug, $espace, $hote, $titre, $type, $contrat, $prix, $quartier, null);
        }
    }

    private function bien(
        string $slug, Agency $agence, User $titulaire, string $titre, PropertyType $type, ContractType $contrat,
        int $prix, string $quartier, ?string $rue,
    ): Property {
        /** @var Property $bien */
        $bien = Property::withTrashed()->firstOrNew(['slug' => $slug]);
        $bien->forceFill([
            'agency_id' => $agence->id,
            'user_id' => $titulaire->id,
            'title' => $titre,
            'type' => $type,
            'contract_type' => $contrat,
            'status' => PropertyStatus::Available,
            // Hors de la vitrine publique : les relevés des pages publiques ne voient pas les personas.
            'visibility' => PropertyVisibility::Private,
            'price' => $prix,
            'currency' => 'XOF',
            'deleted_at' => null,
        ])->save();

        $adresse = Address::query()->firstOrNew(['addressable_type' => $bien->getMorphClass(), 'addressable_id' => $bien->id]);
        $adresse->forceFill(['street' => $rue, 'neighborhood' => $quartier, 'city' => $quartier === 'Saly' ? 'Mbour' : 'Dakar', 'country' => 'SN']);
        // Canonisée d'abord (ce que fait `saving`), puis écrite seulement si elle change : chaque écriture d'adresse
        // met en file une revalidation de la page publique du bien (`Address::saved`), inutile à une relance.
        app(GeoAddressCanonicalizer::class)->canoniser($adresse);
        if ($adresse->isDirty()) {
            $adresse->save();
        }

        return $bien;
    }

    /** @param  array<string, mixed>  $metadata */
    private function collaboration(ServiceProviderProfile $profil, Agency $agence, CollaborationStatus $statut, array $metadata): void
    {
        $collaboration = ServiceProviderAgencyCollaboration::withTrashed()->firstOrNew([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $agence->id,
        ]);
        $collaboration->forceFill([
            'status' => $statut->value,
            'started_at' => $collaboration->started_at ?? now()->toDateString(),
            'ended_at' => null,
            'metadata' => $metadata,
            'deleted_at' => null,
        ])->save();
    }

    private function invitationDe(Agency $agence, string $email, string $role): ?Invitation
    {
        return Invitation::query()
            ->where('agency_id', $agence->id)
            ->where('email', $email)
            ->where('role', $role)
            ->orderBy('id')
            ->first();
    }
}
