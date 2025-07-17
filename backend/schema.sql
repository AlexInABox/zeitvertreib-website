-- D1 Database Schema for zeitvertreib-data
-- This file contains the database schema for the player statistics

CREATE TABLE IF NOT EXISTS playerdata (
    id TEXT PRIMARY KEY,
    experience INTEGER DEFAULT 0,
    playtime INTEGER DEFAULT 0,
    roundsplayed INTEGER DEFAULT 0,
    usedmedkits INTEGER DEFAULT 0,
    usedcolas INTEGER DEFAULT 0,
    pocketescapes INTEGER DEFAULT 0,
    usedadrenaline INTEGER DEFAULT 0,
    fakerank TEXT
);

-- Kills table to track all kill events
CREATE TABLE IF NOT EXISTS kills (
    attacker TEXT,
    target TEXT,
    timestamp INTEGER
);

-- Financial transactions table for Zeitvertreib Community Server
CREATE TABLE IF NOT EXISTS financial_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    reference_id TEXT,
    notes TEXT
);

-- Index for better query performance
CREATE INDEX IF NOT EXISTS idx_financial_transaction_type ON financial_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_transaction_date ON financial_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_category ON financial_transactions(category);

-- Recurring transactions table
CREATE TABLE IF NOT EXISTS recurring_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    start_date DATE NOT NULL,
    end_date DATE, -- NULL means no end date
    next_execution DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    reference_id TEXT,
    notes TEXT,
    last_executed DATE
);

-- Index for recurring transactions
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_transactions(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_next_execution ON recurring_transactions(next_execution);
CREATE INDEX IF NOT EXISTS idx_recurring_frequency ON recurring_transactions(frequency);

-- Sample data for testing (optional)
INSERT OR IGNORE INTO playerdata (
    id, experience, playtime, roundsplayed,
    usedmedkits, usedcolas, pocketescapes, usedadrenaline,
    fakerank
) VALUES (
    '76561198354414854@steam',
    12500, 7200, 45,
    25, 18, 7, 12,
    'Elite Commander'
);

-- Sample kills data for testing
INSERT OR IGNORE INTO kills (attacker, target, timestamp) VALUES
    ('76561198354414854@steam', '76561198000000001@steam', 1703980800),
    ('76561198354414854@steam', '76561198000000002@steam', 1703981200),
    ('76561198354414854@steam', 'anonymous', 1703981600),
    ('76561198354414854@steam', '76561198000000003@steam', 1703982000),
    ('76561198354414854@steam', '76561198000000004@steam', 1703982400),
    ('76561198000000005@steam', '76561198354414854@steam', 1703983000),
    ('76561198000000006@steam', '76561198354414854@steam', 1703983400),
    ('anonymous', '76561198354414854@steam', 1703983800),
    ('76561198000000007@steam', '76561198354414854@steam', 1703984200),
    ('76561198000000008@steam', '76561198354414854@steam', 1703984600);

-- Sample financial transactions data for testing
INSERT OR IGNORE INTO financial_transactions (
    transaction_type, category, amount, description, transaction_date, reference_id, notes
) VALUES 
    -- Income examples
    ('income', 'donation', 25.00, 'Community Spende - fear157', '2025-01-15', 'DON-001', 'PayPal Donation'),
    ('income', 'donation', 50.00, 'Community Spende - Anonymous', '2025-01-20', 'DON-002', 'Ko-fi Donation'),
    ('income', 'merchandise', 15.99, 'Zeitvertreib T-Shirt Verkauf', '2025-01-25', 'MERCH-001', 'Community Store'),
    ('income', 'donation', 10.00, 'Community Spende - Twitch', '2025-02-01', 'DON-003', 'Twitch Donation'),
    ('income', 'donation', 30.00, 'Community Spende - Discord', '2024-12-15', 'DON-004', 'Monthly Support'),
    
    -- Expense examples
    ('expense', 'hosting', 35.32, 'Dedicated Server - Hetzner', '2025-01-01', 'HOST-001', 'Monthly Server Hosting'),
    ('expense', 'hosting', 35.32, 'Dedicated Server - Hetzner', '2025-02-01', 'HOST-002', 'Monthly Server Hosting'),
    ('expense', 'hosting', 35.32, 'Dedicated Server - Hetzner', '2024-12-01', 'HOST-003', 'Monthly Server Hosting'),
    ('expense', 'services', 15.20, 'DDoS Protection - Cloudflare', '2025-01-02', 'SRV-001', 'Monthly DDoS Protection'),
    ('expense', 'services', 15.20, 'DDoS Protection - Cloudflare', '2025-02-02', 'SRV-002', 'Monthly DDoS Protection'),
    ('expense', 'domain', 12.99, 'Domain Renewal zeitvertreib.dev', '2025-01-15', 'DOM-001', 'Annual Domain Cost'),
    ('expense', 'services', 8.50, 'SSL Certificate', '2025-01-20', 'SSL-001', 'Wildcard SSL Certificate');

-- Sample recurring transactions data
INSERT OR IGNORE INTO recurring_transactions (
    transaction_type, category, amount, description, frequency, start_date, next_execution, reference_id, notes
) VALUES 
    ('expense', 'hosting', 35.32, 'Dedicated Server - Hetzner', 'monthly', '2025-01-01', '2025-02-01', 'HOST-REC-001', 'Monthly server hosting costs'),
    ('expense', 'services', 15.20, 'DDoS Protection - Cloudflare', 'monthly', '2025-01-02', '2025-02-02', 'SRV-REC-001', 'Monthly DDoS protection'),
    ('expense', 'domain', 12.99, 'Domain Renewal zeitvertreib.dev', 'yearly', '2025-01-15', '2026-01-15', 'DOM-REC-001', 'Annual domain renewal'),
    ('income', 'donation', 25.00, 'Recurring Patreon Support', 'monthly', '2025-01-01', '2025-02-01', 'PAT-REC-001', 'Monthly Patreon donation');
