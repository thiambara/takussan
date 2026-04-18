<?php

namespace App\Services\Model;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;

class CustomerService
{
    /** @param array<string,mixed> $data */
    public function create(array $data, User $actor): Customer
    {
        return Customer::create(array_merge($data, [
            'added_by_id' => $actor->id,
            'agency_id' => $data['agency_id'] ?? $actor->agency_id,
        ]));
    }

    /** @param array<string,mixed> $data */
    public function update(Customer $customer, array $data): Customer
    {
        $customer->fill($data)->save();

        return $customer->refresh();
    }

    public function linkUser(Customer $customer, User $user): void
    {
        $customer->update(['user_id' => $user->id]);
    }

    public function updatePipelineStage(Customer $customer, string $stage): Customer
    {
        abort_unless(
            CustomerPipelineStage::tryFrom($stage) !== null,
            422,
            'Invalid pipeline stage.'
        );

        $customer->update(['pipeline_stage' => $stage]);

        return $customer->refresh();
    }
}
