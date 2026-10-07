<?php

namespace Matelink\ApiReference\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Serves the API reference page and the OpenAPI JSON it renders.
 * Both return 404 when the page is disabled (config 'api-reference.enabled').
 */
class ApiReferenceController extends Controller
{
    /** The page shell. The UI itself is JavaScript in public/vendor/api-reference. */
    public function index()
    {
        $this->ensureEnabled();

        $title = (string) config('api-reference.title') ?: config('app.name', 'Laravel') . ' API';

        // Everything the browser code needs, passed as window.API_REFERENCE.
        $options = [
            'specUrl' => route('api-reference.spec', [], false),
            'title' => $title,
            'subtitle' => config('api-reference.subtitle'),
            'storagePrefix' => 'apiref.' . Str::slug($title),
            'login' => config('api-reference.login', []),
        ];

        // Cache-busting query string for the assets: changes whenever the published files change.
        $core = public_path('vendor/api-reference/core.js');
        $version = is_file($core) ? filemtime($core) : 0;

        return view('api-reference::index', compact('title', 'options', 'version'));
    }

    /** The OpenAPI JSON. Regenerated first when l5-swagger is installed and set to generate always. */
    public function spec(): Response|JsonResponse
    {
        $this->ensureEnabled();

        if (config('l5-swagger.defaults.generate_always')) {
            try {
                Artisan::call('l5-swagger:generate');
            } catch (\Throwable $e) {
                // Fall back to the previously generated file.
                Log::warning('API reference: spec regeneration failed: ' . $e->getMessage());
            }
        }

        $path = config('api-reference.spec.file');
        if (!$path || !is_file($path)) {
            return response()->json([
                'message' => 'OpenAPI file not found. Set api-reference.spec.file in config/api-reference.php.',
            ], 404);
        }

        return response(file_get_contents($path), 200, [
            'Content-Type' => 'application/json',
            'Cache-Control' => 'no-store',
        ]);
    }

    private function ensureEnabled(): void
    {
        abort_unless(config('api-reference.enabled'), 404);
    }
}
