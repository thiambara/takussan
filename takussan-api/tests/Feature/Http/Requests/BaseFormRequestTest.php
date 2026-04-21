<?php

namespace Tests\Feature\Http\Requests;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class BaseFormRequestTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('api')
            ->post('/api/_test/base-request', function (TestBaseFormRequest $request) {
                return response()->json(['data' => $request->validated()]);
            });
    }

    public function test_trims_strings_and_nullifies_empty_strings(): void
    {
        $response = $this->postJson('/api/_test/base-request', [
            'first_name' => '  Amina  ',
            'last_name' => '   ',
            'note' => 'hello',
        ]);

        $response->assertOk();
        $response->assertJson([
            'data' => [
                'first_name' => 'Amina',
                'last_name' => null,
            ],
        ]);
    }

    public function test_recurses_into_nested_arrays(): void
    {
        $response = $this->postJson('/api/_test/base-request', [
            'first_name' => 'Amina',
            'profile' => ['bio' => '  hi  ', 'alias' => ''],
        ]);

        $response->assertOk();
        $response->assertJson([
            'data' => [
                'first_name' => 'Amina',
                'profile' => ['bio' => 'hi', 'alias' => null],
            ],
        ]);
    }

    public function test_authorize_defaults_to_false(): void
    {
        $instance = new class extends BaseFormRequest
        {
            public function rules(): array
            {
                return [];
            }
        };

        $this->assertFalse($instance->authorize());
    }
}

class TestBaseFormRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string'],
            'last_name' => ['nullable', 'string'],
            'note' => ['nullable', 'string'],
            'profile' => ['nullable', 'array'],
            'profile.bio' => ['nullable', 'string'],
            'profile.alias' => ['nullable', 'string'],
        ];
    }
}
