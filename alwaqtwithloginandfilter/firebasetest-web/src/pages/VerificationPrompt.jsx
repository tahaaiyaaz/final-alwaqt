import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SearchBar from "../components/SearchBar";

// Custom Leaflet Icons for User (Blue), Verified (Green), Unverified (Yellow/Amber)
const userIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const verifiedIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const unverifiedIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Helper component to change map center from parent state
function ChangeMapCenter({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center && center.lat && center.lng) {
            map.setView([center.lat, center.lng], 14);
        }
    }, [center, map]);
    return null;
}

// Map Click Handler Component
function MapClickHandler({ onMapClick }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng);
        },
    });
    return null;
}

export default function VerificationPrompt() {
    const navigate = useNavigate();
    const [location, setLocation] = useState({ lat: null, lng: null });
    const [locationName, setLocationName] = useState("");
    const [masjids, setMasjids] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingLocation, setLoadingLocation] = useState(true);

    // Initial load: get user's current location to start
    useEffect(() => {
        requestCurrentLocation();
    }, []);

    // Fetch masjids whenever location changes
    useEffect(() => {
        if (location.lat && location.lng) {
            fetchMasjids(location.lat, location.lng);
        }
    }, [location.lat, location.lng]);

    const requestCurrentLocation = () => {
        setLoadingLocation(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    setLocation({ lat, lng });
                    fetchLocationName(lat, lng);
                    setLoadingLocation(false);
                },
                (err) => {
                    console.error("Geolocation error:", err);
                    // Default to Hyderabad
                    setLocation({ lat: 17.3850, lng: 78.4867 });
                    fetchLocationName(17.3850, 78.4867);
                    setLoadingLocation(false);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            setLocation({ lat: 17.3850, lng: 78.4867 });
            fetchLocationName(17.3850, 78.4867);
            setLoadingLocation(false);
        }
    };

    const fetchLocationName = async (lat, lng) => {
        try {
            const res = await fetch(`${API_BASE}/api/reverseGeocode?lat=${lat}&lng=${lng}`);
            const data = await res.json();
            if (data && data.address) {
                const parts = data.address.split(",");
                setLocationName(parts.slice(0, 3).join(",").trim());
            } else {
                setLocationName("Selected Location");
            }
        } catch (err) {
            console.error("Reverse geocode error:", err);
            setLocationName("Selected Location");
        }
    };

    const fetchMasjids = async (lat, lng) => {
        setLoading(true);
        try {
            // Using radius 5 for a wider search on this screen
            const res = await fetch(`${API_BASE}/searchMasjidsWithOla?latitude=${lat}&longitude=${lng}&radiusInKm=5`);
            const data = await res.json();
            if (data.masjids) {
                console.log("FETCHED MASJIDS:", data.masjids);
                setMasjids(data.masjids);
            } else {
                setMasjids([]);
            }
        } catch (err) {
            console.error("Error fetching masjids:", err);
            setMasjids([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSelect = (coords) => {
        if (coords.lat && coords.lng) {
            setLocation(coords);
            fetchLocationName(coords.lat, coords.lng);
        }
    };

    const handleMapClick = (latlng) => {
        setLocation({ lat: latlng.lat, lng: latlng.lng });
        fetchLocationName(latlng.lat, latlng.lng);
    };

    const handleUnverifiedClick = (masjid) => {
        navigate("/update-timings", { state: { masjid, scrollToMap: true } });
    };

    // Separate verified and unverified
    // In our backend, verified if: source = 'ola' AND isVerified=true, OR source != 'ola'
    // Specifically, searchMasjidsWithOla returns unverified OLA masjids with isVerified: false (or is_verified === 0)
    const verifiedMasjids = masjids.filter(m => m.isVerified !== false && m.is_verified !== 0);
    const unverifiedMasjids = masjids.filter(m => m.isVerified === false || m.is_verified === 0);

    if (loadingLocation) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#F3F4F6", flexDirection: "column" }}>
                <div className="spinner"></div>
                <p style={{ marginTop: 20, color: "#6B7280", fontWeight: "600" }}>Locating you...</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#F3F4F6", paddingBottom: 60, fontFamily: "'Inter', sans-serif" }}>
            {/* Header section focusing on the prompt */}
            <div style={{ backgroundColor: "#111827", padding: "40px 20px 30px", textAlign: "center", borderBottomLeftRadius: 24, borderBottomRightRadius: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", position: "relative" }}>
                {/* Skip button at top right */}
                <button 
                    onClick={() => navigate("/")}
                    style={{ position: "absolute", top: 15, right: 15, background: "rgba(255,255,255,0.1)", color: "#9CA3AF", border: "none", padding: "6px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer", fontWeight: "600" }}
                >
                    Skip for now →
                </button>

                <h1 style={{ color: "#fff", fontSize: 28, fontWeight: "800", margin: "10px 0 10px 0", lineHeight: 1.2 }}>
                    Would you like to verify some masjids which are present where u live?
                </h1>
                <p style={{ color: "#9CA3AF", fontSize: 14, margin: 0 }}>
                    Help your community by confirming exactly where these masjids are located.
                </p>
                
                <div style={{ marginTop: 20, textAlign: "left" }}>
                    <SearchBar 
                        setSendCoords={handleSearchSelect} 
                        defaultLocationText={locationName} 
                        defaultLocationCoords={location} 
                        requestCurrentLocation={requestCurrentLocation} 
                        isHeader={false} 
                    />
                </div>
            </div>

            <div style={{ padding: "20px" }}>
                {/* Map Section */}
                <div style={{  marginBottom: 25 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: "700", color: "#374151" }}>Tap Map to Search</span>
                    </div>
                    
                    <div style={{ height: 300, borderRadius: 16, overflow: "hidden", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                        <MapContainer
                            center={[location.lat, location.lng]}
                            zoom={14}
                            style={{ height: "100%", width: "100%" }}
                        >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <ChangeMapCenter center={location} />
                            <MapClickHandler onMapClick={handleMapClick} />
                            
                            {/* User Location Pin */}
                            <Marker position={[location.lat, location.lng]} icon={userIcon} />

                            {/* Verified Masjids */}
                            {verifiedMasjids.map(m => {
                                const lat = m.details?.ola_latitude || m.olaLocation?.latitude || m.location?.latitude;
                                const lng = m.details?.ola_longitude || m.olaLocation?.longitude || m.location?.longitude;
                                if (!lat || !lng) return null;
                                return <Marker key={`v-${m.id}`} position={[lat, lng]} icon={verifiedIcon} />;
                            })}

                            {/* Unverified Masjids */}
                            {unverifiedMasjids.map(m => {
                                const lat = m.details?.ola_latitude || m.olaLocation?.latitude || m.location?.latitude;
                                const lng = m.details?.ola_longitude || m.olaLocation?.longitude || m.location?.longitude;
                                if (!lat || !lng) return null;
                                return <Marker key={`uv-${m.id}`} position={[lat, lng]} icon={unverifiedIcon} />;
                            })}
                        </MapContainer>
                    </div>

                    <div style={{ display: "flex", gap: 15, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: "600", color: "#4B5563" }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#2A81CB", display: "inline-block" }}></span>
                            You
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: "600", color: "#4B5563" }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#2AAD27", display: "inline-block" }}></span>
                            Verified
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: "600", color: "#4B5563" }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#CAC428", display: "inline-block" }}></span>
                            Unverified
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                        <div className="spinner"></div>
                    </div>
                ) : (
                    <>
                        {/* Unverified Masjids (Actionable) */}
                        <div style={{ marginBottom: 30 }}>
                            <h2 style={{ fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: "#F59E0B" }}></span>
                                Needs Verification ({unverifiedMasjids.length})
                            </h2>
                            {unverifiedMasjids.length === 0 ? (
                                <div style={{ backgroundColor: "#FAFAFA", padding: 20, borderRadius: 12, textAlign: "center", color: "#6B7280", border: "1px dashed #D1D5DB" }}>
                                    No nearby masjids need verification right now!
                                </div>
                            ) : (
                                <div style={{ display: "grid", gap: 12 }}>
                                    {unverifiedMasjids.map(m => (
                                        <div 
                                            key={m.id} 
                                            onClick={() => handleUnverifiedClick(m)}
                                            style={{ 
                                                backgroundColor: "#fff", padding: 16, borderRadius: 16, 
                                                border: "1px solid #F3F4F6", borderLeft: "4px solid #F59E0B",
                                                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", cursor: "pointer",
                                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                                transition: "transform 0.2s"
                                            }}
                                            onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                                            onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                                        >
                                            <div style={{ flex: 1, overflow: "hidden" }}>
                                                <h4 style={{ margin: "0 0 4px 0", fontSize: 16, fontWeight: "700", color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {m.details?.name || m.mosqueName}
                                                </h4>
                                                <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>
                                                    {m.distance?.toFixed(1) || '?'} km away
                                                </p>
                                            </div>
                                            <div style={{ backgroundColor: "#FEF3C7", color: "#D97706", padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: "700" }}>
                                                Verify →
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Verified Masjids (Non-clickable info) */}
                        <div style={{ marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: "#10B981" }}></span>
                                Verified Masjids ({verifiedMasjids.length})
                            </h2>
                            {verifiedMasjids.length === 0 ? (
                                <div style={{ backgroundColor: "#FAFAFA", padding: 15, borderRadius: 12, textAlign: "center", color: "#6B7280" }}>
                                    No verified masjids found in this exact area yet.
                                </div>
                            ) : (
                                <div style={{ display: "grid", gap: 10 }}>
                                    {verifiedMasjids.map(m => (
                                        <div 
                                            key={m.id} 
                                            style={{ 
                                                backgroundColor: "#F9FAFB", padding: 14, borderRadius: 12, 
                                                border: "1px solid #E5E7EB", borderLeft: "4px solid #10B981",
                                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                                opacity: 0.8
                                            }}
                                        >
                                            <div style={{ flex: 1, overflow: "hidden" }}>
                                                <h4 style={{ margin: "0 0 4px 0", fontSize: 14, fontWeight: "600", color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {m.details?.name || m.mosqueName}
                                                </h4>
                                                <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF" }}>
                                                    {m.distance?.toFixed(1) || '?'} km away
                                                </p>
                                            </div>
                                            <span style={{ color: "#10B981", fontSize: 11, fontWeight: "700" }}>Verified</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
