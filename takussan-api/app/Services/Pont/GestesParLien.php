<?php

namespace App\Services\Pont;

use App\Http\Requests\InventorySignRequest;
use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Inventory;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Messaging\SujetsDuFil;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Signature\SignatureOtpService;
use App\Services\Visit\ConfirmerUneVisite;
use App\Support\InstantRecu;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Gate;
use LogicException;

/**
 * TCK-2982 (ADR-0132 § 5) — le registre FERMÉ des gestes qu'un lien d'action peut faire.
 *
 * Par geste : le type d'objet (clé de `SujetsDuFil`), les codes d'événement qui l'émettent, et, dans
 * {@see self::executer()}, le MÊME service que sa route, après la MÊME politique rejugée au moment du geste
 * pour le compte du lien (ADR-0128 § 4 : un seul chemin d'écriture, aucune route « agir sur une carte »).
 * {@see self::projection()} : ce que la page montre AVANT le geste — le quartier, le créneau, le motif ;
 * ni adresse exacte, ni téléphone, ni montant.
 *
 * Les codes couverts par une notification mobile du même geste n'émettent aucun lien (ADR-0132 § 5) : la
 * relance de loyer porte déjà le lien porteur d'ADR-0051 au locataire.
 */
final class GestesParLien
{
    /**
     * @var array<string, array{objet: string, codes: list<string>}>
     */
    private const TABLE = [
        'property_visit.confirm' => ['objet' => 'property_visit', 'codes' => ['visit.rescheduled']],
        // Le seul code émetteur sans `action_for` au catalogue : le destinataire est le prestataire assigné,
        // tant que l'intervention n'est pas acceptée ({@see self::destinatairesHorsCatalogue()}).
        'maintenance_request.accept' => ['objet' => 'maintenance_request', 'codes' => ['maintenance.assigned']],
        // Un code à 6 chiffres, envoyé au numéro du lien, est exigé (ADR-0098 : une signature recueillie hors
        // de la session du signataire) — {@see self::signerLEtatDesLieux()}.
        'inventory.sign' => ['objet' => 'inventory', 'codes' => ['inventory.awaiting_signature', 'inventory.signed_by_party']],
    ];

    /** La portée du code de signature par lien, distincte de la voie sur place (ADR-0098). */
    public const PORTEE_DU_CODE = 'lien:';

    /** Codes couverts par une notification mobile du même geste : aucun lien du pont (ADR-0132 § 5). */
    public const CODES_COUVERTS = ['lease_payment.due_soon', 'lease_payment.overdue', 'lease_payment.reminded'];

    /**
     * Les autres codes qui attendent un geste au catalogue (`CodesDuFil`, `attend`) et n'émettent pas de lien, avec
     * leur motif : chaque code `attend` est rangé ici, dans {@see self::CODES_COUVERTS} ou dans la table — c'est ce
     * que garde `RegistreDesGestesParLienTest`.
     *
     * @var array<string, string>
     */
    public const SANS_LIEN = [
        'maintenance.quote_submitted' => 'approuver un devis : hors des liens (ADR-0132, « Ce que ça ne règle pas »)',
        'maintenance.quote_awaiting_owner' => 'approuver un devis : hors des liens (ADR-0132, « Ce que ça ne règle pas »)',
        'maintenance.slot_requested' => 'choisir un créneau parmi plusieurs : un formulaire, pas un geste unique',
        'commitment.due_soon' => "tenir un engagement se déclare dans l'application (TCK-2970)",
        'commitment.overdue' => "tenir un engagement se déclare dans l'application (TCK-2970)",
        'commitment.reminded' => "tenir un engagement se déclare dans l'application (TCK-2970)",
        'commitment.reopened' => "tenir un engagement se déclare dans l'application (TCK-2970)",
        'commitment.check_requested' => "tenir un engagement se déclare dans l'application (TCK-2970)",
    ];

    /** @return list<string> */
    public static function gestes(): array
    {
        return array_keys(self::TABLE);
    }

    public static function existe(string $geste): bool
    {
        return array_key_exists($geste, self::TABLE);
    }

    public static function typeDObjet(string $geste): string
    {
        return self::entree($geste)['objet'];
    }

    /** Le geste qu'un code d'événement émet, ou `null` (code couvert ou sans geste par lien). */
    public static function gesteDuCode(string $code): ?string
    {
        if (in_array($code, self::CODES_COUVERTS, true)) {
            return null;
        }
        foreach (self::TABLE as $geste => $entree) {
            if (in_array($code, $entree['codes'], true)) {
                return $geste;
            }
        }

        return null;
    }

    /** @return list<string> tous les codes qui émettent un lien */
    public static function codesEmetteurs(): array
    {
        return array_values(array_merge(...array_values(array_map(fn (array $e) => $e['codes'], self::TABLE))));
    }

    /** @return list<string> les codes émetteurs sans `action_for` au catalogue (le destinataire est la règle du registre) */
    public static function codesSansActionFor(): array
    {
        return ['maintenance.assigned'];
    }

    /**
     * Le geste est-il encore attendu de `$compte` sur `$objet` ? Une visite encore à confirmer ; une intervention
     * qui attend l'acceptation de SON prestataire ; un état des lieux où il lui reste un rôle à signer.
     */
    public static function attendEncore(string $geste, Model $objet, User $compte): bool
    {
        return match (true) {
            $geste === 'property_visit.confirm' && $objet instanceof PropertyVisit => $objet->status === VisitStatus::Scheduled,
            $geste === 'maintenance_request.accept' && $objet instanceof MaintenanceRequest => self::attendLAcceptation($objet) && (int) $objet->assigned_to === $compte->id,
            $geste === 'inventory.sign' && $objet instanceof Inventory => self::roleASigner($objet, $compte) !== null,
            default => false,
        };
    }

    /**
     * Les destinataires d'un geste dont le code n'a pas d'`action_for` au catalogue : pour
     * `maintenance.assigned`, le prestataire assigné, tant que l'intervention attend son acceptation.
     *
     * @return list<int>
     */
    public static function destinatairesHorsCatalogue(string $geste, Model $objet): array
    {
        if ($geste === 'maintenance_request.accept' && $objet instanceof MaintenanceRequest) {
            return self::attendLAcceptation($objet) && $objet->assigned_to !== null ? [(int) $objet->assigned_to] : [];
        }

        return [];
    }

    /** L'intervention attend-elle encore l'acceptation de son prestataire ? */
    public static function attendLAcceptation(MaintenanceRequest $mr): bool
    {
        return $mr->assigned_to !== null && $mr->accepted_at === null
            && ! in_array($mr->status, [MaintenanceStatus::Completed, MaintenanceStatus::Closed, MaintenanceStatus::Cancelled], true);
    }

    /**
     * Le geste, pour `$acteur`, par le service de sa route, la politique rejugée maintenant. Lève (403, 409,
     * 422…) comme la route : l'appelant le fait dans une transaction, et un refus ne consomme pas le lien.
     *
     * @param  array<string, mixed>  $parametres
     */
    public static function executer(string $geste, User $acteur, Model $objet, array $parametres): Model
    {
        return match ($geste) {
            'property_visit.confirm' => app(ConfirmerUneVisite::class)->executer(
                $acteur,
                self::attendu($objet, PropertyVisit::class),
                InstantRecu::ouNul($parametres['scheduled_at'] ?? null),
            )[0],
            'maintenance_request.accept' => (function () use ($acteur, $objet, $parametres): Model {
                $mr = self::attendu($objet, MaintenanceRequest::class);
                // La garde de `AcceptMaintenanceRequestRequest::authorize`, rejugée pour le compte du lien.
                Gate::forUser($acteur)->authorize('respondToAssignment', $mr);
                $instant = $parametres['scheduled_at'] ?? null;

                return app(MaintenanceRequestService::class)->accept(
                    $mr,
                    $acteur,
                    $instant === null ? null : MaintenanceRequest::scheduledInstant($instant),
                );
            })(),
            'inventory.sign' => self::signerLEtatDesLieux($acteur, self::attendu($objet, Inventory::class), $parametres),
            default => throw new LogicException("Geste par lien hors du registre : « {$geste} »."),
        };
    }

    /**
     * Le rôle que `$signataire` doit encore signer sur cet état des lieux, ou `null` (déjà signé, ou ce n'est
     * pas une partie).
     */
    public static function roleASigner(Inventory $inventaire, User $signataire): ?string
    {
        $service = app(InventorySignatureService::class);
        foreach ([InventorySignRequest::ROLE_TENANT, InventorySignRequest::ROLE_LANDLORD] as $role) {
            $signe = $role === InventorySignRequest::ROLE_TENANT ? $inventaire->tenant_signed : $inventaire->owner_signed;
            if (! $signe && $service->canSignAs($inventaire, $signataire, $role)) {
                return $role;
            }
        }

        return null;
    }

    /**
     * Signer par lien : le rôle qui reste à la partie, le code envoyé au numéro du lien, puis
     * `InventorySignatureService::sign` — la même garde de rôle et la même machine que la route. Sans rôle
     * restant, le service est appelé tel quel et rend son propre refus (403 hors partie, 409 déjà signé),
     * AVANT tout essai de code.
     *
     * @param  array<string, mixed>  $parametres
     */
    private static function signerLEtatDesLieux(User $acteur, Inventory $inventaire, array $parametres): Inventory
    {
        $service = app(InventorySignatureService::class);
        $signature = (string) ($parametres['signature'] ?? '');
        $role = self::roleASigner($inventaire, $acteur);
        if ($role === null) {
            $role = $service->canSignAs($inventaire, $acteur, InventorySignRequest::ROLE_TENANT)
                ? InventorySignRequest::ROLE_TENANT
                : InventorySignRequest::ROLE_LANDLORD;

            return $service->sign($inventaire, $acteur, $role, $signature, null, request());
        }

        $code = $parametres['code'] ?? null;
        abort_code_if(! is_string($code) || $code === '', 422, 'action_link.code_required');
        $otp = app(SignatureOtpService::class);
        abort_code_if($otp->isLocked($inventaire, $acteur, self::PORTEE_DU_CODE.$role), 423, 'action_link.code_locked');
        abort_code_if($otp->attempt($inventaire, $acteur, self::PORTEE_DU_CODE.$role, $code) === null, 422, 'action_link.code_invalid');

        return $service->sign($inventaire, $acteur, $role, $signature, null, request());
    }

    /**
     * Ce que la page montre avant le geste : le quartier et la ville, le créneau, le motif. Jamais une
     * adresse exacte, un téléphone ni un montant.
     *
     * @return array<string, scalar|null>
     */
    public static function projection(string $geste, Model $objet): array
    {
        return match ($geste) {
            'property_visit.confirm' => (function () use ($objet): array {
                $visit = self::attendu($objet, PropertyVisit::class);
                $visit->loadMissing('property.address');

                return [
                    'scheduled_at' => BaseResource::instantOnWire($visit->scheduled_at),
                    'property_title' => $visit->property?->title,
                    'quarter' => $visit->property?->address?->neighborhood,
                    'city' => $visit->property?->address?->city,
                ];
            })(),
            'maintenance_request.accept' => (function () use ($objet): array {
                $mr = self::attendu($objet, MaintenanceRequest::class);
                $mr->loadMissing('property.address');

                return [
                    'title' => $mr->title,
                    'category' => $mr->category instanceof \BackedEnum ? $mr->category->value : $mr->category,
                    'priority' => $mr->priority instanceof \BackedEnum ? $mr->priority->value : $mr->priority,
                    'quarter' => $mr->property?->address?->neighborhood,
                    'city' => $mr->property?->address?->city,
                ];
            })(),
            'inventory.sign' => (function () use ($objet): array {
                $inventaire = self::attendu($objet, Inventory::class);
                $inventaire->loadMissing('property.address');

                return [
                    'type' => $inventaire->type instanceof \BackedEnum ? $inventaire->type->value : $inventaire->type,
                    'property_title' => $inventaire->property?->title,
                    'quarter' => $inventaire->property?->address?->neighborhood,
                    'city' => $inventaire->property?->address?->city,
                ];
            })(),
            default => throw new LogicException("Geste par lien hors du registre : « {$geste} »."),
        };
    }

    /**
     * @template T of Model
     *
     * @param  class-string<T>  $classe
     * @return T
     */
    private static function attendu(Model $objet, string $classe): Model
    {
        if (! $objet instanceof $classe) {
            throw new LogicException('Objet inattendu pour ce geste : '.$objet::class.'.');
        }

        return $objet;
    }

    /** @return array{objet: string, codes: list<string>} */
    private static function entree(string $geste): array
    {
        if (! self::existe($geste)) {
            throw new LogicException("Geste par lien hors du registre : « {$geste} ».");
        }
        $entree = self::TABLE[$geste];
        if (! in_array($entree['objet'], SujetsDuFil::types(), true)) {
            throw new LogicException("Type hors du registre du fil : « {$entree['objet']} ».");
        }

        return $entree;
    }
}
