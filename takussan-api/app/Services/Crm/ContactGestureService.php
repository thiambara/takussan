<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Enums\ContactGestureChannel;
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
 *     fois convertie —, une note, une visite terminée et un compte rendu ({@see self::touchCustomer()}).
 *
 * Deux colonnes dénormalisées, un seul écrivain : tout autre chemin qui les écrirait est un défaut
 * (ADR-0103, Conséquences).
 */
class ContactGestureService
{
    public const EVENT = 'contacted';

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
                $this->touchCustomer((int) $locked->customer_id, $now);
            }
        });
    }

    public function onCustomer(Customer $customer, User $author, ContactGestureChannel $channel): void
    {
        DB::transaction(function () use ($customer, $author, $channel): void {
            $this->log($customer, $author, $channel);
            $this->touchCustomer($customer, now());
        });
    }

    /**
     * Avance `last_contacted_at` — jamais en arrière. Par la requête et non par le modèle : la fiche
     * est journalisée (`Customer::getActivitylogOptions`) et indexée, et un contact n'est ni une
     * modification de ses champs ni une raison de toucher `updated_at`.
     */
    public function touchCustomer(Customer|int $customer, ?CarbonInterface $at = null): void
    {
        $at ??= now();
        $id = $customer instanceof Customer ? (int) $customer->getKey() : $customer;

        Customer::query()
            ->whereKey($id)
            ->where(fn ($q) => $q->whereNull('last_contacted_at')->orWhere('last_contacted_at', '<', $at))
            ->toBase()
            ->update(['last_contacted_at' => $at]);

        if ($customer instanceof Customer
            && ($customer->last_contacted_at === null || $customer->last_contacted_at->lessThan($at))) {
            $customer->setAttribute('last_contacted_at', $at);
            $customer->syncOriginalAttribute('last_contacted_at');
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
