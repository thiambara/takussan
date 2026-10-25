<?php

namespace Database\Seeders\Core;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $this->seedSuperAdmin();

        foreach ($this->ctx->agencies as $agency) {
            $this->seedAgencyTeam($agency);
        }
    }

    private function seedSuperAdmin(): void
    {
        $user = User::updateOrCreate(
            ['email' => 'super@takussan.sn'],
            [
                'username' => 'super_admin',
                'first_name' => 'Takussan',
                'last_name' => 'SuperAdmin',
                'status' => UserStatus::Active,
                'phone' => '+221770000000',
                'password' => Hash::make('password'),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'created_at' => Timeline::seedStart(),
                'updated_at' => Timeline::seedStart(),
            ],
        );
        $user->forceFill(['email_verified_at' => Timeline::seedStart()])->save();
        // TCK-278 — super_admin matérialisé via PlatformProfile (source de
        // vérité unique post-cutover).
        PlatformProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            [
                'level' => PlatformProfileLevel::SuperAdmin,
                'granted_at' => Timeline::seedStart(),
            ],
        );
        $this->ctx->registerUser($user);

        $avatarUrl = 'https://api.dicebear.com/7.x/avataaars/png?seed='.urlencode($user->username);
        $this->ctx->downloadMedia($user, $avatarUrl, 'avatar');
    }

    private function seedAgencyTeam(Agency $agency): void
    {
        $slug = $agency->slug;
        $domain = parse_url((string) $agency->website, PHP_URL_HOST) ?? ($slug.'.sn');

        $admin = $this->createUser($agency, [
            'email' => "admin@{$domain}",
            'username' => "{$slug}-admin",
            'first_name' => 'Admin',
            'last_name' => $agency->name,
            'persona' => 'admin',
            'role' => 'agency_admin',
        ]);

        $agency->forceFill(['primary_admin_id' => $admin->id])->save();

        // TCK-2378 — l'équipe est à la taille de l'agence, et une agence `individual` est une personne
        // seule : son titulaire suit ses dossiers (SeedingContext::equipe()).
        $taille = $this->ctx->tailles[$agency->id] ?? 1.0;
        $individuelle = $agency->kind === AgencyKind::Individual;
        $nbAgents = $individuelle ? 0 : max(1, (int) round(5 * $taille));
        $agents = [];

        for ($i = 1; $i <= $nbAgents; $i++) {
            $agents[] = $this->createUser($agency, $this->membre($domain, $slug, 'agent', $i));
        }

        foreach (range(1, max(2, (int) round(10 * $taille))) as $i) {
            $this->createUser($agency, $this->membre($domain, $slug, 'owner', $i));
        }

        foreach (range(1, max(1, (int) round(5 * $taille))) as $i) {
            $this->createUser($agency, $this->membre($domain, $slug, 'service_provider', $i, 'provider'));
        }

        if ($individuelle) {
            return;
        }

        // Des arrivées pendant la fenêtre — la dernière il y a quelques semaines — et, dans une équipe
        // de trois agents ou plus, un départ : le collaborateur parti garde ses visites et ses baux,
        // datés d'avant son départ, et son adhésion est suspendue (TeamMemberSuspensionService).
        $arrivees = max(1, (int) round(2 * $taille));
        for ($k = 1; $k <= $arrivees; $k++) {
            $arrivee = $k === $arrivees
                ? Timeline::randomDateBetween(Timeline::seedEnd()->subDays(75), Timeline::seedEnd()->subDays(15))
                : Timeline::randomDateBetween(Timeline::seedStart()->addMonths(2), Timeline::seedStart()->addMonths(6));
            $this->createUser($agency, $this->membre($domain, $slug, 'agent', $nbAgents + $k), $arrivee);
        }

        if (count($agents) >= 3) {
            $this->depart(Tirage::un(array_slice($agents, 1)), $agency);
        }
    }

    /** @return array<string, mixed> */
    private function membre(string $domain, string $slug, string $persona, int $i, ?string $prefixe = null): array
    {
        $prefixe ??= $persona;

        return [
            'email' => "{$prefixe}{$i}@{$domain}",
            'username' => "{$slug}-{$prefixe}-{$i}",
            'first_name' => $this->ctx->faker()->senegaleseFirstName(),
            'last_name' => $this->ctx->faker()->senegaleseLastName(),
            'persona' => $persona,
            'role' => $persona,
        ];
    }

    /** Le départ d'un agent, quelques mois dans la fenêtre, par le geste de l'application : la suspension. */
    private function depart(User $agent, Agency $agency): void
    {
        $le = Timeline::businessHour(Timeline::randomDateBetween(Timeline::seedStart()->addMonths(3), Timeline::seedStart()->addMonths(9)));

        AgentProfile::query()
            ->where('user_id', $agent->id)
            ->where('agency_id', $agency->id)
            ->update(['status' => AgentProfileStatus::Suspended->value, 'updated_at' => $le]);
        $agent->forceFill(['last_login_at' => $le->subDays(mt_rand(1, 6))])->save();

        $this->ctx->departs[$agent->id] = $le;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createUser(Agency $agency, array $data, ?CarbonImmutable $arrivee = null): User
    {
        $role = $data['role'] ?? null;
        $persona = $data['persona'] ?? null;
        unset($data['role'], $data['persona']);

        // L'équipe précède le portefeuille qu'elle gère (TCK-2377) : un bien ou un bail d'avant la
        // fenêtre ne peut pas avoir été suivi par un agent arrivé après. Les arrivées étalées sont
        // l'affaire des arrivées de seedAgencyTeam() (TCK-2378).
        $createdAt = $arrivee ?? Timeline::randomDateBetween(
            Timeline::portfolioStart()->subMonth(),
            Timeline::portfolioStart(),
        );

        $user = User::updateOrCreate(
            ['email' => $data['email']],
            array_merge($data, [
                'status' => UserStatus::Active,
                'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
                'password' => Hash::make('password'),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'remember_token' => Tirage::code(10),
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]),
        );
        // TCK-2378 — une dernière connexion récente pour l'équipe, plus espacée pour les bailleurs et les
        // prestataires : aucune n'était semée.
        $user->forceFill([
            'email_verified_at' => $createdAt,
            'last_login_at' => Timeline::businessHour(Timeline::seedEnd()->subDays($persona === 'owner' || $persona === 'service_provider' ? mt_rand(1, 45) : mt_rand(0, 6))),
        ])->save();

        // TCK-278 — Le rôle est matérialisé via le profil polymorphe
        // (cf. seedProfileFor + Règle 5). Plus de spatie syncRoles ici.
        unset($role);
        $this->seedProfileFor($user, $agency, $persona);
        $this->ctx->registerUser($user, $persona, $agency->id);

        $avatarUrl = 'https://api.dicebear.com/7.x/avataaars/png?seed='.urlencode($user->username);
        $this->ctx->downloadMedia($user, $avatarUrl, 'avatar');

        return $user;
    }

    /**
     * Polymorphic profile creation driven by the persona string carried in the
     * seed payload. Since TCK-271, agency admins also get a materialized
     * {@see AgencyAdminProfile} so the cookie-based active profile resolver
     * can pin the agency context unambiguously and policies reading
     * `$user->agency_id` keep returning the correct value. Service providers
     * are user-scoped, so the agency only enters via the collaboration pivot.
     */
    private function seedProfileFor(User $user, Agency $agency, ?string $persona): void
    {
        match ($persona) {
            'owner' => OwnerProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agency->id],
                ['status' => OwnerProfileStatus::Active->value],
            ),
            'agent' => AgentProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agency->id],
                ['status' => AgentProfileStatus::Active->value],
            ),
            'service_provider' => $this->seedServiceProviderProfile($user, $agency),
            'admin' => $this->seedAgencyAdminProfile($user, $agency),
            null => null,
            default => null,
        };
    }

    private function seedAgencyAdminProfile(User $user, Agency $agency): AgencyAdminProfile
    {
        return AgencyAdminProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agency->id],
            ['status' => AgencyAdminProfileStatus::Active->value],
        );
    }

    private function seedServiceProviderProfile(User $user, Agency $agency): void
    {
        $sp = ServiceProviderProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            [],
        );
        ServiceProviderAgencyCollaboration::query()->firstOrCreate(
            ['service_provider_profile_id' => $sp->id, 'agency_id' => $agency->id],
            [
                'status' => CollaborationStatus::Active->value,
                'started_at' => $user->created_at?->toDateString() ?? now()->toDateString(),
            ],
        );
    }
}
