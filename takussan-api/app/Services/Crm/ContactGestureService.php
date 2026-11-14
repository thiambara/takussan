<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Enums\ContactGestureChannel;
use App\Models\Enums\LastContactChannel;
use App\Models\PropertyContactLead;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2583 (ADR-0103 § 1) — le geste de contact, journalisé et dénormalisé par CE SEUL service.
 *
 *   · Un geste (appel, WhatsApp, e-mail, SMS) écrit UNE entrée du journal d'activité
 *     (`event = contacted`, `properties.channel`, aucune coordonnée) sur la demande ou la fiche.
 *   · Sur une demande, le PREMIER geste pose `first_responded_at`, son auteur et son canal ; les
 *     suivants ne déplacent rien (verrou sur la ligne, puis `whereNull`). `handled_at` n'est
 *     jamais touché : répondre ne vaut pas traiter (décision 3b).
 *   · `last_contacted_at` de la fiche avance avec un geste — sur la fiche, ou sur sa demande une
 *     fois convertie —, une note, une visite terminée et un compte rendu ({@see self::touchCustomer()}),
 *     et `last_contact_channel` avec lui, par la même requête (TCK-2766).
 *
 * Deux colonnes dénormalisées, un seul écrivain : tout autre chemin qui les écrirait est un défaut
 * (ADR-0103, Conséquences).
 */
class ContactGestureService
{
    public const EVENT = 'contacted';

    /** TCK-2784 — la forme liée de `last_contacted_at` (`timestamp(6)`), jamais celle de la grammaire. */
    private const MICROSECONDS = 'Y-m-d H:i:s.u';

    public function onLead(PropertyContactLead $lead, User $author, ContactGestureChannel $channel): void
    {
        DB::transaction(function () use ($lead, $author, $channel): void {
            $now = now();

            /** @var PropertyContactLead $locked */
            $locked = PropertyContactLead::query()->whereKey($lead->getKey())->lockForUpdate()->firstOrFail();

            PropertyContactLead::query()
                ->whereKey($locked->getKey())
                ->whereNull('first_responded_at')
                ->toBase()
                ->update([
                    'first_responded_at' => $now,
                    'first_responded_by_id' => $author->id,
                    'first_response_channel' => $channel->value,
                ]);

            $this->log($locked, $author, $channel);

            if ($locked->customer_id !== null) {
                $this->touchCustomer((int) $locked->customer_id, LastContactChannel::fromGesture($channel), $now);
            }
        });
    }

    public function onCustomer(Customer $customer, User $author, ContactGestureChannel $channel): void
    {
        DB::transaction(function () use ($customer, $author, $channel): void {
            $this->log($customer, $author, $channel);
            $this->touchCustomer($customer, LastContactChannel::fromGesture($channel), now());
        });
    }

    /**
     * Avance `last_contacted_at` — jamais en arrière. Par la requête et non par le modèle : la fiche
     * est journalisée (`Customer::getActivitylogOptions`) et indexée, et un contact n'est ni une
     * modification de ses champs ni une raison de toucher `updated_at`.
     *
     * TCK-2766 — le canal (`last_contact_channel`) est écrit par la MÊME requête, sous la même garde :
     * l'instant et le canal ne peuvent pas diverger, et un contact plus ancien ne change ni l'un ni
     * l'autre.
     *
     * TCK-2784 — l'instant est lié à la MICROSECONDE (`MICROSECONDS`), en garde comme en valeur
     * écrite, sur une colonne `timestamp(6)`. Un `Carbon` lié tel quel passe par
     * `Grammar::getDateFormat()` (`Y-m-d H:i:s`) : deux contacts de la même seconde arrivaient égaux,
     * et le second ne passait pas la garde. Le miroir de l'instance suit ce que la LIGNE a accepté
     * (le compte rendu par `update()`), à la microseconde aussi : `setAttribute()` repasserait par le
     * format de la seconde.
     */
    public function touchCustomer(Customer|int $customer, LastContactChannel $channel, ?CarbonInterface $at = null): void
    {
        $at ??= now();
        $id = $customer instanceof Customer ? (int) $customer->getKey() : $customer;
        $instant = $at->format(self::MICROSECONDS);

        $written = Customer::query()
            ->whereKey($id)
            ->where(fn ($q) => $q->whereNull('last_contacted_at')->orWhere('last_contacted_at', '<', $instant))
            ->toBase()
            ->update(['last_contacted_at' => $instant, 'last_contact_channel' => $channel->value]);

        if ($customer instanceof Customer && $written > 0) {
            $customer->setRawAttributes([
                ...$customer->getAttributes(),
                'last_contacted_at' => $instant,
                'last_contact_channel' => $channel->value,
            ]);
            $customer->syncOriginalAttributes(['last_contacted_at', 'last_contact_channel']);
        }
    }

    private function log(Model $subject, User $author, ContactGestureChannel $channel): void
    {
        activity()
            ->performedOn($subject)
            ->causedBy($author)
            ->withProperties(['channel' => $channel->value])
            ->event(self::EVENT)
            ->log(self::EVENT);
    }
}
