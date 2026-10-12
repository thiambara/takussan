<?php

namespace App\Services\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\Enums\CreditLotOrigin;
use App\Models\User;
use App\Notifications\Credits\CreditsGrantedNotification;
use App\Services\Boost\BoostSettings;
use App\Support\PhoneFingerprint;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §3) — l'offre de bienvenue, à l'admin principal de l'espace, une seule
 * fois par ESPACE et une seule fois par numéro vérifié. Le registre `credit_welcome_grants` porte
 * l'empreinte du numéro, pas le compte : il survit à l'anonymisation.
 *
 * Les deux unicités sont des index (`phone_hash` en 500200, `agency_id` en 500500) et tiennent par
 * `insertOrIgnore` — ON CONFLICT DO NOTHING SANS cible, donc sur TOUTE contrainte d'unicité —, jamais
 * par une exception attrapée, qui abandonnerait la transaction PostgreSQL (piège n°1). Changer de
 * numéro principal puis le faire vérifier ne re-crédite donc pas l'espace. Deux octrois simultanés :
 * le second attend le premier sur l'index unique, puis n'insère rien.
 */
final class WelcomeCreditService
{
    public function __construct(
        private readonly CreditLedger $ledger,
        private readonly BoostSettings $settings,
    ) {}

    public function onSpaceCreated(Agency $agency): ?CreditLot
    {
        $admin = $agency->primaryAdmin;
        if ($admin === null || ! $this->hasVerifiedPhone($admin)) {
            return null;
        }

        return $this->grant($agency, $admin);
    }

    public function onPhoneVerified(User $user): ?CreditLot
    {
        if (! $this->hasVerifiedPhone($user)) {
            return null;
        }
        $agency = Agency::query()->where('primary_admin_id', $user->getKey())->orderBy('id')->first();

        return $agency === null ? null : $this->grant($agency, $user);
    }

    private function hasVerifiedPhone(User $user): bool
    {
        return is_string($user->phone) && $user->phone !== '' && $user->phone_verified_at !== null;
    }

    private function grant(Agency $agency, User $admin): ?CreditLot
    {
        $amount = $this->settings->welcomeAmount();
        if ($amount <= 0) {
            return null;
        }
        $hash = PhoneFingerprint::of((string) $admin->phone);

        $lot = DB::transaction(function () use ($agency, $admin, $amount, $hash): ?CreditLot {
            $inserted = DB::table('credit_welcome_grants')->insertOrIgnore([
                'phone_hash' => $hash,
                'agency_id' => $agency->getKey(),
                'user_id' => $admin->getKey(),
                'granted_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            if ($inserted === 0) {
                return null;
            }

            $lot = $this->ledger->grant($agency, CreditLotOrigin::Welcome, $amount, now()->addDays($this->settings->welcomeValidityDays()));
            DB::table('credit_welcome_grants')->where('phone_hash', $hash)->update(['credit_lot_id' => $lot->getKey()]);

            return $lot;
        });

        if ($lot !== null) {
            $admin->notify(new CreditsGrantedNotification($lot->initial_amount, $lot->expires_at?->toDateString(), (string) $agency->name));
        }

        return $lot;
    }
}
