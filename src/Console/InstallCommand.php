<?php

namespace Matelink\ApiReference\Console;

use Illuminate\Console\Command;

/**
 * php artisan api-reference:install [--force]
 *
 * Publishes the browser assets (and the config file on first install).
 * Run it again with --force after `composer update` to refresh the assets.
 */
class InstallCommand extends Command
{
    protected $signature = 'api-reference:install {--force : Overwrite the published assets and config}';

    protected $description = 'Publish the API reference assets and config';

    public function handle(): int
    {
        $force = (bool) $this->option('force');

        // Assets are always refreshed: they are package code, not user edits.
        $this->callSilent('vendor:publish', ['--tag' => 'api-reference-assets', '--force' => true]);
        $this->components->info('Assets published to public/vendor/api-reference');

        $this->callSilent('vendor:publish', array_filter([
            '--tag' => 'api-reference-config',
            '--force' => $force ?: null,
        ]));
        $this->components->info('Config: config/api-reference.php' . ($force ? ' (overwritten)' : ' (kept if it already existed)'));

        $path = trim((string) config('api-reference.path', 'api-docs'), '/');
        $this->newLine();
        $this->line('  Open <href=' . url($path) . '>' . url($path) . '</> in your browser.');
        $this->line('  The page reads the OpenAPI file at: ' . config('api-reference.spec.file'));
        $this->line('  Set API_REFERENCE_ENABLED=false in .env to hide it.');

        return self::SUCCESS;
    }
}
