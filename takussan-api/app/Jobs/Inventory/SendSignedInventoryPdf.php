<?php

namespace App\Jobs\Inventory;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Property;
use App\Models\User;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Model\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-2913 (ADR-0098, amendement B) — à la seconde signature, le PDF de l'état des lieux part aux
 * deux parties : le compte du locataire du bail et le bailleur du bail, dédoublonnés.
 *
 * Mis en file par {@see InventorySignatureService::sign()} APRÈS la transaction : la réponse de la
 * signature n'attend rien.
 *
 * **Une fois par état des lieux.** L'envoi se réclame par `UPDATE … WHERE pdf_sent_at IS NULL` avant
 * le premier avis : rejouée (relance du worker, double mise en file), la tâche ne trouve plus rien à
 * réclamer et ne renvoie pas. Mieux vaut un envoi perdu — le PDF reste téléchargeable — que deux.
 *
 * **Un lien, pas une pièce jointe** (amendement B §4) : l'avis `inventory.signed_pdf_available`
 * (cloche + e-mail) ouvre la fiche de l'état des lieux, où le PDF — celui de l'empreinte figée à la
 * seconde signature — se télécharge sous la session. Aucun octet du PDF dans la charge de la file,
 * aucune donnée personnelle dans l'URL.
 */
final class SendSignedInventoryPdf implements ShouldQueue
{
    use Queueable;

    /** L'événement du journal de l'état des lieux (`admin.audit.events.inventory_pdf_sent`). */
    public const EVENT = 'inventory_pdf_sent';

    public function __construct(public readonly int $inventoryId) {}

    public function handle(NotificationService $notifications): void
    {
        $inventory = Inventory::query()->with(['lease.tenant', 'lease.landlord'])->find($this->inventoryId);
        if ($inventory === null || $inventory->status !== InventoryStatus::Signed || $inventory->pdf_sent_at !== null) {
            return;
        }

        $recipients = $this->recipients($inventory);
        $ids = array_map(static fn (User $user): int => (int) $user->id, $recipients);

        $claimed = Inventory::query()
            ->whereKey($inventory->getKey())
            ->whereNull('pdf_sent_at')
            ->update(['pdf_sent_at' => now(), 'pdf_sent_to' => json_encode($ids)]);
        if ($claimed !== 1) {
            return;
        }

        $property = Property::withTrashed()->find($inventory->property_id);
        $params = [
            'reference' => (string) ($inventory->lease?->reference_number ?? $inventory->lease_id),
            'property' => (string) ($property?->title ?? ''),
        ];
        $target = NotificationTarget::of('inventory', (int) $inventory->id);

        foreach ($recipients as $user) {
            $notifications->send($user, NotificationCode::InventorySignedPdfAvailable, $params, $target);
        }

        activity()
            ->performedOn($inventory)
            ->withProperties(['recipient_ids' => $ids])
            ->event(self::EVENT)
            ->log(self::EVENT);
    }

    /** @return list<User> */
    private function recipients(Inventory $inventory): array
    {
        $lease = $inventory->lease;
        $tenantUserId = $lease?->tenant?->user_id;
        $tenant = $tenantUserId !== null ? User::query()->find($tenantUserId) : null;

        return collect([$tenant, $lease?->landlord])
            ->filter()
            ->unique('id')
            ->values()
            ->all();
    }
}
