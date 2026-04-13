<?php

namespace App\Models\Bases;

use Illuminate\Database\Eloquent\Model;

abstract class AbstractModel extends Model implements BaseModelInterface
{
    use BaseModelTrait;

    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);
        $this->init();
    }
}
