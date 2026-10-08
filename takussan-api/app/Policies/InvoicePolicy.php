<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `InvoiceController::authorizeAccess()` / `authorizeManage()`.
 *
 * `PaymentGatewayController::authorizeManage()` portait une **troisième** copie pour la branche
 * `Invoice` de son test polymorphe, sans la clause `isSuperAdmin()` (elle était sortie en tête de
 * méthode) : même règle, écrite deux fois, dans deux fichiers.
 */
class InvoicePolicy extends BasePolicy
{
    /**
     * TCK-528 — émettre une facture exige `invoices.create` sur l'agence du profil actif.
     *
     * Jusqu'ici la capacité était déclarée et lue nulle part : `InvoiceService::create()` acceptait
     * tout membre de l'agence du client, capacité ou non. Les règles d'appartenance du service
     * restent, en plus de celle-ci.
     */
    protected function createCapability(): ?Capability
    {
        return Capability::InvoicesCreate;
    }

    /** Lire une facture : super-admin, émetteur, personnel de l'agence, ou le CLIENT facturé. */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Invoice) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->issued_by_id === $user->id
            || $this->isStaffOf($user, $model->agency_id)
            || ($model->customer && $model->customer->user_id === $user->id);
    }

    /**
     * Administrer une facture : super-admin, émetteur, ou personnel de l'agence — pas le client.
     *
     * TCK-587 — « périmètre d'agence » valait tout membre de l'agence, bailleur compris.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Invoice) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->issued_by_id === $user->id
            || $this->isStaffOf($user, $model->agency_id);
    }

    /**
     * TCK-587 — envoyer une facture : personnel de l'agence tenant `invoices.send`. Le geste
     * passait par `update`, qui n'exigeait aucune capacité : `invoices.send` n'avait aucun lecteur.
     */
    public function send(User $user, Invoice $invoice): bool
    {
        return $this->staffHolding($user, $invoice, Capability::InvoicesSend);
    }

    /** TCK-587 — marquer une facture payée : personnel de l'agence tenant `payments.record`. */
    public function markPaid(User $user, Invoice $invoice): bool
    {
        return $this->staffHolding($user, $invoice, Capability::PaymentsRecord);
    }

    /**
     * TCK-587 (ADR-0031 §2) — annuler une facture : personnel de l'agence tenant
     * `invoices.write_off`. L'agent du rôle système ne la tient pas : la finance est réservée à
     * l'administration de l'agence (`docs/features.md` §2.5).
     */
    public function cancel(User $user, Invoice $invoice): bool
    {
        return $this->staffHolding($user, $invoice, Capability::InvoicesWriteOff);
    }

    private function staffHolding(User $user, Invoice $invoice, Capability $capability): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        // Une facture hors de toute agence reste à son émetteur : aucun rôle ne peut porter la
        // capacité. Elle ne s'obtient pas par un bailleur — créer exige `invoices.create`.
        if ($invoice->agency_id === null) {
            return $invoice->issued_by_id === $user->id;
        }

        return $this->isStaffOf($user, $invoice->agency_id)
            && $user->can($capability->value, $invoice);
    }
}
