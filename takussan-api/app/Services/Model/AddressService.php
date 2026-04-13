<?php

namespace App\Services\Model;

use App\Models\Address;
use Illuminate\Support\Facades\DB;
use Throwable;

class AddressService
{
    /**
     * Store a new address
     * @throws Throwable
     */
    public function store(array $data): Address
    {
        return DB::transaction(function () use ($data) {
            return Address::create($data);
        });
    }

    /**
     * Update an existing address
     * @throws Throwable
     */
    public function update(Address $address, array $data): Address
    {
        return DB::transaction(function () use ($address, $data) {
            $address->update($data);
            return $address;
        });
    }

    /**
     * Delete an address
     * @throws Throwable
     */
    public function delete(Address $address): bool
    {
        return DB::transaction(function () use ($address) {
            return $address->delete();
        });
    }
}
