<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * CRUD permission policy base.
 *
 * Concrete policies declare their permission prefix via `resource()` and
 * inherit `viewAny`, `view`, `create`, `update`, `delete` mapped to the
 * matching `{resource}.{action}` permission.
 *
 * The `super_admin` bypass is wired globally in AppServiceProvider via
 * `Gate::before`, so it applies to every policy (not just subclasses).
 */
abstract class BasePolicy
{
    /**
     * Permission prefix for this resource — e.g. 'properties', 'bookings'.
     * Used with `{resource}.view|create|update|delete`.
     */
    abstract protected function resource(): string;

    public function viewAny(User $user): bool
    {
        return $user->can($this->resource().'.view');
    }

    public function view(User $user, Model $model): bool
    {
        return $user->can($this->resource().'.view');
    }

    public function create(User $user): bool
    {
        return $user->can($this->resource().'.create');
    }

    public function update(User $user, Model $model): bool
    {
        return $user->can($this->resource().'.update');
    }

    public function delete(User $user, Model $model): bool
    {
        return $user->can($this->resource().'.delete');
    }
}
