<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_presentation_links', function (Blueprint $table) {
            $table->unsignedBigInteger('presentation_id')->nullable()->after('project_name');
        });
    }

    public function down(): void
    {
        Schema::table('project_presentation_links', function (Blueprint $table) {
            $table->dropColumn('presentation_id');
        });
    }
};
