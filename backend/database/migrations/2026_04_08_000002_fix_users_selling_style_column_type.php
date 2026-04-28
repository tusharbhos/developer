<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Keep as nullable text-compatible storage so JSON arrays from profile save
        // never get truncated even on older schemas/enums.
        DB::statement('ALTER TABLE `users` MODIFY `selling_style` LONGTEXT NULL');
    }

    public function down(): void
    {
        // Safe rollback to generic JSON-capable type for MySQL 8+.
        DB::statement('ALTER TABLE `users` MODIFY `selling_style` JSON NULL');
    }
};
