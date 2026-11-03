<?php

namespace Database\Seeders\Core;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invitation;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use App\Services\Notifications\ContactSansCompte;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * TCK-2379 — les invitations par lesquelles chacun est entré dans une agence :
 *
 *  - chaque agent et chaque bailleur, invité par le titulaire quelques jours avant son arrivée, et
 *    qui a accepté le jour où son compte est né ;
 *  - chaque locataire qui a un compte, invité par l'agent de sa fiche ; ceux qui n'en ont pas ont
 *    une invitation en attente (bail récent), expirée ou révoquée ;
 *  - un agent invité ces derniers jours, qui n'a pas encore répondu : son profil `draft` attend,
 *    comme le crée `AgentInvitationService`.
 *
 * Les lignes sont celles d'`InvitationService::send()` (jeton, échéance à 7 jours, langue `fr`) ;
 * l'envoi lui-même — e-mail ou SMS — n'est pas rejoué.
 */
class InvitationSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $maintenant = CarbonImmutable::now();

        foreach ($this->ctx->agencies->sortBy('id') as $agency) {
            $titulaire = User::query()->find($agency->primary_admin_id);
            if ($titulaire === null) {
                continue;
            }

            foreach (['agent' => AgentProfile::class, 'owner' => OwnerProfile::class] as $role => $profil) {
                foreach ($this->ctx->usersWithProfile($profil, $agency->id)->sortBy('id') as $membre) {
                    $cible = $profil::query()->where('user_id', $membre->id)->where('agency_id', $agency->id)->first();
                    if ($cible === null || (int) $membre->id === (int) $titulaire->id) {
                        continue;
                    }
                    $arrivee = CarbonImmutable::parse($membre->created_at);
                    $this->inviter($agency, $titulaire, $role, $cible, $membre->email, $membre->first_name, $membre->last_name, $arrivee->subDays(mt_rand(1, 5)), $arrivee);
                }
            }

            $this->locataires($agency, $maintenant);

            if ($agency->kind === AgencyKind::Standard && $this->ctx->volume(10, $agency->id) >= 6) {
                $this->agentEnAttente($agency, $titulaire, $maintenant);
            }
        }
    }

    private function locataires(Agency $agency, CarbonImmutable $maintenant): void
    {
        $baux = $this->ctx->leases
            ->filter(fn (Lease $l) => $l->agency_id === $agency->id && $l->status !== LeaseStatus::Draft && $l->renewed_from_lease_id === null)
            ->sortBy('id');

        foreach ($baux as $bail) {
            $fiche = Customer::query()->find($bail->tenant_id);
            $invitant = User::query()->find($fiche?->added_by_id ?? $bail->agent_id);
            if ($fiche === null || $invitant === null || ($fiche->email === null && ! ContactSansCompte::fromCustomer($fiche)->hasPhone())) {
                continue;
            }

            if ($fiche->user_id !== null) {
                $compte = CarbonImmutable::parse(User::query()->find($fiche->user_id)?->created_at ?? $fiche->created_at);
                $this->inviter($agency, $invitant, 'tenant', $fiche, $fiche->email, $fiche->first_name, $fiche->last_name, $compte->subDays(mt_rand(1, 3)), $compte);

                continue;
            }
            if (mt_rand(1, 100) > 55) {
                continue;
            }

            // Sans compte : invité à la signature ; en attente si c'est récent, sinon expiré ou révoqué.
            $envoi = Timeline::businessHour(CarbonImmutable::parse($bail->signed_at)->addDay());
            if ($envoi->greaterThanOrEqualTo($maintenant)) {
                continue;
            }
            $invitation = $this->inviter($agency, $invitant, 'tenant', $fiche, $fiche->email, $fiche->first_name, $fiche->last_name, $envoi, null);
            if ($invitation->expires_at->lessThanOrEqualTo($maintenant)) {
                $invitation->forceFill(mt_rand(1, 100) <= 15
                    ? ['status' => InvitationStatus::Revoked->value, 'revoked_at' => $envoi->addDays(mt_rand(1, 6))]
                    : ['status' => InvitationStatus::Expired->value, 'updated_at' => $invitation->expires_at])->saveQuietly();
            }
        }
    }

    /** Le profil `draft` et son invitation, comme `AgentInvitationService::invite()` les écrit. */
    private function agentEnAttente(Agency $agency, User $titulaire, CarbonImmutable $maintenant): void
    {
        $prenom = $this->ctx->faker()->senegaleseFirstName();
        $nom = $this->ctx->faker()->senegaleseLastName();
        $email = Str::slug($prenom.'.'.$nom, '.').'@'.$this->ctx->faker()->safeEmailDomain();
        $envoi = Timeline::businessHour($maintenant->subDays(mt_rand(1, 4)));

        $profil = Timeline::aLaDate($envoi, fn () => AgentProfile::query()->create([
            'user_id' => null,
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Draft->value,
            'metadata' => [
                'email' => $email, 'first_name' => $prenom, 'last_name' => $nom, 'phone' => null,
                'invited_role' => 'agent', 'invited_by' => $titulaire->id,
            ],
        ]));
        $this->inviter($agency, $titulaire, 'agent', $profil, $email, $prenom, $nom, $envoi, null);
    }

    private function inviter(
        Agency $agency, User $invitant, string $role, Model $cible, ?string $email,
        ?string $prenom, ?string $nom, CarbonInterface $envoi, ?CarbonInterface $acceptee,
    ): Invitation {
        $invitation = Timeline::aLaDate($envoi, fn () => Invitation::query()->create([
            'token' => Str::random(64),
            'email' => $email,
            'phone' => $email === null && $cible instanceof Customer ? ContactSansCompte::fromCustomer($cible)->phone : null,
            'invited_user_id' => null,
            'invited_by' => $invitant->id,
            'invitable_type' => $cible::class,
            'invitable_id' => $cible->getKey(),
            'agency_id' => $agency->id,
            'role' => $role,
            'status' => $acceptee !== null ? InvitationStatus::Accepted->value : InvitationStatus::Sent->value,
            'accepted_at' => $acceptee,
            'expires_at' => now()->addDays(InvitationService::DEFAULT_TTL_DAYS),
            'metadata' => ['first_name' => trim((string) $prenom), 'last_name' => trim((string) $nom), 'locale' => ContactSansCompte::DEFAULT_LOCALE],
        ]));
        if ($acceptee !== null) {
            $invitation->forceFill(['updated_at' => $acceptee])->saveQuietly();
        }

        return $invitation;
    }
}
