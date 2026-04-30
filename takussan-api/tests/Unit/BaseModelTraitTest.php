<?php

namespace Tests\Unit;

use App\Models\Bases\Traits\BaseModelTrait;
use Illuminate\Database\Eloquent\Model;
use Tests\TestCase;

class DummyModel extends Model
{
    use BaseModelTrait;

    protected $table = 'dummies';
}

class BaseModelTraitTest extends TestCase
{
    public function test_scope_filter(): void
    {
        $query = DummyModel::query()->filter([
            'name' => 'John',
            'name@like' => 'oh',
            'status' => ['active', 'pending'],
            'empty' => '',
        ]);

        $sql = $query->toSql();
        $this->assertStringContainsString('"name" = ?', $sql);
        $this->assertStringContainsString('"name" like ?', $sql);
        $this->assertStringContainsString('"status" in (?, ?)', $sql);
        $this->assertStringNotContainsString('empty', $sql);
    }
}
