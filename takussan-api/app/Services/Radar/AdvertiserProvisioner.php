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
    /** Le compte rattaché à l'annonceur par une publication précédente est supprimé ou bloqué. */
    public const ACCOUNT_UNAVAILABLE = 'radar.advertiser.account_unavailable';

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
            // Le compte peut avoir été supprimé (soft-delete, `user_id` reste posé) ou bloqué depuis : la publication ne le
            // rouvre pas — `autoOnboard()` réactiverait ses profils — et ne le laisse pas non plus en 404 opaque.
            $user = User::withTrashed()->find($lockedAdvertiser->user_id);
            abort_code_if($user === null || ! $user->canOpenSession(), 422, self::ACCOUNT_UNAVAILABLE);

            return ['created' => false, 'user' => $user, 'agency' => $this->onboarding->autoOnboard($user)['agency']];
        }

        // Un STOP pose `do_not_contact_at` (le numéro n'est purgé que plus tard, TCK-2391) : l'annonceur ne se contacte plus, on ne
        // lui crée rien. Sans numéro (déjà purgé), il n'y a de toute façon ni compte à créer ni personne à qui publier.
        abort_code_if($lockedAdvertiser->do_not_contact_at !== null || $lockedAdvertiser->phone === null, 422, 'radar.advertiser.do_not_contact');
        abort_code_if($this->phoneRegistered($lockedAdvertiser), 422, 'radar.advertiser.phone_registered');

        $user = $this->createUser($lockedAdvertiser);
        $agency = $this->onboarding->autoOnboard($user)['agency'];
        $lockedAdvertiser->forceFill(['user_id' => $user->id])->save();

        return ['created' => true, 'user' => $user, 'agency' => $agency];
    }

    /**
     * Le compte déjà rattaché est supprimé ou bloqué : même refus que {@see self::provision()}, pour l'aperçu.
     */
    public function accountUnavailable(RadarAdvertiser $advertiser): bool
    {
        if ($advertiser->user_id === null) {
            return false;
        }
        $user = User::withTrashed()->find($advertiser->user_id);

        return $user === null || ! $user->canOpenSession();
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
