<?php

namespace App\Models\base;

use Illuminate\Database\Eloquent\Model;

abstract class AbstractModel extends Model implements BaseModelInterface
{
    use BaseModelTrait;

    public function __construct(array $attributes = [])
    {
        $this->init();
        parent::__construct($attributes);
    }
}
