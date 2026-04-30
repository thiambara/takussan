<?php

namespace App\Models\Bases;

use App\Models\Bases\Traits\BaseModelTrait;
use App\Models\Concerns\HasQueryBuilder;
use Illuminate\Database\Eloquent\Model;

abstract class AbstractModel extends Model
{
    use BaseModelTrait, HasQueryBuilder;
}
