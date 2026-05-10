// ============================================
// Central API Configuration
// Change the PROD_API_URL below to point to your backend server
// ============================================

const PROD_API_URL = 'https://masjidtimings.masjidtimings.com';

// On native mobile (APK), there is no Vite proxy, so we must hit the real server.
// On web dev, the empty string lets Vite proxy handle the routing.
const isNative = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
export const API_BASE = PROD_API_URL;

