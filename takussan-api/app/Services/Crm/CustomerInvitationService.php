<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Invitation;
use App\Models\User;
use App\Policies\CustomerPolicy;
use App\Services\Invitation\InvitationService;
use App\Services\Notifications\Sms\PhoneNumber;

/**
 * P15.01 (TCK-2351, décision du porteur du 2026-10-25) — « inviter le locataire à créer son
 * compte » : un lien à usage unique, et `linkUser()` à l'acceptation.
 *
 * Une fiche saisie par l'agence n'avait jamais de compte : sur un bail tiré d'elle, « Demander la
 * signature » rendait 422 `lease_signature.tenant_without_account`, et l'espace du locataire restait
 * vide. Le geste passe par {@see InvitationService} (rôle `tenant`, la fiche pour cible) : jeton,
 * expiration, rappel, relance, révocation et canal y sont déjà, avec leurs gardes.
 *
 * Le destinataire est la coordonnée DE LA FICHE, jamais une adresse saisie au geste : le compte qui
 * se lie est celui qui reçoit le lien à cette coordonnée, et l'accepte. L'e-mail d'abord ; à défaut,
 * le numéro, si le lien par SMS est ouvert (`auth.phone_login.enabled`, comme pour le bailleur).
 *
 * L'autorisation est jugée avant, par {@see CustomerPolicy::invite()}.
 */
class CustomerInvitationService
{
    public function __construct(private readonly InvitationService $invitations) {}

    public function invite(Customer $customer, User $inviter): Invitation
    {
        // Le super-admin passe la policy : une fiche sans agence n'a pas d'agence où l'inviter.
        abort_if($customer->agency_id === null, 403);
        abort_code_if($customer->user_id !== null, 409, 'customer.invite_already_linked');

        $email = is_string($customer->email) && trim($customer->email) !== '' ? trim($customer->email) : null;
        $phone = $email === null
            && (bool) config('auth.phone_login.enabled')
            && is_string($customer->phone)
            && PhoneNumber::isValid($customer->phone)
            ? $customer->phone
            : null;
        abort_code_if($email === null && $phone === null, 422, 'customer.invite_no_contact');

        return $this->invitations->send([
            'email' => $email,
            'phone' => $phone,
            'role' => 'tenant',
            'invitable_type' => Customer::class,
            'invitable_id' => $customer->id,
            'agency_id' => (int) $customer->agency_id,
            // Le nom à préremplir pour un compte existant sans nom (`InvitationService::prefillFor`).
            'metadata' => [
                'first_name' => trim((string) $customer->first_name),
                'last_name' => trim((string) $customer->last_name),
            ],
        ], $inviter);
    }
}
