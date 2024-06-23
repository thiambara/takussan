<?php

namespace App\Providers;

use App\Models\base\BaseModelInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
//use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot(): void
    {
        $this->macrosRegistrations();
        $this->gatesRegistration();
    }

    public function gatesRegistration(): void
    {
//        Gate::define('update-user', fn(User $user, User $model) => $user->id === $model->id);

    }

    public function macrosRegistrations(): void
    {
        Builder::macro('toSqlWithBindings', function () {
            /**
             * @var Builder $this
             */
            $bindings = Arr::map($this->getBindings(), fn($value) => is_numeric($value) ? $value : "'$value'");
            return Str::replaceArray('?', $bindings, $this->toSql());
        });

        Builder::macro('filterThroughRequest', function () {
            /**
             * @var Builder $this
             * @var BaseModelInterface $model
             */
            if (($model = $this->getModel()) && $model instanceof BaseModelInterface) {
                return $model->scopeFilterThroughRequest($this);
            }
            return $this;
        });

        Builder::macro('orderThroughRequest', function () {
            /**
             * @var Builder $this
             * @var BaseModelInterface $model
             */
            if (($model = $this->getModel()) && $model instanceof BaseModelInterface) {
                return $model->scopeOrderThroughRequest($this);
            }
            return $this;
        });

        Builder::macro('paginatedThroughRequest', function ($withQueryString = false) {
            /**
             * @var Builder $this
             */
            $per_page = request('per_page');
            $page = request('page');
            $limit = request('limit');
            $columns = request('columns', ['*']);
            if ($per_page || $page) {
                $p = $this->paginate($per_page ?: $limit ?: 15, $columns, page: (int) $page ?: 1);
                if ($withQueryString) {
                    $p->withQueryString();
                }
                return $p;
            } elseif ($limit) {
                $this->take($limit);
            }

            return $this->get(to_snake_case($columns));
        });

        Builder::macro('allThroughRequest', function () {
            /**
             * @var Builder $this
             */
            return $this->filterThroughRequest()
                ->orderThroughRequest();
        });

    }
}
