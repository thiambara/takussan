<?php

namespace App\Services\Radar;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\RadarAdvertiser;
use App\Models\User;
use App\Services\Auth\PhoneLoginService;
use App\Services\Credits\WelcomeCreditService;
use App\Services\Onboarding\HostIndividualOnboardingService;
use App\Support\CanonicalPhone;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * TCK-2389 (ADR-0077 §6, ADR-0033 §3) — le compte et l'espace de l'annonceur pour qui l'on publie. Appelé DANS la
 * transaction de la publication, l'annonceur déjà verrouillé.
 *
 * Le compte naît comme celui de la connexion par code ({@see PhoneLoginService}) mais sans que le
 * numéro soit vérifié : `markVerified` n'est jamais appelé ici, c'est le code SMS reçu par l'annonceur qui le fera
 * (amendement de l'ADR-0033 §3). Sans numéro vérifié, `SpaceCreated` n'accorde aucun crédit de bienvenue
 * ({@see WelcomeCreditService::onSpaceCreated()}) ; il sera accordé à cette vérification.
 *
 * **Un numéro déjà porté par un utilisateur n'en crée aucun** (`phone` ou `secondary_phone`, vérifié ou non, forme
 * canonique) : publier des annonces dans le compte d'un tiers, ou en créer un second pour le même numéro, ferait de ce
 * compte le leur. L'annonceur n'est alors pas publié pour (422 `radar.advertiser.phone_registered`).
 */
final class AdvertiserProvisioner
{
    public function __construct(private readonly HostIndividualOnboardingService $onboarding) {}

    /**
     * Si `user_id` est posé (une publication précédente) : ce compte, tel quel, et son espace (`autoOnboard` est
     * idempotent) — `created = false`. Sinon : refuse un numéro porté, puis crée l'utilisateur et l'espace, et pose `user_id`.
     *
     * @return array{created: bool, user: User, agency: Agency}
     */
    public function provision(RadarAdvertiser $lockedAdvertiser): array
    {
        if ($lockedAdvertiser->user_id !== null) {
            $user = User::query()->findOrFail($lockedAdvertiser->user_id);

            return ['created' => false, 'user' => $user, 'agency' => $this->onboarding->autoOnboard($user)['agency']];
        }

        // Un STOP purge le numéro (ADR-0077 §9) : sans numéro, il n'y a ni compte à créer ni personne à qui publier.
        abort_code_if($lockedAdvertiser->phone === null, 422, 'radar.advertiser.do_not_contact');
        abort_code_if($this->phoneRegistered($lockedAdvertiser), 422, 'radar.advertiser.phone_registered');

        $user = $this->createUser($lockedAdvertiser);
        $agency = $this->onboarding->autoOnboard($user)['agency'];
        $lockedAdvertiser->forceFill(['user_id' => $user->id])->save();

        return ['created' => true, 'user' => $user, 'agency' => $agency];
    }

    /**
     * Le même refus, sans rien écrire : pour l'aperçu. Un annonceur déjà rattaché n'est jamais « porté » : son compte,
     * qui porte le numéro, est le sien.
     */
    public function phoneRegistered(RadarAdvertiser $advertiser): bool
    {
        if ($advertiser->user_id !== null || $advertiser->phone === null) {
            return false;
        }

        $phone = CanonicalPhone::fold($advertiser->phone);

        return User::query()
            ->where(fn ($query) => $query
                ->whereRaw(CanonicalPhone::sql('phone').' = ?', [$phone])
                ->orWhereRaw(CanonicalPhone::sql('secondary_phone').' = ?', [$phone]))
            ->exists();
    }

    private function createUser(RadarAdvertiser $advertiser): User
    {
        $parts = preg_split('/\s+/', trim((string) $advertiser->display_name), 2) ?: [];

        $user = new User;
        $user->forceFill([
            'first_name' => $parts[0] ?? '',
            'last_name' => $parts[1] ?? '',
            'email' => null,
            // Aucun mot de passe connu : la valeur machine fait échouer `Hash::check`, et `password_set_at` nul le dit.
            'password' => Hash::make(Str::random(40)),
            'phone' => $advertiser->phone,
            // Le numéro n'est PAS vérifié : seul le code reçu par l'annonceur le sera (`markVerified`, ADR-0033 §3).
            'phone_verified_at' => null,
            // Il a répondu par WhatsApp : c'est son canal.
            'phone_whatsapp' => true,
            'status' => UserStatus::Active,
            'preferred_language' => 'fr',
        ])->save();

        return $user;
    }
}
