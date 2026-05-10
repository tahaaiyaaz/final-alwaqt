import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Production-grade location module.
 * 
 * Architecture:
 * 1. App start → startLocationWatch() warms the cache via watchPosition
 * 2. User clicks "Current Location" → getUserLocation() returns cached position instantly (<50ms)
 * 3. If no cache yet, falls back to getCurrentPosition with fast settings
 */

// ============================================
// Warm Cache (kept alive by watchPosition)
// ============================================
let cachedPosition = null;
let watchId = null;

/**
 * Call this ONCE when app starts (e.g., in App.jsx useEffect).
 * It continuously keeps a fresh cached position in memory.
 */
export const startLocationWatch = () => {
    if (watchId !== null) return; // Already watching

    if (Capacitor.isNativePlatform()) {
        // Native: use Capacitor watcher
        Geolocation.checkPermissions().then(async (perms) => {
            if (perms.location === 'granted') {
                watchId = await Geolocation.watchPosition(
                    { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
                    (position, err) => {
                        if (position) {
                            cachedPosition = {
                                coords: {
                                    latitude: position.coords.latitude,
                                    longitude: position.coords.longitude,
                                }
                            };
                        }
                    }
                );
            }
        }).catch(() => { /* silently skip if no permission yet */ });
    } else {
        // Web: use browser watchPosition
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    cachedPosition = pos;
                },
                (err) => {
                    console.warn("Location watch error:", err.message);
                },
                {
                    enableHighAccuracy: false,
                    maximumAge: 60000,
                    timeout: 5000
                }
            );
        }
    }
};

/**
 * Stop watching (call on app unmount if needed).
 */
export const stopLocationWatch = () => {
    if (watchId === null) return;

    if (Capacitor.isNativePlatform()) {
        Geolocation.clearWatch({ id: watchId });
    } else {
        navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
};

// ============================================
// Get Location — instant if cache is warm
// ============================================

/**
 * Returns the user's current location.
 * - If watchPosition has warmed the cache → returns instantly (<50ms)
 * - If no cache → falls back to getCurrentPosition (fast settings first, then GPS)
 */
export const getUserLocation = async () => {
    // INSTANT: return cached position if available
    if (cachedPosition) {
        // Normalize to a consistent format
        const coords = cachedPosition.coords || cachedPosition;
        return {
            coords: {
                latitude: coords.latitude,
                longitude: coords.longitude,
            }
        };
    }

    // FALLBACK: no cache yet, fetch fresh
    if (Capacitor.isNativePlatform()) {
        const permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted') {
            const request = await Geolocation.requestPermissions();
            if (request.location !== 'granted') {
                throw new Error("Location permission denied by user.");
            }
        }

        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 3000 });
        cachedPosition = position; // Save for next time
        return {
            coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
            }
        };
    } else {
        const tryGetPosition = (options) => new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation is not supported by your browser"));
            } else {
                navigator.geolocation.getCurrentPosition(resolve, reject, options);
            }
        });

        try {
            // Phase 1: Fast — cached/network position
            const pos = await tryGetPosition({ enableHighAccuracy: false, timeout: 2000, maximumAge: 60000 });
            cachedPosition = pos;
            return pos;
        } catch {
            // Phase 2: GPS fallback
            const pos = await tryGetPosition({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
            cachedPosition = pos;
            return pos;
        }
    }
};
