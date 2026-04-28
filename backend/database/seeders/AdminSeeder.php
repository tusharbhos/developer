<?php
// database/seeders/AdminSeeder.php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        // ── Create Master Admin ────────────────────────────
        User::updateOrCreate(
            ['email' => 'admin@channelpartner.network'],
            [
                'name'               => 'Master Admin',
                'email'              => 'admin@channelpartner.network',
                'password'           => Hash::make('Admin@123456'),
                'role'               => 'admin',
                'is_active'          => true,
                'email_verified_at'  => now(), // Admin is pre-verified
                'company_name'       => 'ChannelPartner.Network',
                'rera_no'            => 'ADMIN-001',
                'phone'              => '9999999999',
                'address'            => 'Mumbai, Maharashtra',
            ]
        );

        $this->command->info('✅ Admin created: admin@channelpartner.network / Admin@123456');

        // ── Seed Mock Projects ─────────────────────────────
        $projects = [
            [
                'name'       => 'Lodha Palava',
                'developer'  => 'Lodha Group',
                'location'   => 'Dombivli, Thane',
                'type'       => '2 BHK / 3 BHK',
                'price'      => '₹65 L – ₹1.2 Cr',
                'status'     => 'Ready to Move',
                'possession' => 'Dec 2025',
                'units'      => 120,
                'area'       => '650–1200 sq.ft',
                'badge'      => 'Hot',
                'is_active'  => true,
            ],
            [
                'name'       => 'Godrej Reserve',
                'developer'  => 'Godrej Properties',
                'location'   => 'Kandivali East, Mumbai',
                'type'       => '2 BHK / 3 BHK',
                'price'      => '₹1.4 Cr – ₹2.2 Cr',
                'status'     => 'Under Construction',
                'possession' => 'Jun 2027',
                'units'      => 48,
                'area'       => '900–1450 sq.ft',
                'badge'      => 'New Launch',
                'is_active'  => true,
            ],
            [
                'name'       => 'Prestige Park Grove',
                'developer'  => 'Prestige Group',
                'location'   => 'Whitefield, Bangalore',
                'type'       => '1 BHK / 2 BHK / 3 BHK',
                'price'      => '₹75 L – ₹1.8 Cr',
                'status'     => 'Under Construction',
                'possession' => 'Mar 2026',
                'units'      => 200,
                'area'       => '580–1380 sq.ft',
                'badge'      => null,
                'is_active'  => true,
            ],
            [
                'name'       => 'Sobha Dream Acres',
                'developer'  => 'Sobha Developers',
                'location'   => 'Panathur, Bangalore',
                'type'       => '1 BHK / 2 BHK',
                'price'      => '₹58 L – ₹1.1 Cr',
                'status'     => 'Ready to Move',
                'possession' => 'Sep 2024',
                'units'      => 75,
                'area'       => '540–920 sq.ft',
                'badge'      => 'Best Seller',
                'is_active'  => true,
            ],
            [
                'name'       => 'Mahindra Happinest',
                'developer'  => 'Mahindra Lifespaces',
                'location'   => 'Kalyan, Thane',
                'type'       => '1 BHK / 2 BHK',
                'price'      => '₹38 L – ₹72 L',
                'status'     => 'Under Construction',
                'possession' => 'Dec 2026',
                'units'      => 310,
                'area'       => '400–780 sq.ft',
                'badge'      => null,
                'is_active'  => true,
            ],
            [
                'name'       => 'Hiranandani Gardens',
                'developer'  => 'Hiranandani Developers',
                'location'   => 'Powai, Mumbai',
                'type'       => '2 BHK / 3 BHK / 4 BHK',
                'price'      => '₹2.2 Cr – ₹5.5 Cr',
                'status'     => 'Ready to Move',
                'possession' => 'Immediate',
                'units'      => 22,
                'area'       => '1100–2800 sq.ft',
                'badge'      => 'Luxury',
                'is_active'  => true,
            ],
        ];

        

        $this->command->info('✅ 6 mock projects seeded.');
    }
}