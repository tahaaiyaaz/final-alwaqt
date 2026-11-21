require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { z } = require('zod');
const sharp = require('sharp');

const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Initialize Firebase Admin SDK
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || 'authusersforalwaqt';
try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountPath) {
        const serviceAccount = require(path.resolve(serviceAccountPath));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin SDK initialized with Service Account file');
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: firebaseProjectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
        });
        console.log('✅ Firebase Admin SDK initialized with inline Env Credentials');
    } else {
        admin.initializeApp({
            projectId: firebaseProjectId
        });
        console.log('✅ Firebase Admin SDK initialized with Project ID fallback');
    }
} catch (error) {
    console.error('⚠️ Firebase Admin SDK initialization failed:', error.message);
}

// Ensure users table has is_admin column on startup
(async () => {
    try {
        await pool.execute("ALTER TABLE users ADD COLUMN is_admin TINYINT(1) DEFAULT 0");
        console.log("✅ Auto-migration: is_admin column verified on users table");
    } catch (e) {
        // Column already exists or table will be initialized via setup endpoint
    }
})();

// Configure multer storage in memory (buffer processing via sharp)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
        }
    }
});

// Trust proxy for rate limiting behind NGINX/Load Balancer (Hostinger)
app.set('trust proxy', true);

const PORT = process.env.PORT || 3005;

// ============================================
// Middleware
// ============================================
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,https://masjidtimings.masjidtimings.com,http://localhost,capacitor://localhost')
    .split(',')
    .map(o => o.trim());

const corsOptions = allowedOrigins.includes('*')
    ? { origin: true, credentials: true }
    : {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
    };

app.use(cors(corsOptions));

// Tightened Payload Limit - max 1MB for JSON standard API routes
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Global rate limiter (accommodates mobile CGNAT and shared WiFi networks)
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 600,                // 600 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    validate: false,
});
app.use(limiter);

// Strict rate limiter for sensitive authentication / verification routes
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10,                 // max 10 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth or verification attempts, please try again later.' },
    validate: false,
});

// ============================================
// Authentication & BOLA Authorization Middlewares
// ============================================
const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required. Please provide a Bearer token.' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        
        // Verify token with Firebase Admin
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const firebaseUid = decodedToken.uid;

        // Find the user in our DB using the verified firebase_uid
        const [userRows] = await pool.execute(
            'SELECT * FROM users WHERE firebase_uid = ?',
            [firebaseUid]
        );

        if (userRows.length === 0) {
            // Auto-register user in DB if they are verified by Firebase but missing locally
            const [result] = await pool.execute(
                'INSERT INTO users (firebase_uid, name, email) VALUES (?, ?, ?)',
                [firebaseUid, decodedToken.name || '', decodedToken.email || '']
            );
            const [newUser] = await pool.execute(
                'SELECT * FROM users WHERE id = ?',
                [result.insertId]
            );
            req.user = newUser[0];
        } else {
            req.user = userRows[0];
        }

        next();
    } catch (error) {
        console.error('Authentication error:', error.message);
        return res.status(401).json({ error: 'Unauthorized', details: error.message });
    }
};

// Optional user authentication: if a Bearer token is provided, verify it and attach req.user.
// Never blocks requests so community updates, muazzins, and mobile users can update seamlessly.
const optionalAuthenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const decodedToken = await admin.auth().verifyIdToken(idToken);
                const firebaseUid = decodedToken.uid;
                const [userRows] = await pool.execute(
                    'SELECT * FROM users WHERE firebase_uid = ?',
                    [firebaseUid]
                );
                if (userRows.length > 0) {
                    req.user = userRows[0];
                }
            } catch (tokenErr) {
                console.warn('Optional auth token note:', tokenErr.message);
            }
        }
    } catch (err) {
        console.warn('optionalAuthenticateUser note:', err.message);
    }
    next();
};

const authorizeMasjidManager = async (req, res, next) => {
    try {
        const { masjidId } = req.body;
        if (!masjidId) {
            return res.status(400).json({ error: 'Missing masjidId' });
        }

        const userId = req.user.id;
        const userEmail = req.user.email;
        const userPhone = req.user.mobile_number;

        // 1. Fetch masjid's creator_id
        const [masjidRows] = await pool.execute(
            'SELECT creator_id FROM masjids WHERE id = ?',
            [masjidId]
        );

        if (masjidRows.length === 0) {
            return res.status(404).json({ error: 'Masjid not found' });
        }

        const creatorId = masjidRows[0].creator_id;

        // If user is the creator, allow it
        if (creatorId && creatorId === userId) {
            return next();
        }

        // 2. Check if user is the assigned muazzin for this masjid (by email or phone)
        const [muazzinRows] = await pool.execute(
            'SELECT id FROM muazzins WHERE masjid_id = ? AND (email = ? OR phone = ?)',
            [masjidId, userEmail || '', userPhone || '']
        );

        if (muazzinRows.length > 0) {
            return next();
        }

        // Neither creator nor assigned muazzin
        return res.status(403).json({ error: 'Forbidden: You do not have permission to manage this masjid.' });
    } catch (error) {
        console.error('Authorization check error:', error);
        return res.status(500).json({ error: 'Internal server error during authorization check' });
    }
};

// ============================================
// Input Validation Helper Middlewares & Zod Schemas
// ============================================
const validateBody = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body);
        next();
    } catch (error) {
        next(error); // forward to global error handler
    }
};

const validateQuery = (schema) => (req, res, next) => {
    try {
        req.query = schema.parse(req.query);
        next();
    } catch (error) {
        next(error); // forward to global error handler
    }
};

const searchSchema = z.object({
    latitude: z.preprocess((val) => parseFloat(val), z.number().min(-90).max(90)),
    longitude: z.preprocess((val) => parseFloat(val), z.number().min(-180).max(180)),
    radiusInKm: z.preprocess((val) => val ? parseFloat(val) : 3, z.number().positive().max(20).optional().default(3)),
});

const addMasjidSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    countryName: z.string().optional().nullable(),
    stateName: z.string().optional().nullable(),
    cityName: z.string().optional().nullable(),
    contactNumber: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    olaPlaceId: z.string().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
    details: z.object({
        name: z.string().min(1, 'Masjid name is required'),
        addressLine1: z.string().optional().nullable(),
        timings: z.object({
            fajr: z.string().optional().nullable(),
            dhuhr: z.string().optional().nullable(),
            asar: z.string().optional().nullable(),
            maghrib: z.string().optional().nullable(),
            isha: z.string().optional().nullable(),
            jummatiming: z.union([z.string(), z.array(z.string())]).optional().nullable(),
            taraweeh: z.union([z.any(), z.array(z.any())]).optional().nullable(),
            events: z.array(z.any()).optional().nullable(),
        }).optional(),
    }),
});

const muazzinRegisterSchema = z.object({
    masjidId: z.preprocess((val) => parseInt(val, 10), z.number().int().positive()),
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(5, 'Invalid phone number'),
    address: z.string().min(1, 'Address is required'),
});

// ============================================
// Helper: Build masjid response object from DB rows
// ============================================
async function buildMasjidResponse(masjidRow) {
    const masjidId = masjidRow.id;

    // Get timings
    const [timingsRows] = await pool.execute(
        'SELECT fajr, dhuhr, asar, maghrib, isha FROM masjid_timings WHERE masjid_id = ?',
        [masjidId]
    );
    const timings = timingsRows[0] || {};

    // Get jumma timings
    const [jummaRows] = await pool.execute(
        'SELECT timing FROM jumma_timings WHERE masjid_id = ?',
        [masjidId]
    );
    const jummatiming = jummaRows.map(r => r.timing);

    // Get taraweeh entries
    const [taraweehRows] = await pool.execute(
        'SELECT time, parah, start_date AS startDate FROM taraweeh_entries WHERE masjid_id = ?',
        [masjidId]
    );

    // Get events
    const [eventRows] = await pool.execute(
        'SELECT id, name, description, speaker_name AS speakerName, frequency, time, date_info AS dateInfo FROM events WHERE masjid_id = ?',
        [masjidId]
    );

    // Add jumma and taraweeh to timings
    if (jummatiming.length > 0) timings.jummatiming = jummatiming;
    if (taraweehRows.length > 0) timings.taravi = taraweehRows;

    return {
        id: masjidId,
        mosqueId: masjidId,
        mosqueName: masjidRow.name,
        source: masjidRow.source || 'user',
        isVerified: masjidRow.is_verified === 1 || masjidRow.is_verified === true || typeof masjidRow.is_verified === 'undefined',
        olaLocation: {
            latitude: masjidRow.ola_latitude ? parseFloat(masjidRow.ola_latitude) : null,
            longitude: masjidRow.ola_longitude ? parseFloat(masjidRow.ola_longitude) : null,
        },
        location: {
            latitude: parseFloat(masjidRow.latitude),
            longitude: parseFloat(masjidRow.longitude),
        },
        details: {
            name: masjidRow.name,
            addressLine1: masjidRow.address_line1 || '',
            timings,
            events: eventRows,
            timingsImageUrl: masjidRow.timings_image_url || null,
        },
    };
}

// ============================================
// Helper: Haversine distance in km
// ============================================
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ============================================
// OLA Maps In-Memory Cache & Upstream Rate-Limit Protection
// ============================================
const olaSearchCache = new Map();       // Key: 'lat2_lng2_radius' -> timestamp
const olaReverseCache = new Map();      // Key: 'lat3_lng3' -> { address, timestamp }
const olaAutocompleteCache = new Map(); // Key: 'input_lat_lng' -> { data, timestamp }
let olaCooldownUntil = 0;               // Cooldown timestamp if Ola returns 429

// Periodic cleanup of expired cache entries every 15 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of olaSearchCache.entries()) {
        if (now - timestamp > 15 * 60 * 1000) olaSearchCache.delete(key);
    }
    for (const [key, item] of olaReverseCache.entries()) {
        if (now - item.timestamp > 30 * 60 * 1000) olaReverseCache.delete(key);
    }
    for (const [key, item] of olaAutocompleteCache.entries()) {
        if (now - item.timestamp > 15 * 60 * 1000) olaAutocompleteCache.delete(key);
    }
}, 15 * 60 * 1000);

// ============================================
// Routes
// ============================================

// -----------------------------------------------------------------
// GET /autocomplete: Proxy for OLA Maps Autocomplete API (Cached)
// -----------------------------------------------------------------
app.get('/api/autocomplete', async (req, res) => {
    try {
        const { input, lat, lng } = req.query;
        if (!input) {
            return res.status(400).json({ error: 'Input is required' });
        }

        const cleanInput = input.toLowerCase().trim();
        const cacheKey = `${cleanInput}_${lat ? parseFloat(lat).toFixed(2) : ''}_${lng ? parseFloat(lng).toFixed(2) : ''}`;
        const cached = olaAutocompleteCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 10 * 60 * 1000)) {
            return res.json(cached.data);
        }

        const olaApiKey = process.env.OLA_API_KEY;
        if (!olaApiKey) {
            return res.status(500).json({ error: 'OLA API key not configured' });
        }

        // If currently in cooldown due to previous 429, return empty predictions gracefully
        if (Date.now() < olaCooldownUntil) {
            return res.json({ predictions: [] });
        }

        // Build the URL based on provided coordinates
        let url = `https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(input)}&api_key=${olaApiKey}`;
        if (lat && lng) {
            url += `&location=${lat},${lng}`;
        }

        const olaRes = await fetch(url, { headers: { 'X-Request-Id': 'ALWAQT-BACKEND' } });

        if (olaRes.status === 429) {
            console.warn('⚠️ OLA Autocomplete 429 (Rate limit reached). Cooldown active for 60s.');
            olaCooldownUntil = Date.now() + 60 * 1000;
            return res.json({ predictions: [] });
        }

        const data = await olaRes.json();
        olaAutocompleteCache.set(cacheKey, { data, timestamp: Date.now() });

        return res.json(data);
    } catch (err) {
        console.error('Autocomplete Proxy Error:', err);
        return res.status(500).json({ error: 'Failed to fetch autocomplete suggestions' });
    }
});

// -----------------------------------------------------------------
// GET /reverseGeocode: Fetch address from OLA Reverse Geocoding API (Cached)
// -----------------------------------------------------------------
app.get('/api/reverseGeocode', async (req, res) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        // Cache resolution: 3 decimal places (~100m) with 30 minute TTL
        const cacheKey = `${parseFloat(lat).toFixed(3)}_${parseFloat(lng).toFixed(3)}`;
        const cached = olaReverseCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 30 * 60 * 1000)) {
            return res.json({ address: cached.address });
        }

        const olaApiKey = process.env.OLA_API_KEY;
        if (!olaApiKey) {
            return res.status(500).json({ error: 'OLA API key not configured' });
        }

        if (Date.now() < olaCooldownUntil) {
            return res.json({ address: 'Selected Location' });
        }

        const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${lat},${lng}&api_key=${olaApiKey}`;
        const olaRes = await fetch(url, { headers: { 'X-Request-Id': 'ALWAQT-BACKEND' } });

        if (olaRes.status === 429) {
            console.warn('⚠️ OLA Reverse Geocode 429 (Rate limit reached). Cooldown active for 60s.');
            olaCooldownUntil = Date.now() + 60 * 1000;
            return res.json({ address: 'Selected Location' });
        }

        const data = await olaRes.json();

        if (data && data.results && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            olaReverseCache.set(cacheKey, { address, timestamp: Date.now() });
            return res.json({ address });
        } else {
            return res.status(404).json({ error: 'Address not found' });
        }
    } catch (err) {
        console.error('Reverse Geocode Error:', err);
        return res.status(500).json({ error: 'Failed to reverse geocode' });
    }
});

// -----------------------------------------------------------------
// GET /api/debug-ip: Check client IP resolution & proxy headers
// -----------------------------------------------------------------
app.get('/api/debug-ip', (req, res) => {
    res.json({
        expressClientIp: req.ip,
        xForwardedFor: req.headers['x-forwarded-for'] || null,
        xRealIp: req.headers['x-real-ip'] || null,
        cfConnectingIp: req.headers['cf-connecting-ip'] || null,
        remoteAddress: req.socket.remoteAddress,
        isLoopback: req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'
    });
});

// -----------------------------------------------------------------
// GET /api/setup-database: Auto-create all tables for fresh deployment
// -----------------------------------------------------------------
app.get('/api/setup-database', (req, res, next) => {
    const token = req.headers['x-admin-token'] || req.query.token;
    const expectedToken = process.env.ADMIN_SETUP_TOKEN;
    if (!expectedToken) {
        console.warn('⚠️ Warning: ADMIN_SETUP_TOKEN is not defined in environment variables. Database setup endpoint is locked.');
        return res.status(403).json({ error: 'Forbidden: Database setup is disabled (missing ADMIN_SETUP_TOKEN).' });
    }
    if (token !== expectedToken) {
        return res.status(403).json({ error: 'Forbidden: Invalid setup token' });
    }
    next();
}, async (req, res) => {
    try {
        console.log('Starting Al Waqt database setup...');

        // ===== USERS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                firebase_uid VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                email VARCHAR(255),
                mobile_number VARCHAR(20) DEFAULT NULL,
                user_type ENUM('Muazzin', 'Not Muazzin') DEFAULT NULL,
                is_admin TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_firebase_uid (firebase_uid),
                INDEX idx_email (email)
            ) ENGINE=InnoDB
        `);
        console.log('✅ users table ready');

        // ===== MASJIDS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS masjids (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                latitude DECIMAL(10, 8) NOT NULL,
                longitude DECIMAL(11, 8) NOT NULL,
                address_line1 TEXT DEFAULT NULL,
                country_name VARCHAR(100) DEFAULT 'India',
                state_name VARCHAR(100) DEFAULT NULL,
                city_name VARCHAR(100) DEFAULT NULL,
                contact_number VARCHAR(20) DEFAULT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
                source ENUM('user', 'ola') DEFAULT 'user',
                ola_place_id VARCHAR(255) DEFAULT NULL,
                image_url VARCHAR(255) DEFAULT NULL,
                is_verified TINYINT(1) DEFAULT 1,
                ola_latitude DECIMAL(10, 8) DEFAULT NULL,
                ola_longitude DECIMAL(11, 8) DEFAULT NULL,
                timings_image_url VARCHAR(255) DEFAULT NULL,
                creator_id INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_location (latitude, longitude),
                FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB
        `);
        console.log('✅ masjids table ready');

        // ===== MASJID TIMINGS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS masjid_timings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL UNIQUE,
                fajr VARCHAR(20) DEFAULT NULL,
                dhuhr VARCHAR(20) DEFAULT NULL,
                asar VARCHAR(20) DEFAULT NULL,
                maghrib VARCHAR(20) DEFAULT NULL,
                isha VARCHAR(20) DEFAULT NULL,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE
            ) ENGINE=InnoDB
        `);
        console.log('✅ masjid_timings table ready');

        // ===== JUMMA TIMINGS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS jumma_timings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL,
                timing VARCHAR(20) NOT NULL,
                bayan_name VARCHAR(255) DEFAULT NULL,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                INDEX idx_masjid (masjid_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ jumma_timings table ready');

        // ===== TARAWEEH ENTRIES =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS taraweeh_entries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL,
                time VARCHAR(20) DEFAULT NULL,
                parah VARCHAR(50) DEFAULT NULL,
                start_date VARCHAR(50) DEFAULT NULL,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                INDEX idx_masjid (masjid_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ taraweeh_entries table ready');

        // ===== FAVORITES =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS favorites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                masjid_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_fav (user_id, masjid_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                INDEX idx_user (user_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ favorites table ready');

        // ===== EVENTS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                speaker_name VARCHAR(255) DEFAULT NULL,
                frequency ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL DEFAULT 'weekly',
                time VARCHAR(50) DEFAULT NULL,
                date_info VARCHAR(100) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                INDEX idx_masjid_events (masjid_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ events table ready');

        // ===== APP SETTINGS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS app_settings (
                setting_key VARCHAR(50) PRIMARY KEY,
                setting_value VARCHAR(255) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        `);
        await pool.execute("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('show_add_button', 'true')");
        console.log('✅ app_settings table ready');

        // ===== MUAZZINS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS muazzins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                address TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                INDEX idx_masjid_muazzins (masjid_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ muazzins table ready');

        // ===== MASJID CHANGES (History) =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS masjid_changes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL,
                user_id INT DEFAULT NULL,
                changed_by_name VARCHAR(255) DEFAULT 'Unknown Person',
                change_type ENUM('Muazzin', 'Follower', 'User', 'Unknown') DEFAULT 'Unknown',
                change_summary TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_masjid_changes (masjid_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ masjid_changes table ready');

        // ===== MASJID COMMUNITY VERIFICATIONS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS masjid_verifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL,
                verifier_phone VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                INDEX idx_verification_masjid (masjid_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ masjid_verifications table ready');

        // ===== MASJID REPORTS (LOCATION CHANGE / NOT EXIST) =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS masjid_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                masjid_id INT NOT NULL,
                report_type ENUM('location_change', 'does_not_exist') NOT NULL,
                new_lat DECIMAL(10, 8),
                new_lng DECIMAL(11, 8),
                original_lat DECIMAL(10, 8),
                original_lng DECIMAL(11, 8),
                image_url VARCHAR(255),
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (masjid_id) REFERENCES masjids(id) ON DELETE CASCADE,
                INDEX idx_report_masjid (masjid_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ masjid_reports table ready');

        // ===== MASJID REPORT VERIFICATIONS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS masjid_report_verifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                report_id INT NOT NULL,
                verifier_phone VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (report_id) REFERENCES masjid_reports(id) ON DELETE CASCADE,
                INDEX idx_verification_report (report_id)
            ) ENGINE=InnoDB
        `);
        console.log('✅ masjid_report_verifications table ready');

        // ===== APP ANNOUNCEMENTS =====
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS announcements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                is_active TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        `);
        console.log('✅ announcements table ready');

        // ===== AUTO MIGRATIONS (add missing columns for older DBs) =====
        try { await pool.execute("ALTER TABLE users ADD COLUMN is_admin TINYINT(1) DEFAULT 0"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN contact_number VARCHAR(20) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved'"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'hidden') DEFAULT 'approved'"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN source ENUM('user', 'ola') DEFAULT 'user'"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN ola_place_id VARCHAR(255) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN image_url VARCHAR(255) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN is_verified TINYINT(1) DEFAULT 1"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN ola_latitude DECIMAL(10, 8) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN ola_longitude DECIMAL(11, 8) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE events ADD COLUMN time VARCHAR(50) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE events ADD COLUMN date_info VARCHAR(100) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjid_reports ADD COLUMN original_lat DECIMAL(10, 8) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjid_reports ADD COLUMN original_lng DECIMAL(11, 8) DEFAULT NULL"); } catch (e) { /* exists */ }
        try { await pool.execute("ALTER TABLE masjids ADD COLUMN timings_image_url VARCHAR(255) DEFAULT NULL"); } catch (e) { /* exists */ }

        console.log('✅ All migrations applied');
        console.log('🕌 Al Waqt database setup completed successfully!');

        res.json({
            message: 'All Al Waqt database tables created successfully!',
            tables: ['users', 'masjids', 'masjid_timings', 'jumma_timings', 'taraweeh_entries',
                'favorites', 'events', 'app_settings', 'muazzins', 'masjid_changes', 'masjid_verifications', 'masjid_reports', 'masjid_report_verifications', 'announcements']
        });
    } catch (err) {
        console.error('Database setup failed:', err);
        res.status(500).json({ error: 'Database setup failed', details: err.message, code: err.code });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', async (req, res) => {
    try {
        await pool.execute('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
    }
});

// -----------------------------------------------------------------
// GET /api/activeAnnouncement: Fetch the current active announcement
// -----------------------------------------------------------------
app.get('/api/activeAnnouncement', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1');
        if (rows.length > 0) {
            res.json({ success: true, announcement: rows[0] });
        } else {
            res.json({ success: true, announcement: null });
        }
    } catch (err) {
        console.error('Fetch Announcement Error:', err);
        res.status(500).json({ error: 'Failed to fetch announcement' });
    }
});

// -----------------------------------------------------------------
// GET /api/settings: Fetch global application configuration settings
// -----------------------------------------------------------------
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT setting_key, setting_value FROM app_settings');
        const settings = {};
        rows.forEach(row => {
            // Check for booleans where appropriate
            if (row.setting_value === 'true') settings[row.setting_key] = true;
            else if (row.setting_value === 'false') settings[row.setting_key] = false;
            else settings[row.setting_key] = row.setting_value;
        });
        res.json(settings);
    } catch (err) {
        console.error('Settings API Error:', err);
        return res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// ------------------------------------------
// POST /signupwithmobile
// Register or fetch user by Firebase UID
// ------------------------------------------
app.post('/signupwithmobile', authLimiter, async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId || !orderId.uid) {
            return res.status(400).json({ error: 'Missing required field: orderId.uid' });
        }

        const { uid, name, email } = orderId;

        // Check if user exists
        const [existing] = await pool.execute(
            'SELECT * FROM users WHERE firebase_uid = ?',
            [uid]
        );

        let user;
        if (existing.length > 0) {
            user = existing[0];
            // Update name/email if changed
            if ((name && name !== user.name) || (email && email !== user.email)) {
                await pool.execute(
                    'UPDATE users SET name = ?, email = ? WHERE firebase_uid = ?',
                    [name || user.name, email || user.email, uid]
                );
            }
        } else {
            // Create new user
            const [result] = await pool.execute(
                'INSERT INTO users (firebase_uid, name, email) VALUES (?, ?, ?)',
                [uid, name || '', email || '']
            );
            const [newUser] = await pool.execute(
                'SELECT * FROM users WHERE id = ?',
                [result.insertId]
            );
            user = newUser[0];
        }

        res.json({
            userdata: {
                userid: user.id,
                id: user.firebase_uid,
                name: user.name,
                email: user.email,
                mobileNumber: user.mobile_number || '',
                userType: user.user_type || '',
                isAdmin: user.is_admin === 1,
            },
        });
    } catch (error) {
        console.error('signupwithmobile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// GET /api/user/me
// Get authenticated user details & admin status
// ------------------------------------------
app.get('/api/user/me', authenticateUser, async (req, res) => {
    try {
        const user = req.user;
        res.json({
            userdata: {
                userid: user.id,
                id: user.firebase_uid,
                name: user.name,
                email: user.email,
                mobileNumber: user.mobile_number || '',
                userType: user.user_type || '',
                isAdmin: user.is_admin === 1,
            }
        });
    } catch (error) {
        console.error('user/me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// PUT /updateUser
// Update user details (mobileNumber, userType, favorites)
// ------------------------------------------
app.put('/updateUser', async (req, res) => {
    try {
        const { userId, mobileNumber, userType, favorites } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'Missing required field: userId' });
        }

        // Find user — userId could be internal id or firebase_uid
        let [users] = await pool.execute(
            'SELECT * FROM users WHERE id = ? OR firebase_uid = ?',
            [isNaN(userId) ? 0 : userId, String(userId)]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Update profile fields
        const updates = [];
        const params = [];

        if (mobileNumber !== undefined) {
            updates.push('mobile_number = ?');
            params.push(mobileNumber);
        }
        if (userType !== undefined) {
            updates.push('user_type = ?');
            params.push(userType);
        }

        if (updates.length > 0) {
            params.push(user.id);
            await pool.execute(
                `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
        }

        // Handle favorites toggle
        if (favorites && Array.isArray(favorites)) {
            for (const masjidId of favorites) {
                const numMasjidId = parseInt(masjidId, 10);
                if (isNaN(numMasjidId)) continue;

                // Check if already favorited
                const [existingFav] = await pool.execute(
                    'SELECT id FROM favorites WHERE user_id = ? AND masjid_id = ?',
                    [user.id, numMasjidId]
                );

                if (existingFav.length > 0) {
                    // Remove (toggle off)
                    await pool.execute(
                        'DELETE FROM favorites WHERE user_id = ? AND masjid_id = ?',
                        [user.id, numMasjidId]
                    );
                } else {
                    // Add (toggle on)
                    await pool.execute(
                        'INSERT INTO favorites (user_id, masjid_id) VALUES (?, ?)',
                        [user.id, numMasjidId]
                    );
                }
            }
        }

        // Re-fetch updated user
        const [updatedUser] = await pool.execute(
            'SELECT * FROM users WHERE id = ?',
            [user.id]
        );

        res.json({
            message: 'User updated successfully',
            user: {
                userid: updatedUser[0].id,
                id: updatedUser[0].firebase_uid,
                name: updatedUser[0].name,
                email: updatedUser[0].email,
                mobileNumber: updatedUser[0].mobile_number || '',
                userType: updatedUser[0].user_type || '',
            },
        });
    } catch (error) {
        console.error('updateUser error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// GET /getNearestMasjid
// Fetch masjids within a radius (in km)
// ------------------------------------------
app.get('/getNearestMasjid', async (req, res) => {
    try {
        const { latitude, longitude, radiusInKm } = req.query;
        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Missing latitude or longitude' });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        const radius = parseFloat(radiusInKm) || 50;

        // Bounding box approximation for performance (1 degree ≈ 111 km)
        const latDelta = radius / 111;
        const lngDelta = radius / (111 * Math.cos((lat * Math.PI) / 180));

        const [rows] = await pool.execute(
            `SELECT * FROM masjids 
       WHERE latitude BETWEEN ? AND ? 
       AND longitude BETWEEN ? AND ?
       AND status = 'approved'`,
            [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
        );

        // Filter by exact haversine distance and build response
        const masjids = [];
        for (const row of rows) {
            const dist = haversineDistance(lat, lng, parseFloat(row.latitude), parseFloat(row.longitude));
            if (dist <= radius) {
                const masjidResponse = await buildMasjidResponse(row);
                masjids.push(masjidResponse);
            }
        }

        res.json({ masjids });
    } catch (error) {
        console.error('getNearestMasjid error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// GET /api/pendingMasjidsNearby
// Fetch pending items: Pending new masjids are returned ONLY to administrators.
// ------------------------------------------
app.get('/api/pendingMasjidsNearby', optionalAuthenticateUser, async (req, res) => {
    try {
        const { latitude, longitude, radiusInKm } = req.query;
        const lat = latitude ? parseFloat(latitude) : null;
        const lng = longitude ? parseFloat(longitude) : null;
        const radius = parseFloat(radiusInKm) || 10; // Unified 10km radius

        const pendingItems = [];
        const isAdmin = !!(req.user && req.user.is_admin === 1);

        // 1. Pending new masjids -> ONLY visible to verified database admins
        if (isAdmin) {
            const [masjidRows] = await pool.execute(
                `SELECT id, name, latitude, longitude, address_line1, image_url, status, created_at 
                 FROM masjids 
                 WHERE status = 'pending' 
                 ORDER BY created_at DESC 
                 LIMIT 50`
            );

            for (const row of masjidRows) {
                const dist = (lat !== null && lng !== null)
                    ? haversineDistance(lat, lng, parseFloat(row.latitude), parseFloat(row.longitude))
                    : null;
                pendingItems.push({
                    type: 'new_masjid',
                    id: row.id,
                    name: row.name,
                    distance: dist,
                    address: row.address_line1 || '',
                    latitude: row.latitude,
                    longitude: row.longitude,
                    image_url: row.image_url || null,
                    status: row.status,
                    isAdminReview: true
                });
            }
        }

        // 2. Fetch pending reports for approved masjids within radius (if lat/lng provided)
        if (lat !== null && lng !== null) {
            const latDelta = radius / 111;
            const lngDelta = radius / (111 * Math.cos((lat * Math.PI) / 180));

            const [reportRows] = await pool.execute(
                `SELECT r.*, m.name as masjid_name, m.latitude as m_lat, m.longitude as m_lng, m.address_line1
                 FROM masjid_reports r
                 JOIN masjids m ON r.masjid_id = m.id
                 WHERE m.latitude BETWEEN ? AND ?
                 AND m.longitude BETWEEN ? AND ?
                 AND r.status = 'pending'`,
                [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
            );

            for (const row of reportRows) {
                const dist = haversineDistance(lat, lng, parseFloat(row.m_lat), parseFloat(row.m_lng));
                if (dist <= radius) {
                    pendingItems.push({
                        type: 'report',
                        report_type: row.report_type,
                        id: row.id,
                        masjid_id: row.masjid_id,
                        name: row.masjid_name,
                        distance: dist,
                        address: row.address_line1 || '',
                        original_lat: row.m_lat,
                        original_lng: row.m_lng,
                        new_lat: row.new_lat,
                        new_lng: row.new_lng,
                        image_url: row.image_url
                    });
                }
            }
        }

        res.json({ pendingItems });
    } catch (error) {
        console.error('pendingMasjidsNearby error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// POST /api/admin/approveMasjid
// Admin only: Approve a pending masjid and make it live
// ------------------------------------------
app.post('/api/admin/approveMasjid', authenticateUser, async (req, res) => {
    try {
        if (!req.user || req.user.is_admin !== 1) {
            return res.status(403).json({ error: 'Forbidden: Admin access required.' });
        }

        const { masjidId } = req.body;
        if (!masjidId) {
            return res.status(400).json({ error: 'Missing masjidId' });
        }

        const [result] = await pool.execute(
            "UPDATE masjids SET status = 'approved', is_verified = 1 WHERE id = ?",
            [masjidId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Masjid not found' });
        }

        res.json({ success: true, message: 'Masjid approved successfully and is now live!' });
    } catch (error) {
        console.error('admin approveMasjid error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// POST /api/admin/rejectMasjid
// Admin only: Reject a pending masjid
// ------------------------------------------
app.post('/api/admin/rejectMasjid', authenticateUser, async (req, res) => {
    try {
        if (!req.user || req.user.is_admin !== 1) {
            return res.status(403).json({ error: 'Forbidden: Admin access required.' });
        }

        const { masjidId } = req.body;
        if (!masjidId) {
            return res.status(400).json({ error: 'Missing masjidId' });
        }

        const [result] = await pool.execute(
            "UPDATE masjids SET status = 'rejected' WHERE id = ?",
            [masjidId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Masjid not found' });
        }

        res.json({ success: true, message: 'Masjid rejected successfully' });
    } catch (error) {
        console.error('admin rejectMasjid error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// POST /api/verifyMasjid
// Submit a community verification for a pending masjid
// ------------------------------------------
app.post('/api/verifyMasjid', authLimiter, async (req, res) => {
    try {
        const { masjidId, verifierPhone } = req.body;
        if (!masjidId || !verifierPhone) {
            return res.status(400).json({ error: 'Missing masjidId or verifierPhone' });
        }

        await pool.execute(
            'INSERT INTO masjid_verifications (masjid_id, verifier_phone) VALUES (?, ?)',
            [masjidId, verifierPhone]
        );

        res.json({ message: 'Verification recorded successfully' });
    } catch (error) {
        console.error('verifyMasjid error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// POST /api/verifyReport
// Submit a community verification for a pending report
// ------------------------------------------
app.post('/api/verifyReport', authLimiter, async (req, res) => {
    try {
        const { reportId, verifierPhone } = req.body;
        if (!reportId || !verifierPhone) {
            return res.status(400).json({ error: 'Missing reportId or verifierPhone' });
        }

        await pool.execute(
            'INSERT INTO masjid_report_verifications (report_id, verifier_phone) VALUES (?, ?)',
            [reportId, verifierPhone]
        );

        res.json({ message: 'Report verification recorded successfully' });
    } catch (error) {
        console.error('verifyReport error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// POST /api/uploadImage
// Upload an image for verification and return the path
// ------------------------------------------
app.post('/api/uploadImage', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = 'verification-' + uniqueSuffix + '.webp';
        const outputPath = path.join(__dirname, 'uploads', filename);

        // Sanitize: re-encode to clean WebP, stripping EXIF/metadata and limiting dimensions
        await sharp(req.file.buffer)
            .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outputPath);

        res.json({ imageUrl: `/uploads/${filename}` });
    } catch (error) {
        console.error('uploadImage error:', error);
        res.status(500).json({ error: 'Error processing and saving image' });
    }
});

// ------------------------------------------
// POST /api/reportMasjid
// Submit a location_change or does_not_exist report for an existing masjid
// ------------------------------------------
app.post('/api/reportMasjid', async (req, res) => {
    try {
        const { masjidId, reportType, newLat, newLng, imageUrl } = req.body;

        if (!masjidId || !reportType) {
            return res.status(400).json({ error: 'Missing masjidId or reportType' });
        }
        if (reportType !== 'location_change' && reportType !== 'does_not_exist') {
            return res.status(400).json({ error: 'Invalid reportType' });
        }
        if (reportType === 'location_change' && (!newLat || !newLng)) {
            return res.status(400).json({ error: 'Missing new coordinates for location change' });
        }

        // Fetch the masjid's current (original) coordinates to snapshot them
        const [masjidRows] = await pool.execute(
            'SELECT latitude, longitude FROM masjids WHERE id = ?',
            [masjidId]
        );
        const originalLat = masjidRows.length > 0 ? masjidRows[0].latitude : null;
        const originalLng = masjidRows.length > 0 ? masjidRows[0].longitude : null;

        await pool.execute(
            `INSERT INTO masjid_reports (masjid_id, report_type, new_lat, new_lng, original_lat, original_lng, image_url, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [masjidId, reportType, newLat || null, newLng || null, originalLat, originalLng, imageUrl || null]
        );

        res.status(201).json({ message: 'Report submitted successfully for verification' });
    } catch (error) {
        console.error('reportMasjid error:', error);
        res.status(500).json({ error: 'Internal server error while submitting report' });
    }
});

// ------------------------------------------
// POST /addMasjid
// Add a new masjid with timings
// ------------------------------------------
app.post('/addMasjid', authenticateUser, validateBody(addMasjidSchema), async (req, res) => {
    try {
        const { latitude, longitude, countryName, stateName, cityName, contactNumber, details, source, olaPlaceId, imageUrl } = req.body;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Insert masjid — pending admin review before appearing on the map
            const statusVal = 'pending';
            const sourceVal = source === 'ola' ? 'ola' : 'user';

            const [masjidResult] = await connection.execute(
                `INSERT INTO masjids (name, latitude, longitude, address_line1, country_name, state_name, city_name, contact_number, status, source, ola_place_id, image_url, is_verified, ola_latitude, ola_longitude, creator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    details.name,
                    latitude,
                    longitude,
                    details.addressLine1 || null,
                    countryName || 'India',
                    stateName || null,
                    cityName || null,
                    contactNumber || null,
                    statusVal,
                    sourceVal,
                    olaPlaceId || null,
                    imageUrl || null,
                    0, // 0 unverified until approved by admin
                    source === 'ola' ? latitude : null,
                    source === 'ola' ? longitude : null,
                    req.user.id
                ]
            );

            const masjidId = masjidResult.insertId;
            const timings = details.timings || {};

            // Insert prayer timings
            await connection.execute(
                `INSERT INTO masjid_timings (masjid_id, fajr, dhuhr, asar, maghrib, isha)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    masjidId,
                    timings.fajr || null,
                    timings.dhuhr || null,
                    timings.asar || null,
                    timings.maghrib || null,
                    timings.isha || null,
                ]
            );

            // Insert jumma timings
            const jumma = timings.jummatiming;
            if (jumma) {
                const jummaArray = Array.isArray(jumma) ? jumma : [jumma];
                for (const time of jummaArray) {
                    if (time && time.trim()) {
                        await connection.execute(
                            'INSERT INTO jumma_timings (masjid_id, timing) VALUES (?, ?)',
                            [masjidId, time.trim()]
                        );
                    }
                }
            }

            // Insert taraweeh entries
            const taraweeh = timings.taraweeh || timings.taravi;
            if (taraweeh) {
                const taraweehArray = Array.isArray(taraweeh) ? taraweeh : [taraweeh];
                for (const entry of taraweehArray) {
                    if (entry && (entry.time || entry.parah || entry.startDate)) {
                        await connection.execute(
                            'INSERT INTO taraweeh_entries (masjid_id, time, parah, start_date) VALUES (?, ?, ?, ?)',
                            [masjidId, entry.time || null, entry.parah || null, entry.startDate || null]
                        );
                    }
                }
            }

            // Insert events
            const events = details.events;
            if (events && Array.isArray(events)) {
                for (const ev of events) {
                    if (ev && ev.name) {
                        await connection.execute(
                            'INSERT INTO events (masjid_id, name, description, speaker_name, frequency, time, date_info) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [masjidId, ev.name, ev.description || null, ev.speakerName || null, ev.frequency || 'weekly', ev.time || null, ev.dateInfo || null]
                        );
                    }
                }
            }

            await connection.commit();

            res.status(201).json({
                message: 'Masjid added successfully',
                masjidId,
            });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('addMasjid error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// PUT /updateMasjid
// Update masjid timings
// ------------------------------------------
app.put('/updateMasjid', optionalAuthenticateUser, async (req, res) => {
    try {
        const { masjidId, updates } = req.body;

        if (!masjidId) {
            return res.status(400).json({ error: 'Missing masjidId' });
        }

        // Verify masjid exists
        const [masjidRows] = await pool.execute(
            'SELECT id, is_verified, latitude, longitude, ola_latitude, ola_longitude FROM masjids WHERE id = ?',
            [masjidId]
        );
        if (masjidRows.length === 0) {
            return res.status(404).json({ error: 'Masjid not found' });
        }

        const isVerified = masjidRows[0].is_verified === 1;


        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Process mandatory verification if provided
            const verificationData = req.body.verificationData;
            if (verificationData) {
                const { lat, lng, phone, imageUrl } = verificationData;

                // Mark the masjid as verified so it doesn't repeatedly ask,
                // and save the image URL directly to the masjid profile.
                // WE NO LONGER AUTO-APPLY THE LAT/LNG. It goes to the queue.
                const verifyUpdates = [];
                const verifyParams = [];

                verifyUpdates.push('is_verified = 1');
                if (imageUrl) {
                    verifyUpdates.push('image_url = ?');
                    verifyParams.push(imageUrl);
                }

                if (verifyUpdates.length > 0) {
                    verifyParams.push(masjidId);
                    await connection.execute(
                        `UPDATE masjids SET ${verifyUpdates.join(', ')} WHERE id = ?`,
                        verifyParams
                    );
                }

                // Log the verification
                if (phone) {
                    await connection.execute(
                        'INSERT INTO masjid_verifications (masjid_id, verifier_phone) VALUES (?, ?)',
                        [masjidId, phone]
                    );

                    // Insert the new location into the reports queue for Admin approval
                    if (lat !== undefined && lng !== undefined) {
                        await connection.execute(
                            `INSERT INTO masjid_reports 
                            (masjid_id, report_type, new_lat, new_lng, original_lat, original_lng, image_url, status) 
                            VALUES (?, 'location_change', ?, ?, ?, ?, ?, 'pending')`,
                            [
                                masjidId,
                                lat,
                                lng,
                                masjidRows[0].ola_latitude || masjidRows[0].latitude || null,
                                masjidRows[0].ola_longitude || masjidRows[0].longitude || null,
                                imageUrl,
                            ]
                        );
                    }
                }
            }

            if (updates && updates.timings) {
                const timings = updates.timings;

                // Upsert prayer timings
                const [existingTimings] = await connection.execute(
                    'SELECT id FROM masjid_timings WHERE masjid_id = ?',
                    [masjidId]
                );

                if (existingTimings.length > 0) {
                    await connection.execute(
                        `UPDATE masjid_timings 
             SET fajr = ?, dhuhr = ?, asar = ?, maghrib = ?, isha = ?
             WHERE masjid_id = ?`,
                        [
                            timings.fajr || null,
                            timings.dhuhr || null,
                            timings.asar || null,
                            timings.maghrib || null,
                            timings.isha || null,
                            masjidId,
                        ]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO masjid_timings (masjid_id, fajr, dhuhr, asar, maghrib, isha)
             VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            masjidId,
                            timings.fajr || null,
                            timings.dhuhr || null,
                            timings.asar || null,
                            timings.maghrib || null,
                            timings.isha || null,
                        ]
                    );
                }

                // Replace jumma timings (delete old, insert new)
                if (timings.jummatiming !== undefined) {
                    await connection.execute(
                        'DELETE FROM jumma_timings WHERE masjid_id = ?',
                        [masjidId]
                    );
                    const jummaArray = Array.isArray(timings.jummatiming)
                        ? timings.jummatiming
                        : timings.jummatiming ? [timings.jummatiming] : [];
                    for (const entry of jummaArray) {
                        const time = typeof entry === 'string' ? entry : entry.time;
                        const bayan = typeof entry === 'string' ? null : entry.bayan;
                        if (time && time.trim()) {
                            await connection.execute(
                                'INSERT INTO jumma_timings (masjid_id, timing, bayan_name) VALUES (?, ?, ?)',
                                [masjidId, time.trim(), bayan || null]
                            );
                        }
                    }
                }

                // Replace taraweeh entries (delete old, insert new)
                const taraweeh = timings.taravi || timings.taraweeh;
                if (taraweeh !== undefined) {
                    await connection.execute(
                        'DELETE FROM taraweeh_entries WHERE masjid_id = ?',
                        [masjidId]
                    );
                    const taraweehArray = Array.isArray(taraweeh) ? taraweeh : taraweeh ? [taraweeh] : [];
                    for (const entry of taraweehArray) {
                        if (entry && (entry.time || entry.parah || entry.startDate)) {
                            await connection.execute(
                                'INSERT INTO taraweeh_entries (masjid_id, time, parah, start_date) VALUES (?, ?, ?, ?)',
                                [masjidId, entry.time || null, entry.parah || null, entry.startDate || null]
                            );
                        }
                    }
                }
            }

            // Replace events (delete old, insert new)
            if (updates && updates.events !== undefined) {
                await connection.execute(
                    'DELETE FROM events WHERE masjid_id = ?',
                    [masjidId]
                );
                if (Array.isArray(updates.events)) {
                    for (const ev of updates.events) {
                        if (ev && ev.name) {
                            await connection.execute(
                                'INSERT INTO events (masjid_id, name, description, speaker_name, frequency, time, date_info) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                [masjidId, ev.name, ev.description || null, ev.speakerName || null, ev.frequency || 'weekly', ev.time || null, ev.dateInfo || null]
                            );
                        }
                    }
                }
            }

            // Update masjid name if provided
            if (updates && updates.name) {
                await connection.execute(
                    'UPDATE masjids SET name = ? WHERE id = ?',
                    [updates.name, masjidId]
                );
            }

            // Update masjid address if provided
            if (updates && updates.addressLine1) {
                await connection.execute(
                    'UPDATE masjids SET address_line1 = ? WHERE id = ?',
                    [updates.addressLine1, masjidId]
                );
            }

            // Save timings board image if provided
            if (updates && updates.timingsImageUrl) {
                await connection.execute(
                    'UPDATE masjids SET timings_image_url = ? WHERE id = ?',
                    [updates.timingsImageUrl, masjidId]
                );
            }

            // --- History Tracking ---
            const { updater } = req.body;
            let changedByName = req.user?.name || 'Unknown Person';
            let changeType = req.user?.user_type || 'User';
            let internalUserId = req.user?.id || null;

            if (updater) {
                if (updater.name) changedByName = updater.name;
                if (updater.type) changeType = updater.type;
                else if (updater.role) changeType = updater.role;
            }

            // Ensure changeType matches MySQL ENUM('Muazzin', 'Follower', 'User', 'Unknown')
            const normalizedType = String(changeType).toLowerCase();
            if (normalizedType === 'muazzin') changeType = 'Muazzin';
            else if (normalizedType === 'follower') changeType = 'Follower';
            else if (normalizedType === 'user') changeType = 'User';
            else changeType = 'Unknown';

            const changeSummary = "Updated masjid details and timings";

            await connection.execute(
                'INSERT INTO masjid_changes (masjid_id, user_id, changed_by_name, change_type, change_summary) VALUES (?, ?, ?, ?, ?)',
                [masjidId, internalUserId, changedByName, changeType, changeSummary]
            );

            // Keep only last 5 changes
            const [keepRows] = await connection.execute(
                'SELECT id FROM masjid_changes WHERE masjid_id = ? ORDER BY created_at DESC LIMIT 5',
                [masjidId]
            );

            if (keepRows.length > 0) {
                const keepIds = keepRows.map(r => r.id);
                const placeholders = keepIds.map(() => '?').join(',');
                await connection.execute(
                    `DELETE FROM masjid_changes WHERE masjid_id = ? AND id NOT IN (${placeholders})`,
                    [masjidId, ...keepIds]
                );
            }

            await connection.commit();
            res.json({ message: 'Masjid updated successfully' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        require('fs').appendFileSync('error.log', String(error.stack || error) + '\n');
        console.error('updateMasjid error:', error);
        res.status(500).json({ error: 'Internal server error', details: String(error.stack || error) });
    }
});

// ------------------------------------------
// GET /api/masjid/:id/history
// Get recent change history for a masjid
// ------------------------------------------
app.get('/api/masjid/:id/history', async (req, res) => {
    try {
        const masjidId = req.params.id;
        if (!masjidId) return res.status(400).json({ error: 'Masjid ID required' });

        const [rows] = await pool.execute(
            'SELECT changed_by_name AS updated_by_name, change_type AS updater_role, change_summary, created_at FROM masjid_changes WHERE masjid_id = ? ORDER BY created_at DESC LIMIT 5',
            [masjidId]
        );

        res.json({ history: rows });
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// GET /api/masjid/:id
// Get a single masjid by ID with full details
// ------------------------------------------
app.get('/api/masjid/:id', async (req, res) => {
    try {
        const masjidId = req.params.id;

        if (masjidId === 'undefined' || !masjidId) {
            return res.status(400).json({ error: 'Invalid masjid ID' });
        }

        const [rows] = await pool.execute('SELECT * FROM masjids WHERE id = ?', [masjidId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Masjid not found' });
        }

        const masjidResponse = await buildMasjidResponse(rows[0]);
        res.json(masjidResponse);
    } catch (error) {
        console.error('GET /api/masjid/:id error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// POST /getFavoriteMasjids
// Get all favorite masjids for a user
// ------------------------------------------
app.post('/getFavoriteMasjids', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }

        // Find user — userId could be internal id or firebase_uid
        const [users] = await pool.execute(
            'SELECT id FROM users WHERE id = ? OR firebase_uid = ?',
            [isNaN(userId) ? 0 : userId, String(userId)]
        );

        if (users.length === 0) {
            return res.json({ masjids: [] });
        }

        const internalUserId = users[0].id;

        // Get favorited masjid IDs
        const [favRows] = await pool.execute(
            'SELECT masjid_id FROM favorites WHERE user_id = ?',
            [internalUserId]
        );

        if (favRows.length === 0) {
            return res.json({ masjids: [] });
        }

        const masjidIds = favRows.map(r => r.masjid_id);
        const placeholders = masjidIds.map(() => '?').join(',');

        const [masjidRows] = await pool.execute(
            `SELECT * FROM masjids WHERE id IN (${placeholders})`,
            masjidIds
        );

        const masjids = [];
        for (const row of masjidRows) {
            const masjidResponse = await buildMasjidResponse(row);
            masjids.push(masjidResponse);
        }

        res.json({ masjids });
    } catch (error) {
        console.error('getFavoriteMasjids error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ------------------------------------------
// GET /searchMasjidsWithOla
// Fetch from DB + OLA nearby API, deduplicate, auto-import
// ------------------------------------------
app.get('/searchMasjidsWithOla', validateQuery(searchSchema), async (req, res) => {
    try {
        const { latitude, longitude, radiusInKm } = req.query;
        const lat = latitude;
        const lng = longitude;
        const radius = radiusInKm; // Already capped at 20km max by Zod validation

        // 1. Fetch from DB
        const latDelta = radius / 111;
        const lngDelta = radius / (111 * Math.cos((lat * Math.PI) / 180));

        // Enforce hard cap of 50 records inside the SQL query to protect DB
        const [dbRows] = await pool.execute(
            `SELECT * FROM masjids 
             WHERE latitude BETWEEN ? AND ? 
             AND longitude BETWEEN ? AND ?
             LIMIT 50`,
            [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
        );

        const dbMasjids = [];
        const dbCoords = []; // for dedup checking — includes ALL statuses (approved, hidden, pending)
        for (const row of dbRows) {
            const rLat = parseFloat(row.latitude);
            const rLng = parseFloat(row.longitude);
            const dist = haversineDistance(lat, lng, rLat, rLng);
            if (dist <= radius) {
                if (row.status === 'approved') {
                    const masjidResponse = await buildMasjidResponse(row);
                    dbMasjids.push(masjidResponse);
                }
                // Always add to dbCoords for dedup — even hidden/pending masjids
                // This prevents OLA from re-importing a masjid that was hidden or whose location was changed
                dbCoords.push({ lat: rLat, lng: rLng, olaPlaceId: row.ola_place_id });
            }
        }

        // 2. Fetch from OLA Nearby Search API (with 15-minute grid cache & 429 protection)
        let olaMasjids = [];
        const olaApiKey = process.env.OLA_API_KEY;
        const searchGridKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${radius}`;
        const lastSearchedTime = olaSearchCache.get(searchGridKey);
        const shouldCallOla = olaApiKey && 
                              (!lastSearchedTime || (Date.now() - lastSearchedTime > 15 * 60 * 1000)) &&
                              (Date.now() > olaCooldownUntil);

        if (shouldCallOla) {
            try {
                olaSearchCache.set(searchGridKey, Date.now());
                // Using Advanced Nearby Search API for richer data, wider radius, and larger limits
                const olaUrl = `https://api.olamaps.io/places/v1/nearbysearch/advanced?location=${lat},${lng}&types=mosque&radius=${Math.round(radius * 1000)}&limit=50&withCentroid=true&api_key=${olaApiKey}`;
                console.log(`[OLA API] Fetching: ${olaUrl.replace(olaApiKey, 'HIDDEN')}`);
                const olaRes = await fetch(olaUrl, {
                    headers: { 'X-Request-Id': 'ALWAQT-BACKEND' },
                });

                if (olaRes.status === 429) {
                    console.warn('⚠️ OLA NearbySearch 429 (Rate limit reached). Cooldown active for 60s.');
                    olaCooldownUntil = Date.now() + 60 * 1000;
                } else if (olaRes.ok) {
                    const olaData = await olaRes.json();
                    const olaPredictions = olaData.predictions || olaData.results || [];
                    console.log(`[OLA API] Received ${olaPredictions.length} predictions`);

                for (const place of olaPredictions) {
                    const placeLat = place.geometry?.location?.lat;
                    const placeLng = place.geometry?.location?.lng;
                    const placeName = place.name || place.structured_formatting?.main_text || 'Unknown Masjid';
                    const placeId = place.place_id || place.reference || '';
                    const placeAddress = place.formatted_address || place.vicinity || '';

                    if (!placeLat || !placeLng) {
                        console.log(`[OLA API] Skipping missing coords for ${placeName}`);
                        continue;
                    }

                    // Check if within radius
                    const distFromUser = haversineDistance(lat, lng, placeLat, placeLng);
                    if (distFromUser > radius) {
                        console.log(`[OLA API] Skipping ${placeName} (too far: ${distFromUser}km)`);
                        continue;
                    }

                    // 3. Deduplication: check if any DB masjid is within 20m (0.02 km)
                    let isDuplicate = false;
                    for (const db of dbCoords) {
                        // Check by ola_place_id first
                        if (placeId && db.olaPlaceId === placeId) {
                            isDuplicate = true;
                            break;
                        }
                        // Check by distance (100 meters = 0.1 km)
                        const distBetween = haversineDistance(placeLat, placeLng, db.lat, db.lng);
                        if (distBetween <= 0.1) {
                            isDuplicate = true;
                            break;
                        }
                    }

                    if (isDuplicate) continue;

                    // 4. Auto-import to DB
                    try {
                        const [insertResult] = await pool.execute(
                            `INSERT INTO masjids (name, latitude, longitude, address_line1, source, ola_place_id, is_verified, ola_latitude, ola_longitude)
                             VALUES (?, ?, ?, ?, 'ola', ?, 0, ?, ?)`,
                            [placeName, placeLat, placeLng, placeAddress || null, placeId || null, placeLat, placeLng]
                        );
                        const newId = insertResult.insertId;

                        // Also insert empty timings row
                        await pool.execute(
                            `INSERT INTO masjid_timings (masjid_id) VALUES (?)`,
                            [newId]
                        );

                        // Add to dbCoords for dedup against remaining OLA results
                        dbCoords.push({ lat: placeLat, lng: placeLng, olaPlaceId: placeId });

                        olaMasjids.push({
                            id: newId,
                            mosqueId: newId,
                            mosqueName: placeName,
                            source: 'ola',
                            isVerified: false,
                            olaLocation: { latitude: placeLat, longitude: placeLng },
                            location: { latitude: placeLat, longitude: placeLng },
                            details: {
                                name: placeName,
                                addressLine1: placeAddress,
                                timings: {},
                            },
                        });
                    } catch (insertErr) {
                        // Duplicate key or other error — skip silently
                        console.warn('OLA import skip:', insertErr.message);
                    }
                }
                }
            } catch (olaErr) {
                console.error('OLA API error:', olaErr.message);
                // Continue with DB results even if OLA fails
            }
        }

        // 5. Return DB masjids first, then OLA masjids
        res.json({ masjids: [...dbMasjids, ...olaMasjids] });
    } catch (error) {
        console.error('searchMasjidsWithOla error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// Muazzin Onboarding APIs
// ============================================
app.get('/api/masjid/:id/muazzins/count', async (req, res) => {
    try {
        const masjidId = req.params.id;
        if (!masjidId) return res.status(400).json({ error: 'Masjid ID required' });

        const [rows] = await pool.execute('SELECT COUNT(*) as count FROM muazzins WHERE masjid_id = ?', [masjidId]);
        res.json({ count: rows[0].count });
    } catch (err) {
        console.error('Error fetching muazzin count:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/muazzin/register', validateBody(muazzinRegisterSchema), async (req, res) => {
    try {
        const { masjidId, name, email, phone, address } = req.body;

        const [result] = await pool.execute(
            'INSERT INTO muazzins (masjid_id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)',
            [masjidId, name, email, phone, address]
        );

        res.json({ success: true, muazzinId: result.insertId });
    } catch (err) {
        console.error('Error registering muazzin:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/muazzin/my-masjid', async (req, res) => {
    try {
        const email = req.query.email;
        const phone = req.query.phone;

        if (!email && !phone) {
            return res.status(400).json({ error: 'Must provide email or phone to lookup' });
        }

        // Search for this muazzin
        let muazzinQuery = 'SELECT masjid_id FROM muazzins WHERE email = ?';
        let queryParams = [email];

        if (phone) {
            muazzinQuery += ' OR phone = ?';
            queryParams.push(phone);
        }

        const [muazzinRows] = await pool.execute(muazzinQuery, queryParams);

        if (muazzinRows.length === 0) {
            return res.json({ hasMasjid: false });
        }

        const masjidId = muazzinRows[0].masjid_id;

        // Construct full masjid object
        const [masjidRows] = await pool.execute('SELECT * FROM masjids WHERE id = ?', [masjidId]);
        if (masjidRows.length === 0) {
            return res.json({ hasMasjid: false });
        }

        const fullMasjid = await buildMasjidResponse(masjidRows[0]);

        res.json({ hasMasjid: true, masjid: fullMasjid });
    } catch (err) {
        console.error('Error fetching muazzin masjid:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// Centralized Production Error Handling Middleware
// ============================================
app.use((err, req, res, next) => {
    // 1. Handle Zod validation errors
    if (err instanceof z.ZodError) {
        return res.status(400).json({
            error: 'Validation error',
            details: err.errors.map(e => ({
                path: e.path.join('.'),
                message: e.message
            }))
        });
    }

    // 2. Handle Multer / File Upload errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size limit exceeded. Maximum 5MB allowed.' });
    }
    if (err.message && err.message.includes('Only JPEG, PNG, and WebP')) {
        return res.status(400).json({ error: err.message });
    }

    // 3. Log all unhandled/general server/database errors internally
    console.error('Unhandled server exception:', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        sql: err.sql || undefined // log SQL syntax error internally if available
    });

    // 4. Return generic, safe JSON error response to client (never leak stack or SQL details)
    res.status(500).json({
        error: 'An unexpected error occurred on the server. Please try again later.'
    });
});

// ============================================
// Start server
// ============================================
app.listen(PORT, () => {
    console.log(`\n🕌 Al Waqt Backend Server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
