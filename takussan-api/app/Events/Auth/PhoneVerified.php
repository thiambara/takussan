<?php

namespace App\Events\Auth;

use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-633 (lot C) — un numéro PRINCIPAL vient d'être vérifié. Émis par le seul écrivain de
 * `phone_verified_at` ({@see PhoneVerificationService::markVerified}), après
 * le commit : un écouteur (l'offre de bienvenue du lot F) ne voit jamais une vérification défaite.
 * Le second numéro n'émet PAS cet événement : il n'ouvre ni compte, ni offre.
 */
class PhoneVerified implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(public User $user) {}
}
