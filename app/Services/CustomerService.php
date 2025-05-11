<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Pagination\LengthAwarePaginator;

class CustomerService
{
    /**
     * Get paginated customers with optional filters
     */
    public function getPaginated(array $filters = []): LengthAwarePaginator
    {
        $query = Customer::query();
        
        // Apply filters
        if (isset($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }
        
        if (isset($filters['status']) && $filters['status']) {
            $query->where('status', $filters['status']);
        }
        
        return $query->with('added_by')->orderBy('created_at', 'desc')->paginate(10);
    }
    
    /**
     * Get all customers
     */
    public function getAll(): Collection
    {
        return Customer::all();
    }
    
    /**
     * Get customer by ID
     */
    public function getById(int $id): ?Customer
    {
        return Customer::with('bookings', 'added_by')->find($id);
    }
    
    /**
     * Create a new customer
     */
    public function create(array $data): Customer
    {
        return Customer::create([
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'birth_date' => $data['birth_date'] ?? null,
            'status' => $data['status'] ?? 'active',
            'added_by_id' => $data['added_by_id'] ?? auth()->id(),
            'extra' => $data['extra'] ?? null,
        ]);
    }
    
    /**
     * Update an existing customer
     */
    public function update(Customer $customer, array $data): Customer
    {
        $customer->update([
            'first_name' => $data['first_name'] ?? $customer->first_name,
            'last_name' => $data['last_name'] ?? $customer->last_name,
            'email' => $data['email'] ?? $customer->email,
            'phone' => $data['phone'] ?? $customer->phone,
            'birth_date' => $data['birth_date'] ?? $customer->birth_date,
            'status' => $data['status'] ?? $customer->status,
            'extra' => $data['extra'] ?? $customer->extra,
        ]);
        
        return $customer->refresh();
    }
    
    /**
     * Delete a customer
     */
    public function delete(Customer $customer): bool
    {
        return $customer->delete();
    }
}
