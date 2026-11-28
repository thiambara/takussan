<?php

namespace App\Services\Inventory;

use App\Http\Requests\InventorySignRequest;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\User;
use App\Policies\InventoryPolicy;
use App\Services\Model\InventoryService;

/**
 * TCK-3011 (ADR-0139) — les gestes d'un état des lieux : pour chacun, « possible MAINTENANT pour ce
 * lecteur », policy ET état compris. `InventoryResource::forViewer` en tire `abilities` ; la fiche
 * (`InventoryDetail`) n'y ajoute plus le statut.
 *
 *   · `update` — le lecteur CONDUIT l'état des lieux (`InventoryPolicy::update`) : il ouvre le
 *     récapitulatif et recueille les signatures sur place. Ce n'est pas un geste d'écriture ; la clé
 *     reste la seule à ne pas porter d'état ;
 *   · `edit` — modifier le brouillon, ses pièces et ses photos (PATCH, photos) ;
 *   · `submit` — l'envoyer en signature ;
 *   · `dispute` — le contester, par ses deux parties seules (policy appelée EN DIRECT, hors de
 *     `Gate::before` : le super-admin n'est pas partie).
 *
 * Les prédicats d'état sont relus sur la ligne VERROUILLÉE par `InventoryService` et
 * `InventorySignatureService` ({@see self::brouillon()}, {@see self::contestable()},
 * {@see self::signable()}) : une règle d'état, une définition. Ce qui dépend du contenu (des éléments
 * non qualifiés, `inventory.unqualified_elements`) reste un refus de l'écriture : la fiche le dit.
 */
final class GestesDeLEtatDesLieux
{
    /** Les clés d'`abilities`, dans leur ordre de service. */
    public const GESTES = ['update', 'edit', 'submit', 'dispute'];

    /** @return array<string, bool> une clé par {@see self::GESTES} */
    public function pour(User $lecteur, Inventory $etat): array
    {
        $conduit = $lecteur->can('update', $etat);

        return [
            'update' => $conduit,
            'edit' => $conduit && self::brouillon($etat),
            'submit' => $conduit && self::brouillon($etat),
            'dispute' => self::contestable($etat) && app(InventoryPolicy::class)->dispute($lecteur, $etat),
        ];
    }

    /** Modifier, envoyer en signature : un brouillon ({@see InventoryService::assertDraft()}). */
    public static function brouillon(Inventory $etat): bool
    {
        return $etat->status === InventoryStatus::Draft;
    }

    /** Contester : à signer, ou signé (`inventory.cannot_dispute`). */
    public static function contestable(Inventory $etat): bool
    {
        return in_array($etat->status, [InventoryStatus::PendingSignature, InventoryStatus::Signed], true);
    }

    /** Signer : un brouillon ou un état des lieux à signer (`inventory.cannot_sign`). */
    public static function signable(Inventory $etat): bool
    {
        return in_array($etat->status, [InventoryStatus::Draft, InventoryStatus::PendingSignature], true);
    }

    /**
     * Ce rôle peut-il encore signer : l'état des lieux se signe, et la partie n'a pas déjà signé
     * (`inventory.already_signed_tenant`, `…_landlord`). Le « qui » reste celui de
     * `InventorySignatureService::canSignAs`.
     */
    public static function resteASigner(Inventory $etat, string $role): bool
    {
        return self::signable($etat) && ! ($role === InventorySignRequest::ROLE_TENANT ? $etat->tenant_signed : $etat->owner_signed);
    }
}
