import React, { useState, useEffect, useRef } from "react";
import { API_BASE } from "../config";
import { getBearerToken } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import MasjidCard from "../components/MasjidCard";
import FilterPopover from "../components/FilterPopover";
import { IoFilterSharp, IoLocateOutline, IoNotificationsOutline } from "react-icons/io5";
import { getUserLocation } from "../utils/geolocation";
import { FaMosque } from "react-icons/fa";
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ChangeMapCenter({ center }) {
    const map = useMap();
    if (center && center[0] && center[1]) {
        map.setView(center, 14);
    }
    return null;
}

function MapPickerClickHandler({ onMapClick }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng);
        }
    });
    return null;
}

const calculateDistance = (lat1, lon1, lat2, lon2) => {
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
};

const timeToMinutes = (timeStr, prayerName = "") => {
    if (!timeStr) return null;
    try {
        const cleaned = timeStr.toString().trim();
        const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3];
        if (period) {
            if (period.toUpperCase() === "PM" && hours !== 12) hours += 12;
            if (period.toUpperCase() === "AM" && hours === 12) hours = 0;
        }
        return hours * 60 + minutes;
    } catch {
        return null;
    }
};

const getNextPrayer = (timings) => {
    if (!timings) return { time: "---", name: "none" };
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const prayers = ["fajr", "dhuhr", "asar", "maghrib", "isha"];
    let nextPrayer = null;
    for (const prayer of prayers) {
        let timeStr = timings[prayer];
        if (!timeStr && prayer === "asar") timeStr = timings["asr"]; // fallback
        const mins = timeToMinutes(timeStr, prayer);
        if (mins !== null && mins > currentMinutes) {
            nextPrayer = { name: prayer, time: timeStr, diff: mins - currentMinutes };
            break;
        }
    }
    if (!nextPrayer && timings.fajr) {
        nextPrayer = { name: "fajr", time: timings.fajr };
    }
    return nextPrayer || { time: "---", name: "none" };
};

const toTitleCase = (str) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

import { useMasjid } from "../context/MasjidContext";
import { useTour } from "../context/TourContext";
import { driver } from "driver.js";

export default function HomePage() {
    const navigate = useNavigate();
    const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("@user") || "null"));

    useEffect(() => {
        const syncUserRole = async () => {
            try {
                const token = await getBearerToken();
                if (token) {
                    const baseUrl = API_BASE || window.location.origin;
                    const res = await fetch(`${baseUrl}/api/user/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data?.userdata) {
                            localStorage.setItem("@user", JSON.stringify(data.userdata));
                            setUser(data.userdata);
                        }
                    }
                }
            } catch (e) {
                console.warn("Could not sync user role:", e);
            }
        };
        syncUserRole();
    }, []);
    const { tourActive, tourStage, setTourStage, driverObj, setDriverObj, completeTour } = useTour();
    const {
        location, setLocation,
        locationName, setLocationName,
        masjids: masjidData, setMasjids,
        filters, setFilters,
        lastFetchedCoords, setLastFetchedCoords
    } = useMasjid();

    // UI Filter State (temporary before apply)
    const [distanceInput, setDistanceInput] = useState(filters.distance);
    const [prayerDropdown, setPrayerDropdown] = useState(filters.prayer);
    const [showSearchBtn, setShowSearchBtn] = useState(false);

    const [showFilterModal, setShowFilterModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // --- NEW: App Announcement State ---
    const [announcement, setAnnouncement] = useState(null);

    // --- NEW: Community Verification State ---
    const [pendingMasjids, setPendingMasjids] = useState([]);
    const [showNotificationModal, setShowNotificationModal] = useState(false);
    const [showMapPicker, setShowMapPicker] = useState(false);
    const mapPickerRef = useRef(null);
    const notificationRef = useRef(null);

    // Close notification dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (notificationRef.current && !notificationRef.current.contains(e.target)) {
                setShowNotificationModal(false);
            }
        };
        if (showNotificationModal) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showNotificationModal]);

    // Fetch active announcement on mount
    useEffect(() => {
        const fetchAnnouncement = async () => {
            try {
                const baseUrl = API_BASE || window.location.origin;
                const response = await fetch(`${baseUrl}/api/activeAnnouncement`);
                const data = await response.json();
                if (data.success && data.announcement) {
                    const seenKey = `seen_announcement_${data.announcement.id}`;
                    if (!localStorage.getItem(seenKey)) {
                        setAnnouncement(data.announcement);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch announcement:", err);
            }
        };
        fetchAnnouncement();
    }, []);

    const requestCurrentLocation = async () => {
        setLoading(true);
        try {
            const pos = await getUserLocation();
            setLocation({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
            });
            fetchLocationName(pos.coords.latitude, pos.coords.longitude);
        } catch (err) {
            setErrorMsg(`Could not get location: ${err.message}`);
            setLoading(false);
        }
    };

    const fetchLocationName = async (lat, lng) => {
        try {
            const res = await fetch(`${API_BASE}/api/reverseGeocode?lat=${lat}&lng=${lng}`);
            const data = await res.json();
            if (data && data.address) {
                // Shorten it to make it look like a nice landmark
                const parts = data.address.split(",");
                const shortAddress = parts.slice(0, 3).join(",").trim();
                setLocationName(shortAddress);
            } else {
                setLocationName("Unknown Location");
            }
        } catch (err) {
            console.error("Reverse geocode err:", err);
            setLocationName("Selected Location");
        }
    };

    useEffect(() => {
        if (!lastFetchedCoords) {
            requestCurrentLocation();
        } else {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- NEW: Tour Setup ---
    useEffect(() => {
        if (tourActive && tourStage === 'home') {
            // Give the UI a moment to render the dummy masjids or fetched ones
            setTimeout(() => {
                const tourDriver = driver({
                    showProgress: true,
                    allowClose: true,
                    steps: [
                        { element: '#tour-home-tab', popover: { title: 'Welcome to Al Waqt!', description: "Let's take a quick interactive tour to show you how the app works. You can view all Masjids near you right from this Home Tab.", side: "top", align: 'start' } },
                        { element: '#tour-add-tab', popover: { title: 'Add a Masjid', description: "Clicking here lets you add a new Masjid if it's missing from our database. Note: You must be logged in to add one.", side: "top", align: 'start' } },
                        { element: '#tour-profile-tab', popover: { title: 'Your Account', description: "Manage your profile, view saved Masjids, and handle your Muazzin settings here.", side: "top", align: 'end' } },
                        { element: '#tour-masjid-card-0', popover: { title: 'Masjid Details', description: "Here is a nearby Masjid. Click directly on this card right now to view its details!", side: "top", align: 'start' } }
                    ],
                    onDestroyStarted: () => {
                        tourDriver.destroy();
                        completeTour();
                    }
                });

                setDriverObj(tourDriver);
                tourDriver.drive();
            }, 600);
        }

        // Cleanup driver on unmount so it doesn't leak into the next page
        return () => {
            if (driverObj) driverObj.destroy();
        };
    }, [tourActive, tourStage, masjidData.length]); // use masjidData.length instead of nearbyMasjids (which is defined later)

    const prevRadiusRef = useRef(filters.distance);
    const hasInitialFetchRef = useRef(false);
    const isFetchingRef = useRef(false);

    useEffect(() => {
        if (location.lat && location.lng) {
            const distChanged = prevRadiusRef.current !== filters.distance;
            const movedDist = lastFetchedCoords ? calculateDistance(location.lat, location.lng, lastFetchedCoords.lat, lastFetchedCoords.lng) : 999;
            
            // Only fetch if initial fetch hasn't run, or moved > 500m, or distance filter changed.
            // NEVER refetch simply because masjidData.length === 0 (empty area)!
            const needsFetch = !hasInitialFetchRef.current || movedDist > 0.5 || distChanged;

            if (needsFetch && !isFetchingRef.current) {
                hasInitialFetchRef.current = true;
                prevRadiusRef.current = filters.distance;
                fetchMasjids(filters.distance);

                // Fetch pending masjids for community verification when location updates (only if logged in)
                if (user) {
                    fetchPendingMasjids(location.lat, location.lng);
                }
            }
        }
    }, [location.lat, location.lng, filters.distance, user?.id || user?.uid]);

    const fetchPendingMasjids = async (lat, lng) => {
        try {
            const baseUrl = API_BASE || window.location.origin;
            const token = await getBearerToken();
            const headers = {};
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }
            const res = await fetch(`${baseUrl}/api/pendingMasjidsNearby?latitude=${lat}&longitude=${lng}&radiusInKm=10`, {
                headers
            });
            const data = await res.json();
            if (data && data.pendingItems) {
                // Filter out items this user has already verified
                const verifiedMasjids = JSON.parse(localStorage.getItem('verified_masjids') || '[]');
                const verifiedReports = JSON.parse(localStorage.getItem('verified_reports') || '[]');
                let filtered = data.pendingItems.filter(item => {
                    if (item.type === 'new_masjid') return !verifiedMasjids.includes(item.id);
                    return !verifiedReports.includes(item.id);
                });

                // Apply daily limit only for standard community members, NOT for administrators reviewing masjids
                if (!user?.isAdmin) {
                    // --- Daily notification limit ---
                    const MAX_DAILY = 4;
                    const MAX_ABSOLUTE = 6;
                    const today = new Date().toISOString().slice(0, 10);
                    const storedLimit = JSON.parse(localStorage.getItem('notification_daily_limit') || '{}');

                    if (storedLimit.date !== today) {
                        localStorage.setItem('notification_daily_limit', JSON.stringify({ date: today, shown: 0 }));
                    }

                    const dailyData = JSON.parse(localStorage.getItem('notification_daily_limit') || '{}');
                    const alreadyShown = dailyData.shown || 0;
                    const remaining = Math.max(0, MAX_DAILY - alreadyShown);
                    const limit = Math.min(remaining, MAX_ABSOLUTE);
                    filtered = filtered.slice(0, limit);

                    localStorage.setItem('notification_daily_limit', JSON.stringify({
                        date: today,
                        shown: alreadyShown + filtered.length
                    }));
                }

                setPendingMasjids(filtered);
            }
        } catch (err) {
            console.error("Failed to fetch pending masjids:", err);
        }
    };

    const handleNavigateToVerification = (item) => {
        setShowNotificationModal(false);
        navigate("/verification", { state: { item } });
    };

    const fetchMasjids = async (dist) => {
        if (!location.lat || !location.lng || isFetchingRef.current) return;
        isFetchingRef.current = true;
        setLoading(true);
        try {
            const baseUrl = API_BASE || window.location.origin;
            const url = new URL(`${baseUrl}/searchMasjidsWithOla`);
            url.searchParams.append("latitude", location.lat);
            url.searchParams.append("longitude", location.lng);
            url.searchParams.append("radiusInKm", dist);

            const response = await fetch(url.toString(), {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            const data = await response.json();
            const masjids = data.masjids || [];

            setLastFetchedCoords({ lat: location.lat, lng: location.lng });

            const processed = masjids.map((m) => {
                let d = null;
                if (m.location?.latitude && m.location?.longitude) {
                    d = calculateDistance(
                        location.lat,
                        location.lng,
                        m.location.latitude,
                        m.location.longitude
                    );
                }
                const nextPrayer = getNextPrayer(m.details?.timings);
                return {
                    ...m,
                    distance: d,
                    distanceText:
                        d !== null
                            ? d < 1
                                ? `${Math.round(d * 1000)} m`
                                : `${d.toFixed(1)} km`
                            : "N/A",
                    nextPrayerTime: nextPrayer.time,
                    minsUntilPrayer: nextPrayer.diff,
                };
            });

            processed.sort((a, b) => {
                if (a.distance === null) return 1;
                if (b.distance === null) return -1;
                return a.distance - b.distance;
            });
            setMasjids(processed);
            setShowSearchBtn(false); // Hide button after search
        } catch (err) {
            console.error("Error fetching masjids", err);
            setErrorMsg("Failed to load masjids");
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    };

    // Auto-select the actual upcoming prayer on load if the state is set to 'auto'
    useEffect(() => {
        if (prayerDropdown === "auto" && masjidData && masjidData.length > 0) {
            const timings = masjidData[0]?.details?.timings;
            const next = getNextPrayer(timings);
            if (next && next.name && next.name !== "none") {
                setPrayerDropdown(next.name);
                setFilters((prev) => ({ ...prev, prayer: next.name }));
            }
        }
    }, [masjidData, prayerDropdown, setFilters]);

    const handleSearchClick = () => {
        setFilters({ ...filters, distance: distanceInput, prayer: prayerDropdown });
        // The useEffect will trigger fetchMasjids because filters changed
    };

    const handleDistanceChange = (e) => {
        setDistanceInput(e.target.value);
        setShowSearchBtn(true);
    };

    const handlePrayerChange = (e) => {
        setPrayerDropdown(e.target.value);
        setShowSearchBtn(true);
    };

    const handleAdvancedFilterApply = (config) => {
        const newFilters = {
            ...filters,
            distance: config.distance !== undefined ? config.distance : filters.distance,
            prayer: config.prayerType !== undefined ? config.prayerType : filters.prayer,
            timeFilterType: config.timeFilterType !== undefined ? config.timeFilterType : filters.timeFilterType,
            customTimeConfig: config.customTimeConfig !== undefined ? config.customTimeConfig : filters.customTimeConfig
        };
        setFilters(newFilters);
        setDistanceInput(newFilters.distance);
        setPrayerDropdown(newFilters.prayer);
        setShowFilterModal(false);
    };

    const computePrayerLists = (dataArray, prayerType) => {
        const prayers = ["fajr", "dhuhr", "asar", "maghrib", "isha", "jumma", "taraweeh"];
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        let timesByPrayer = {};

        prayers.forEach(prayer => {
            timesByPrayer[prayer] = dataArray
                .map(m => {
                    let timeStr = null;
                    if (prayer === "jumma") {
                        if (m.details?.timings?.jummatiming && m.details.timings.jummatiming.length > 0) {
                            timeStr = m.details.timings.jummatiming[0];
                        }
                    } else if (prayer === "taraweeh") {
                        if (m.details?.timings?.taravi && m.details.timings.taravi.length > 0) {
                            timeStr = m.details.timings.taravi[0].time;
                        }
                    } else {
                        timeStr = m.details?.timings?.[prayer];
                        if (!timeStr && prayer === "asar") timeStr = m.details?.timings?.["asr"];
                    }

                    return {
                        ...m,
                        targetPrayerTimeStr: timeStr,
                        targetPrayerMins: timeToMinutes(timeStr, prayer)
                    };
                })
                .filter(m => {
                    if (m.targetPrayerMins === null) return false;

                    // Apply Custom Time logic if applicable
                    if (filters.timeFilterType && filters.timeFilterType !== "prayer" && filters.customTimeConfig) {
                        const { type, singleTime, rangeStart, rangeEnd } = filters.customTimeConfig;
                        const prayerMins = m.targetPrayerMins;

                        if (type === "after" && singleTime) {
                            const [h, min] = singleTime.split(':').map(Number);
                            const selectedMins = (h * 60) + min;
                            return prayerMins > selectedMins;
                        } else if (type === "before" && singleTime) {
                            const [h, min] = singleTime.split(':').map(Number);
                            const selectedMins = (h * 60) + min;
                            return prayerMins < selectedMins;
                        } else if (type === "between" && rangeStart && rangeEnd) {
                            const [sh, smin] = rangeStart.split(':').map(Number);
                            const startMins = (sh * 60) + smin;
                            const [eh, emin] = rangeEnd.split(':').map(Number);
                            const endMins = (eh * 60) + emin;
                            return prayerMins >= startMins && prayerMins <= endMins;
                        }
                    }

                    return true;
                })
                .sort((a, b) => a.targetPrayerMins - b.targetPrayerMins);
        });

        let targetPrayer = prayerType.toLowerCase();
        let upcomingObj;

        if (targetPrayer !== "auto" && prayers.includes(targetPrayer)) {
            upcomingObj = {
                name: targetPrayer,
                masjids: timesByPrayer[targetPrayer] || []
            };
        } else {
            // Auto calculate based on daily prayers (exclude jumma/taraweeh from auto)
            const dailyPrayers = ["fajr", "dhuhr", "asar", "maghrib", "isha"];
            upcomingObj = dailyPrayers
                .map(prayer => {
                    const sorted = timesByPrayer[prayer] || [];
                    const latestMin = sorted.length > 0 ? sorted[sorted.length - 1].targetPrayerMins : 0;
                    return {
                        name: prayer,
                        masjids: sorted,
                        latestMin: latestMin
                    };
                })
                .find(p => p.masjids.length > 0 && p.latestMin >= currentMinutes);

            if (!upcomingObj) {
                upcomingObj = dailyPrayers
                    .map(prayer => ({ name: prayer, masjids: timesByPrayer[prayer] || [] }))
                    .find(p => p.masjids.length > 0) || { name: "fajr", masjids: [] };
            }
        }

        let finalMasjids = upcomingObj.masjids;

        return {
            prayerName: toTitleCase(upcomingObj.name),
            earliest: finalMasjids.slice(0, 10),
            late: [...finalMasjids].reverse().slice(0, 10)
        };
    };

    const prayerLists = computePrayerLists(masjidData, filters.prayer);
    const earliestMasjids = prayerLists.earliest;
    const lateMasjids = prayerLists.late;
    const globalPrayerName = prayerLists.prayerName;

    // Nearby shows all masjids (even those without timings, like OLA imports)
    const nearbyMasjids = [...masjidData]
        .sort((a, b) => {
            const aSource = a.source || 'user';
            const bSource = b.source || 'user';
            if (aSource === 'user' && bSource === 'ola') return -1;
            if (aSource === 'ola' && bSource === 'user') return 1;
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        })
        .slice(0, 10);

    const hasActiveCustomFilters = filters.timeFilterType && filters.timeFilterType !== "prayer";

    return (
        <div style={{ paddingBottom: 80, fontFamily: "'Inter', sans-serif" }}>
            {/* Header Area */}
            <div className="page-header" style={{ paddingBottom: 15, borderBottom: "1px solid #E5E7EB" }}>

                {/* Row 1: Logo and Title */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            <img src="/alwqt_image.png" alt="Al Waqt Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <h1 style={{ fontSize: 22, margin: 0, color: "#111827", fontWeight: "800", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                                Al Waqt
                            </h1>
                            <span style={{ fontSize: 13, color: "#6B7280", fontWeight: "600", letterSpacing: "0.2px" }}>
                                masjidtimings.com
                            </span>
                        </div>
                    </div>

                    {/* Notification Icon */}
                    <div style={{ position: "relative" }} ref={notificationRef}>
                        {user && (
                            <button
                                onClick={() => setShowNotificationModal(!showNotificationModal)}
                                style={{ background: "transparent", border: "none", cursor: "pointer", position: "relative", padding: "5px" }}
                            >
                                <IoNotificationsOutline size={26} color="#4B5563" />
                                {pendingMasjids.length > 0 && (
                                    <div style={{
                                        position: "absolute", top: 2, right: 2, backgroundColor: "#EF4444", color: "white",
                                        borderRadius: "50%", fontSize: "10px", width: "16px", height: "16px",
                                        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", border: "2px solid #fff"
                                    }}>
                                        {pendingMasjids.length}
                                    </div>
                                )}
                            </button>
                        )}

                        {showNotificationModal && pendingMasjids.length > 0 && (
                            <div className="notification-dropdown" style={{
                                position: "absolute", top: "48px", right: "-10px", width: "calc(100vw - 40px)", maxWidth: "360px",
                                background: "#fff",
                                borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.06)",
                                border: "1px solid rgba(229, 231, 235, 0.8)",
                                zIndex: 9999, maxHeight: "480px", overflowY: "auto", overflowX: "hidden"
                            }}>
                                {/* Header */}
                                <div style={{
                                    padding: "18px 18px 14px", borderBottom: "1px solid #F3F4F6",
                                    background: user?.isAdmin 
                                        ? "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(5,150,105,0.05) 100%)"
                                        : "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(5,150,105,0.02) 100%)",
                                    borderRadius: "16px 16px 0 0", position: "sticky", top: 0, zIndex: 1
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(135deg, #10B981, #059669)", flexShrink: 0 }} />
                                        <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#111827", margin: 0 }}>
                                            {user?.isAdmin ? "Admin Verification Portal" : "Help Verify Masjids"}
                                        </h3>
                                    </div>
                                    <p style={{ fontSize: "12px", color: "#6B7280", margin: 0, paddingLeft: 16 }}>
                                        {user?.isAdmin 
                                            ? `${pendingMasjids.length} item${pendingMasjids.length > 1 ? 's' : ''} require your approval`
                                            : `${pendingMasjids.length} item${pendingMasjids.length > 1 ? 's' : ''} near you need verification`}
                                    </p>
                                </div>

                                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                                    {pendingMasjids.map(pm => {
                                        const itemKey = pm.type === 'new_masjid' ? pm.id : `report-${pm.id}`;
                                        const isAdminItem = pm.isAdminReview || pm.type === 'new_masjid';
                                        const typeBadge = isAdminItem ? { label: '🛡️ Admin Review', color: '#059669', bg: '#D1FAE5' }
                                            : pm.report_type === 'location_change' ? { label: '📍 Location', color: '#F59E0B', bg: '#FFFBEB' }
                                                : { label: '❌ Missing', color: '#EF4444', bg: '#FEF2F2' };

                                        return (
                                            <div
                                                key={itemKey}
                                                onClick={() => handleNavigateToVerification(pm)}
                                                style={{
                                                    border: isAdminItem ? "1.5px solid #A7F3D0" : "1px solid #F3F4F6", 
                                                    borderRadius: "12px", padding: "14px",
                                                    background: isAdminItem ? "#F0FDF4" : "#FAFAFA", 
                                                    cursor: "pointer", transition: "all 0.2s ease"
                                                }}
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.borderColor = "#10B981";
                                                    e.currentTarget.style.background = "#DCFCE7";
                                                    e.currentTarget.style.transform = "translateY(-1px)";
                                                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(16,185,129,0.15)";
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.borderColor = isAdminItem ? "#A7F3D0" : "#F3F4F6";
                                                    e.currentTarget.style.background = isAdminItem ? "#F0FDF4" : "#FAFAFA";
                                                    e.currentTarget.style.transform = "translateY(0)";
                                                    e.currentTarget.style.boxShadow = "none";
                                                }}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pm.name}</span>
                                                    <span style={{
                                                        fontSize: "10px", fontWeight: "700", color: typeBadge.color,
                                                        background: typeBadge.bg, padding: "3px 8px", borderRadius: "20px",
                                                        flexShrink: 0, marginLeft: 8
                                                    }}>{typeBadge.label}</span>
                                                </div>
                                                <p style={{ fontSize: "11px", color: "#6B7280", margin: "0 0 10px 0" }}>
                                                    {pm.distance != null ? `~${pm.distance.toFixed(1)} km away` : 'Pending review'}{pm.address ? ` · ${pm.address}` : ''}
                                                </p>
                                                {pm.image_url && (
                                                    <img src={`${API_BASE}${pm.image_url}`} alt="Proof"
                                                        style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 10, marginBottom: 10, border: "1px solid #E5E7EB" }} />
                                                )}
                                                <div style={{
                                                    width: "100%", padding: "8px", borderRadius: "8px",
                                                    background: isAdminItem ? "linear-gradient(135deg, #10B981, #059669)" : "linear-gradient(135deg, #EFF6FF, #F0F9FF)",
                                                    color: isAdminItem ? "#ffffff" : "#2563EB", fontWeight: "600", fontSize: "12px",
                                                    border: isAdminItem ? "none" : "1px solid #BFDBFE", textAlign: "center"
                                                }}>
                                                    {isAdminItem ? "Review & Approve →" : "Review & Verify →"}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Empty Notification Dropdown */}
                        {showNotificationModal && pendingMasjids.length === 0 && (
                            <div style={{
                                position: "absolute", top: "40px", right: 0, width: "250px", background: "#fff",
                                borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.15)", border: "1px solid #E5E7EB",
                                zIndex: 9999, padding: "16px", textAlign: "center"
                            }}>
                                <p style={{ fontSize: "14px", color: "#6B7280" }}>No pending masjids nearby to verify. Thanks for checking!</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 2: Location Bar + Filter Icon */}
                <div className="header-search-row" style={{ display: "flex", gap: 10, position: "relative", zIndex: 100, marginBottom: 12, alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                        <SearchBar
                            setSendCoords={(coords) => {
                                setLocation(coords);
                                fetchLocationName(coords.lat, coords.lng);
                            }}
                            defaultLocationText={locationName}
                            defaultLocationCoords={location}
                            requestCurrentLocation={requestCurrentLocation}
                            isHeader={true}
                            onSelectOnMap={() => {
                                setShowMapPicker(true);
                                setTimeout(() => {
                                    mapPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 100);
                            }}
                        />
                    </div>

                    {/* Current Location Button */}
                    <button
                        onClick={requestCurrentLocation}
                        style={{
                            background: "transparent",
                            border: "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                            color: "#4B5563",
                            flexShrink: 0,
                            padding: "8px 8px 8px 0"
                        }}
                        title="Use current location"
                    >
                        <IoLocateOutline size={22} />
                    </button>

                </div>

                {/* Row 3: Filter Chips */}
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 5, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>

                    {/* Prayer Dropdown Chip */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                        <select
                            value={prayerDropdown}
                            onChange={handlePrayerChange}
                            style={{
                                padding: "8px 30px 8px 14px", borderRadius: 20,
                                border: "1px solid #E5E7EB", backgroundColor: "#fff",
                                fontSize: 13, color: "#374151", fontWeight: "600",
                                outline: "none", appearance: "none", cursor: "pointer",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="%239CA3AF" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>')`,
                                backgroundRepeat: "no-repeat", backgroundPositionX: "calc(100% - 6px)", backgroundPositionY: "50%",
                                minWidth: 140
                            }}
                        >
                            {prayerDropdown === "auto" && <option value="auto">Loading...</option>}
                            <option value="fajr">Fajr</option>
                            <option value="dhuhr">Zohar / Dhuhr</option>
                            <option value="asar">Asr</option>
                            <option value="maghrib">Maghrib</option>
                            <option value="isha">Isha</option>
                            <option value="jumma">Jummah</option>
                            <option value="taraweeh">Taraweeh</option>
                        </select>
                    </div>

                    {/* Distance Chip */}
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 20, padding: "0 10px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                        <span style={{ color: "#374151", fontSize: 13, fontWeight: "600" }}>Radius:</span>
                        <input
                            type="number"
                            value={distanceInput}
                            onChange={handleDistanceChange}
                            style={{
                                border: "none", width: "35px", padding: "8px 5px",
                                fontSize: 13, fontWeight: "600", color: "#111827", outline: "none",
                                textAlign: "center", background: "transparent"
                            }}
                            min="0.1"
                            step="0.5"
                        />
                        <span style={{ color: "#374151", fontSize: 13, fontWeight: "600" }}>km</span>
                    </div>

                    {/* Filter Button */}
                    <button
                        className="advanced-filter-btn"
                        onClick={() => setShowFilterModal(true)}
                        style={{
                            background: "#fff",
                            border: "1px solid #E5E7EB",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                            color: hasActiveCustomFilters ? "#10B981" : "#4B5563",
                            flexShrink: 0, position: "relative",
                            padding: "7px 12px",
                            borderRadius: 20,
                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                        }}
                    >
                        <IoFilterSharp size={18} />
                        {hasActiveCustomFilters && (
                            <div style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, backgroundColor: "#EF4444", borderRadius: "50%", border: "2px solid #fff" }} />
                        )}
                    </button>

                </div>

                {/* Row 4: Apply Button (only shown when filters change) */}
                {showSearchBtn && (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
                        <button
                            onClick={handleSearchClick}
                            className="btn-primary"
                            style={{
                                padding: "10px 30px", borderRadius: 20, fontSize: 14,
                                boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)", width: "100%"
                            }}
                        >
                            Search Filtered
                        </button>
                    </div>
                )}
            </div>

            {/* Map Picker (shown when "Select on Map" is clicked from search dropdown) */}
            {showMapPicker && (
                <div ref={mapPickerRef} style={{
                    padding: "12px 20px 15px", borderBottom: "1px solid #E5E7EB",
                    backgroundColor: "#FAFAFA"
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: "600", color: "#374151", margin: 0 }}>
                            📍 Tap on the map to select a location
                        </p>
                        <button
                            onClick={() => setShowMapPicker(false)}
                            style={{ background: "none", border: "none", fontSize: 13, fontWeight: "600", color: "#EF4444", cursor: "pointer", padding: "4px 8px" }}
                        >Close</button>
                    </div>
                    <div style={{ height: 250, borderRadius: 12, overflow: "hidden", border: "1px solid #E5E7EB" }}>
                        <MapContainer
                            center={[location.lat || 17.385, location.lng || 78.4867]}
                            zoom={13}
                            style={{ height: "100%", width: "100%" }}
                        >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <Marker position={[location.lat || 17.385, location.lng || 78.4867]} />
                            <ChangeMapCenter center={[location.lat || 17.385, location.lng || 78.4867]} />
                            <MapPickerClickHandler onMapClick={(latlng) => {
                                setLocation({ lat: latlng.lat, lng: latlng.lng });
                                fetchLocationName(latlng.lat, latlng.lng);
                                setShowMapPicker(false);
                            }} />
                        </MapContainer>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="page-padding" style={{ paddingTop: 0 }}>
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner" />
                    </div>
                ) : errorMsg && masjidData.length === 0 ? (
                    <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        minHeight: "60vh", textAlign: "center", padding: "20px"
                    }}>
                        <div style={{
                            width: 80, height: 80, background: "#ECFDF5", borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20
                        }}>
                            <IoLocateOutline size={40} color="#10B981" />
                        </div>
                        <h2 style={{ fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 10 }}>Enable Location</h2>
                        <p style={{ fontSize: 15, color: "#4B5563", marginBottom: 24, lineHeight: 1.5, maxWidth: 300 }}>
                            Al Waqt needs your location to find nearby masjids and provide accurate prayer timings for you.
                        </p>
                        <button
                            onClick={requestCurrentLocation}
                            style={{
                                padding: "14px 28px", background: "linear-gradient(135deg, #10B981, #059669)",
                                color: "#fff", border: "none", borderRadius: "14px", fontSize: 16, fontWeight: "700",
                                cursor: "pointer", boxShadow: "0 4px 12px rgba(16,185,129,0.3)"
                            }}
                        >
                            Allow Location Access
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Nearby Masjids Section */}
                        <div className="section-header">
                            <span className="section-title">Nearby</span>
                            <button className="see-all" onClick={() => navigate("/masjids", {
                                state: {
                                    masjids: masjidData,
                                    title: "Nearby Masjids",
                                    sortType: "distance"
                                }
                            })}>See All</button>
                        </div>
                        {nearbyMasjids.length === 0 ? (
                            <p style={{ color: "#6B7280", fontSize: 14 }}>No masjids found within {filters.distance} km</p>
                        ) : (
                            <div className="horizontal-scroll">
                                {nearbyMasjids.map((m, idx) => (
                                    <div key={m.id || idx} id={idx === 0 ? "tour-masjid-card-0" : undefined} style={{ minWidth: 280 }}>
                                        <MasjidCard
                                            MasjidName={m.details?.name || m.mosqueName}
                                            MasjidDistance={m.distanceText}
                                            NextNamazTime={m.targetPrayerTimeStr}
                                            masjid={m}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Early Prayer Section */}
                        <div className="section-header">
                            <span className="section-title">Earliest {globalPrayerName}</span>
                            <button className="see-all" onClick={() => navigate("/masjids", { state: { masjids: earliestMasjids } })}>See All</button>
                        </div>
                        {earliestMasjids.length === 0 ? (
                            <p style={{ color: "#6B7280", fontSize: 14 }}>No timings available</p>
                        ) : (
                            <div className="horizontal-scroll">
                                {earliestMasjids.map((m, idx) => (
                                    <MasjidCard
                                        key={m.id || idx}
                                        MasjidName={m.details?.name || m.mosqueName}
                                        MasjidDistance={m.distanceText}
                                        NextNamazTime={m.targetPrayerTimeStr}
                                        masjid={m}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Late Prayer Section */}
                        <div className="section-header">
                            <span className="section-title">Late {globalPrayerName}</span>
                            <button className="see-all" onClick={() => navigate("/masjids", { state: { masjids: lateMasjids } })}>See All</button>
                        </div>
                        {lateMasjids.length === 0 ? (
                            <p style={{ color: "#6B7280", fontSize: 14 }}>No timings available</p>
                        ) : (
                            <div className="horizontal-scroll">
                                {lateMasjids.map((m, idx) => (
                                    <MasjidCard
                                        key={m.id || idx}
                                        MasjidName={m.details?.name || m.mosqueName}
                                        MasjidDistance={m.distanceText}
                                        NextNamazTime={m.targetPrayerTimeStr}
                                        masjid={m}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* --- PREMIUM ANNOUNCEMENT POPUP --- */}
                {announcement && (
                    <div
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                localStorage.setItem(`seen_announcement_${announcement.id}`, "true");
                                setAnnouncement(null);
                            }
                        }}
                        style={{
                            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                            background: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(8px)",
                            zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
                            padding: "24px", animation: "fadeIn 0.3s ease"
                        }}>
                        <div style={{
                            background: "#ffffff", borderRadius: "24px", width: "100%", maxWidth: "420px",
                            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255,255,255,0.2) inset", overflow: "hidden",
                            animation: "tourPopIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)", position: "relative"
                        }}>
                            {/* Decorative Header Background */}
                            <div style={{
                                position: "absolute", top: 0, left: 0, right: 0, height: "140px",
                                background: "linear-gradient(135deg, #10B981, #059669)",
                                borderBottomLeftRadius: "50% 20%", borderBottomRightRadius: "50% 20%",
                                zIndex: 0
                            }} />

                            {/* Close Button */}
                            <button
                                onClick={() => {
                                    localStorage.setItem(`seen_announcement_${announcement.id}`, "true");
                                    setAnnouncement(null);
                                }}
                                style={{
                                    position: "absolute", top: "16px", right: "16px",
                                    background: "rgba(255, 255, 255, 0.2)", backdropFilter: "blur(4px)", border: "none",
                                    width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#fff", cursor: "pointer", zIndex: 2, transition: "background 0.2s"
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)"}
                                onMouseOut={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
                            >
                                <IoCloseOutline size={20} />
                            </button>

                            {/* Content */}
                            <div style={{ position: "relative", zIndex: 1, padding: "32px 24px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                                <div style={{
                                    width: 72, height: 72, background: "#ffffff", borderRadius: "50%",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    boxShadow: "0 8px 24px rgba(16, 185, 129, 0.25)", marginBottom: "20px"
                                }}>
                                    <IoNotificationsOutline size={36} color="#10B981" />
                                </div>
                                <h2 style={{ margin: "0 0 12px 0", fontSize: 24, fontWeight: "800", color: "#111827", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                                    {announcement.title}
                                </h2>
                                <p style={{ margin: "0 0 24px 0", fontSize: 16, lineHeight: 1.6, color: "#4B5563", whiteSpace: "pre-wrap" }}>
                                    {announcement.message}
                                </p>
                                <button
                                    onClick={() => {
                                        localStorage.setItem(`seen_announcement_${announcement.id}`, "true");
                                        setAnnouncement(null);
                                    }}
                                    style={{
                                        width: "100%", padding: "14px", background: "linear-gradient(135deg, #10B981, #059669)",
                                        color: "white", border: "none", borderRadius: "14px", fontSize: 16, fontWeight: "700",
                                        cursor: "pointer", boxShadow: "0 8px 16px -4px rgba(16, 185, 129, 0.3)",
                                        transition: "transform 0.2s, box-shadow 0.2s"
                                    }}
                                    onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 20px -4px rgba(16, 185, 129, 0.4)"; }}
                                    onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 16px -4px rgba(16, 185, 129, 0.3)"; }}
                                >
                                    Awesome, thanks!
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Relocated Mini Map Widget at the bottom */}
                {!loading && location.lat && location.lng && (
                    <div style={{ marginTop: 20, marginBottom: 20 }}>
                        <div className="section-header">
                            <span className="section-title">Map View</span>
                        </div>
                        <div
                            style={{ borderRadius: 16, overflow: "hidden", height: 200, position: "relative", zIndex: 1, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", border: "1px solid #E5E7EB" }}
                            onClick={() => navigate("/map", { state: { location, masjids: masjidData } })}
                        >
                            <div style={{ position: "absolute", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.02)", transition: "background-color 0.2s" }}>
                                <span style={{ backgroundColor: "#fff", padding: "8px 18px", borderRadius: 24, fontSize: 14, fontWeight: "700", color: "#10B981", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                                    Open Interactive Map 🗺️
                                </span>
                            </div>
                            <MapContainer
                                center={[location.lat, location.lng]}
                                zoom={14}
                                style={{ height: "100%", width: "100%" }}
                                zoomControl={false}
                                scrollWheelZoom={false}
                                dragging={false}
                                doubleClickZoom={false}
                                touchZoom={false}
                            >
                                <TileLayer
                                    attribution='&copy; OpenStreetMap'
                                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <ChangeMapCenter center={[location.lat, location.lng]} />
                                <Marker position={[location.lat, location.lng]} />
                                {masjidData.slice(0, 10).map((m, idx) => {
                                    if (!m.location?.latitude || !m.location?.longitude) return null;
                                    return (
                                        <Marker
                                            key={idx}
                                            position={[m.location.latitude, m.location.longitude]}
                                        >
                                            <Tooltip permanent direction="top" offset={[0, -20]} className="masjid-name-tooltip">
                                                {m.details?.name || m.mosqueName || "Masjid"}
                                            </Tooltip>
                                        </Marker>
                                    );
                                })}
                            </MapContainer>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-2px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* Filter Popover Modal */}
            {showFilterModal && (
                <FilterPopover
                    onClose={() => setShowFilterModal(false)}
                    onApply={handleAdvancedFilterApply}
                    initialDistance={distanceInput}
                    initialPrayer={prayerDropdown}
                />
            )}
        </div>
    );
}
