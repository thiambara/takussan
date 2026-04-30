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

    public function findOrCreateFromUser(User $user): Customer
    {
        $existing = Customer::where('user_id', $user->id)->first();
        if ($existing !== null) {
            return $existing;
        }

        return Customer::create([
            'user_id' => $user->id,
            'added_by_id' => $user->id,
            'agency_id' => $user->agency_id,
            'first_name' => $user->first_name ?? 'Client',
            'last_name' => $user->last_name ?? '#'.$user->id,
            'email' => $user->email,
            'phone' => $user->phone,
        ]);
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
