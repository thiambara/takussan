<?php

namespace App\Jobs\Crm;

use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\NotificationType;
use App\Models\Enums\RelationshipStatus;
use App\Models\Property;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Crm\ProspectMatcher;
use App\Services\Model\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-591 §5 — le récapitulatif quotidien du rapprochement (`routes/console.php`, 08:30).
 *
 * **Ce qui entre** : les biens de l'agence arrivés sur le marché (publiés ou saisis) ou dont le prix
 * a changé (`property_price_histories`) dans les 24 h. *Saisis* s'ajoute à *publiés*, que le ticket
 * nomme seul : un bien PRIVÉ n'a pas toujours de `published_at`, et c'est justement le portefeuille
 * que le rapprochement existe pour montrer.
 *
 * **Qui reçoit** : le référent du prospect (relation `is_primary` active), sinon celui qui l'a saisi
 * — et seulement s'il est encore du personnel de l'agence du bien : un fichier de prospects ne part
 * pas chez quelqu'un qui a quitté l'agence. UNE notification par destinataire, quel que soit le
 * nombre de biens et de prospects.
 *
 * **Jamais vide** : sans correspondance, personne n'est notifié.
 *
 * **Idempotent par jour** : un destinataire qui a déjà son récapitulatif du jour (`data.kind` +
 * `data.digest_date`) n'en reçoit pas un second, si le job est rejoué.
 */
class SendProspectMatchDigest implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public const KIND = 'prospect_match_digest';

    private const WINDOW_HOURS = 24;

    /** Le détail porté par la notification ; le compte, lui, est toujours complet. */
    private const MAX_PAIRS_IN_DATA = 50;

    public function handle(ProspectMatcher $matcher, NotificationService $notifications): void
    {
        $since = now()->subHours(self::WINDOW_HOURS);
        $today = now()->toDateString();

        /** @var array<int, array{properties: array<int, true>, prospects: array<int, true>, pairs: list<array{property_id: int, customer_id: int}>}> $byRecipient */
        $byRecipient = [];

        $this->freshProperties($since)->each(function (Property $property) use ($matcher, &$byRecipient) {
            try {
                $matcher->customersFor($property)
                    ->select('customers.id', 'customers.agency_id', 'customers.added_by_id')
                    ->each(function (Customer $customer) use ($property, &$byRecipient) {
                        $recipient = $this->recipientFor($customer, (int) $property->agency_id);
                        if ($recipient === null) {
                            return;
                        }

                        $entry = &$byRecipient[$recipient];
                        $entry['properties'][$property->id] = true;
                        $entry['prospects'][$customer->id] = true;
                        $entry['pairs'][] = ['property_id' => $property->id, 'customer_id' => $customer->id];
                    });
            } catch (Throwable $e) {
                Log::error('prospect_match_digest.failed', [
                    'property_id' => $property->id,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            }
        });

        foreach ($byRecipient as $userId => $entry) {
            $user = User::query()->find($userId);
            if ($user === null || $this->alreadySent($userId, $today)) {
                continue;
            }

            $locale = $user->preferred_language ?: config('app.locale');
            $replace = ['properties' => count($entry['properties']), 'prospects' => count($entry['prospects'])];

            $notifications->notify(
                $user,
                NotificationType::System,
                __('crm.match_digest.title', [], $locale),
                __('crm.match_digest.body', $replace, $locale),
                [
                    'kind' => self::KIND,
                    'digest_date' => $today,
                    'properties_count' => $replace['properties'],
                    'prospects_count' => $replace['prospects'],
                    'matches' => array_slice($entry['pairs'], 0, self::MAX_PAIRS_IN_DATA),
                ],
            );
        }
    }

    /** @return Builder<Property> */
    private function freshProperties(Carbon $since): Builder
    {
        return Property::query()
            ->whereNotNull('agency_id')
            ->whereNotIn('status', ProspectMatcher::UNOFFERABLE_STATUSES)
            ->where(fn (Builder $q) => $q
                ->where('published_at', '>=', $since)
                ->orWhere('created_at', '>=', $since)
                ->orWhereHas('priceHistory', fn (Builder $h) => $h->where('changed_at', '>=', $since)))
            ->orderBy('id');
    }

    private function recipientFor(Customer $customer, int $agencyId): ?int
    {
        $referent = UserCustomerRelationship::query()
            ->where('customer_id', $customer->id)
            ->where('is_primary', true)
            ->where('status', RelationshipStatus::Active)
            ->value('user_id');

        foreach ([$referent, $customer->added_by_id] as $candidate) {
            if ($candidate !== null && $this->isStaffAt((int) $candidate, $agencyId)) {
                return (int) $candidate;
            }
        }

        return null;
    }

    /** TCK-587 — prédicat « personnel de l'agence » ; `isStaffAt()` à sa fusion. */
    private function isStaffAt(int $userId, int $agencyId): bool
    {
        $user = User::query()->find($userId);

        return $user !== null && ($user->isAgentAt($agencyId) || $user->isAgencyAdminAt($agencyId));
    }

    private function alreadySent(int $userId, string $date): bool
    {
        return AppNotification::query()
            ->where('user_id', $userId)
            ->where('data->kind', self::KIND)
            ->where('data->digest_date', $date)
            ->exists();
    }
}
