import React, { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "../config";
import { useLocation, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IoArrowBack, IoSearch, IoInformationCircleOutline } from "react-icons/io5";
import SearchBar from "../components/SearchBar";
import { useMasjid } from "../context/MasjidContext";
import { getUserLocation } from "../utils/geolocation";

// Fix leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom green icon for masjids
const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Haversine distance in meters
function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ChangeMapView({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center && center.lat && center.lng) {
            map.flyTo([center.lat, center.lng], 15);
        }
    }, [center, map]);
    return null;
}

// Detects when user pans >200m from the last-searched center
function MapMoveDetector({ lastSearchCenter, onShowButton, onHideButton }) {
    useMapEvents({
        moveend: (e) => {
            const center = e.target.getCenter();
            const dist = distanceMeters(
                lastSearchCenter.lat, lastSearchCenter.lng,
                center.lat, center.lng
            );
            if (dist > 200) {
                onShowButton({ lat: center.lat, lng: center.lng });
            } else {
                onHideButton();
            }
        },
    });
    return null;
}

export default function MapPage() {
    const navigate = useNavigate();
    const {
        location, setLocation,
        setMasjids: setGlobalMasjids,
        masjids: globalMasjids,
        setLastFetchedCoords
    } = useMasjid();

    const [currentCenter, setCurrentCenter] = useState(location);
    const [lastSearchCenter, setLastSearchCenter] = useState(location);
    const [localMasjids, setLocalMasjids] = useState(globalMasjids);
    const [loading, setLoading] = useState(false);

    // "Search this area" button
    const [showSearchArea, setShowSearchArea] = useState(false);
    const [panCenter, setPanCenter] = useState(null);

    const requestCurrentLocation = async () => {
        setLoading(true);
        try {
            const pos = await getUserLocation();
            const coords = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
            };
            handleSearch(coords);
        } catch (err) {
            alert(`Could not get location: ${err.message} `);
            setLoading(false);
        }
    };

    const fetchMasjidsForLocation = async (coords) => {
        setLoading(true);
        try {
            const baseUrl = API_BASE || window.location.origin;
            const url = new URL(`${baseUrl}/searchMasjidsWithOla`);
            url.searchParams.append("latitude", coords.lat);
            url.searchParams.append("longitude", coords.lng);
            url.searchParams.append("radiusInKm", 5);

            const response = await fetch(url.toString());
            const data = await response.json();
            const fetched = data.masjids || [];

            // Update both local and global state
            setLocalMasjids(fetched);
            setGlobalMasjids(fetched);
            setLastFetchedCoords(coords);
            setLocation(coords);
        } catch (err) {
            console.error("Map fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (coords) => {
        setCurrentCenter(coords);
        setLastSearchCenter(coords);
        setShowSearchArea(false);
        fetchMasjidsForLocation(coords);
    };

    const handleSearchThisArea = () => {
        if (panCenter) {
            handleSearch(panCenter);
        }
    };

    return (
        <div style={{ height: "100vh", width: "100vw", position: "relative", display: "flex", flexDirection: "column", background: "#f0f0f0" }}>
            {/* Overlay Header - Fixed and prominent */}
            <div style={{
                position: "absolute", top: 55, left: 15, right: 15,
                zIndex: 1000, display: "flex", gap: 10, alignItems: "center",
                backgroundColor: "rgba(255,255,255,0.9)", padding: "10px", borderRadius: "12px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)", backdropFilter: "blur(8px)"
            }}>
                <button
                    onClick={() => navigate("/")}
                    style={{
                        width: 40, height: 40, borderRadius: 20, border: "none",
                        backgroundColor: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", color: "#111827", boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                    }}
                >
                    <IoArrowBack size={22} />
                </button>
                <div style={{ flex: 1 }}>
                    <SearchBar
                        setSendCoords={handleSearch}
                        requestCurrentLocation={requestCurrentLocation}
                    />
                </div>
            </div>

            {/* Loading indicator */}
            {loading && (
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 2000, backgroundColor: "rgba(255, 255, 255, 0.7)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    backdropFilter: "blur(2px)"
                }}>
                    <div className="loader" style={{ marginBottom: 15, transform: "scale(1.2)" }}></div>
                    <div style={{
                        backgroundColor: "#fff", padding: "10px 20px",
                        borderRadius: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        fontSize: 15, fontWeight: "600", color: "#10B981"
                    }}>
                        Fetching nearest masjids...
                    </div>
                </div>
            )}

            {/* "Search this area" floating button */}
            {showSearchArea && !loading && (
                <div style={{
                    position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)",
                    zIndex: 1000
                }}>
                    <button
                        onClick={handleSearchThisArea}
                        style={{
                            display: "flex", alignItems: "center", gap: 8,
                            backgroundColor: "#10B981", color: "#fff", border: "none",
                            padding: "10px 22px", borderRadius: 30,
                            fontSize: 14, fontWeight: "700", cursor: "pointer",
                            boxShadow: "0 4px 14px rgba(16, 185, 129, 0.45)",
                            transition: "all 0.2s ease",
                        }}
                    >
                        <IoSearch size={18} />
                        Search this area
                    </button>
                </div>
            )}

            <div style={{ flex: 1 }}>
                <MapContainer
                    center={[currentCenter.lat, currentCenter.lng]}
                    zoom={15}
                    style={{ height: "100%", width: "100%" }}
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <ChangeMapView center={currentCenter} />

                    <MapMoveDetector
                        lastSearchCenter={lastSearchCenter}
                        onShowButton={(c) => { setPanCenter(c); setShowSearchArea(true); }}
                        onHideButton={() => setShowSearchArea(false)}
                    />

                    {/* Blue Marker for Search/Current Center */}
                    <Marker position={[currentCenter.lat, currentCenter.lng]}>
                        <Popup>
                            <strong>Selected Location</strong>
                        </Popup>
                    </Marker>

                    {/* Green Markers for Masjids */}
                    {localMasjids.map((m, idx) => {
                        if (!m.location?.latitude || !m.location?.longitude) return null;
                        return (
                            <Marker
                                key={idx}
                                position={[m.location.latitude, m.location.longitude]}
                                icon={greenIcon}
                            >
                                <Tooltip permanent direction="top" offset={[0, -20]} className="masjid-name-tooltip">
                                    {m.details?.name || m.mosqueName || "Masjid"}
                                </Tooltip>
                                <Popup>
                                    <div style={{ textAlign: "center", minWidth: 120 }}>
                                        <h3 style={{ margin: "0 0 5px 0", fontSize: 16, color: "#111827" }}>
                                            {m.details?.name || m.mosqueName}
                                        </h3>
                                        <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#6B7280" }}>
                                            {m.details?.addressLine1 || "No address"}
                                        </p>
                                        <button
                                            onClick={() => navigate("/about-masjid", { state: { masjid: m } })}
                                            style={{
                                                backgroundColor: "#10B981", color: "#fff", border: "none",
                                                padding: "6px 12px", borderRadius: 6, fontSize: 13,
                                                fontWeight: "600", cursor: "pointer", width: "100%"
                                            }}
                                        >
                                            View Details
                                        </button>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
}
