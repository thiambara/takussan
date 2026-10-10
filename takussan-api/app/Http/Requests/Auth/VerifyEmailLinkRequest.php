<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;
use App\Models\User;

/**
 * TCK-624 — le lien de vérification d'e-mail, SANS session.
 *
 * `EmailVerificationRequest` (Laravel) compare l'`id` du lien à l'utilisateur CONNECTÉ : ouvert sur
 * le téléphone où la boîte est relevée, ou après une déconnexion, le lien échouait toujours. La
 * preuve n'a jamais été la session, c'est le lien : la signature (`signed:relative`, HMAC par
 * `APP_KEY`) couvre l'`id`, le `hash` et l'expiration, et le `hash` doit être celui de l'adresse
 * ACTUELLE du compte — un lien émis avant un changement d'adresse ne vérifie pas la nouvelle.
 *
 * Inconnu et mauvais hash rendent le même 403 : le lien ne dit pas si le compte existe.
 */
class VerifyEmailLinkRequest extends BaseFormRequest
{
    private ?User $target = null;

    public function authorize(): bool
    {
        $user = User::query()->find((int) $this->route('id'));
        if ($user === null || ! hash_equals(sha1($user->getEmailForVerification()), (string) $this->route('hash'))) {
            return false;
        }
        $this->target = $user;

        return true;
    }

    public function rules(): array
    {
        return [];
    }

    public function target(): User
    {
        return $this->target ?? abort(403);
    }
}
