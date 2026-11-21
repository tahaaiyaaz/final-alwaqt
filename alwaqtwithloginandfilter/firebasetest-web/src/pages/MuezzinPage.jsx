import React, { useState, useEffect } from "react";
import { API_BASE } from "../config";
import { useNavigate } from "react-router-dom";
import { IoLocationOutline, IoSync, IoLocate, IoWarningOutline, IoCloseOutline, IoCheckmarkCircleOutline, IoSearch } from "react-icons/io5";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import SearchBar from "../components/SearchBar";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import UpdateTimingsPage from "./UpdateTimingsPage";
import { getUserLocation } from "../utils/geolocation";

// Fix leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ChangeMapCenter({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center && center[0] && center[1]) {
            map.flyTo(center, 14);
        }
    }, [center[0], center[1], map]);
    return null;
}

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

function MapEventHandler({ lastSearchLocation, setShowSearchAreaBtn, setCurrentMapCenter }) {
    const map = useMapEvents({
        moveend: () => {
            const center = map.getCenter();
            setCurrentMapCenter({ lat: center.lat, lng: center.lng });
            if (lastSearchLocation.lat && lastSearchLocation.lng) {
                const dist = calculateDistance(
                    lastSearchLocation.lat,
                    lastSearchLocation.lng,
                    center.lat,
                    center.lng
                );
                // 0.2 km = 200 meters. Show button if panned beyond this
                if (dist > 0.2) {
                    setShowSearchAreaBtn(true);
                } else {
                    setShowSearchAreaBtn(false);
                }
            }
        }
    });
    return null;
}

export default function MuezzinPage() {
    const navigate = useNavigate();
    const [location, setLocation] = useState({ lat: "", lng: "" });
    const [masjids, setMasjids] = useState([]);
    const [loading, setLoading] = useState(false);
    const [checkingExisting, setCheckingExisting] = useState(true);
    const [myMasjid, setMyMasjid] = useState(null);

    // Panning states
    const [showSearchAreaBtn, setShowSearchAreaBtn] = useState(false);
    const [currentMapCenter, setCurrentMapCenter] = useState({ lat: "", lng: "" });

    // UI states
    const [locationName, setLocationName] = useState("Loading current location...");
    const [errorMsg, setErrorMsg] = useState("");

    // Claim flow states
    const [selectedMasjid, setSelectedMasjid] = useState(null);
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [showFormModal, setShowFormModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        email: "",
        address: ""
    });

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
                const parts = data.address.split(",");
                const shortAddress = parts.slice(0, 3).join(",").trim();
                setLocationName(shortAddress);
            } else {
                setLocationName("Unknown Location");
            }
        } catch (err) {
            setLocationName("Selected Location");
        }
    };

    const fetchMasjids = async () => {
        if (!location.lat || !location.lng) return;
        setLoading(true);
        try {
            const baseUrl = API_BASE || window.location.origin;
            const url = new URL(`${baseUrl}/searchMasjidsWithOla`);
            url.searchParams.append("latitude", location.lat);
            url.searchParams.append("longitude", location.lng);
            url.searchParams.append("radiusInKm", 3); // 3km default search

            const response = await fetch(url.toString(), {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            const data = await response.json();
            setMasjids(data.masjids || []);
        } catch (err) {
            console.error("Error fetching masjids", err);
            setErrorMsg("Failed to load masjids");
        } finally {
            setLoading(false);
        }
    };

    const handleSearchInArea = () => {
        setLocation(currentMapCenter);
        fetchLocationName(currentMapCenter.lat, currentMapCenter.lng);
        setShowSearchAreaBtn(false);
    };

    useEffect(() => {
        const checkExistingMasjid = async () => {
            const userStr = localStorage.getItem("@user");
            if (!userStr) {
                setCheckingExisting(false);
                return;
            }

            const u = JSON.parse(userStr);
            if (!u.email && !u.phone) {
                setCheckingExisting(false);
                return;
            }

            try {
                const qs = u.email ? `email=${encodeURIComponent(u.email)}` : `phone=${encodeURIComponent(u.phone)}`;
                const res = await fetch(`${API_BASE}/api/muazzin/my-masjid?${qs}`);
                const data = await res.json();

                if (data.hasMasjid && data.masjid) {
                    setMyMasjid(data.masjid);
                    setCheckingExisting(false);
                } else {
                    setCheckingExisting(false);
                }
            } catch (err) {
                console.error("Checking existing masjid failed", err);
                setCheckingExisting(false);
            }
        };

        checkExistingMasjid();
        requestCurrentLocation();
    }, []);

    useEffect(() => {
        fetchMasjids();
    }, [location]);

    const handleClaimClick = async (masjid) => {
        // Automatically create user session details if available locally
        const userStr = localStorage.getItem("@user");
        if (userStr) {
            const u = JSON.parse(userStr);
            setFormData(prev => ({ ...prev, name: u.name || "", email: u.email || "" }));
        }

        setSelectedMasjid(masjid);
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/masjid/${masjid.id}/muazzins/count`);
            const data = await res.json();

            if (data.count > 0) {
                setShowWarningModal(true);
            } else {
                setShowFormModal(true);
            }
        } catch (error) {
            console.error("Failed to check muazzin count:", error);
            // Default to showing form anyway
            setShowFormModal(true);
        } finally {
            setLoading(false);
        }
    };

    const handleFormSubmit = async () => {
        if (!formData.name || !formData.phone || !formData.email || !formData.address) {
            alert("Please fill out all fields.");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE}/api/muazzin/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masjidId: selectedMasjid.id,
                    ...formData
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                alert("Successfully registered as a Muazzin!");
                // Direct swap to the dashboard instead of navigating away
                setMyMasjid(selectedMasjid);
            } else {
                throw new Error(data.error || "Failed to register");
            }
        } catch (error) {
            console.error(error);
            alert(error.message);
        } finally {
            setSubmitting(false);
            setShowFormModal(false);
        }
    };

    if (checkingExisting) {
        return (
            <div style={{ backgroundColor: "#F3F4F6", minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", paddingTop: "var(--safe-area-top, 0px)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 15 }}>
                    <IoSync className="spin" size={40} color="#10B981" />
                    <p style={{ color: "#4B5563", fontWeight: "600", fontSize: 16 }}>Loading Dashboard...</p>
                </div>
            </div>
        );
    }

    if (myMasjid) {
        return <UpdateTimingsPage masjid={myMasjid} isDashboard={true} />;
    }

    return (
        <div style={{ backgroundColor: "#F3F4F6", minHeight: "100vh", position: "relative" }}>

            {/* Header */}
            <div style={{ backgroundColor: "#10B981", color: "#FFF", padding: "calc(20px + var(--safe-area-top, 0px)) 20px 30px", borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
                <h1 style={{ fontSize: 24, fontWeight: "bold", margin: "0 0 10px 0" }}>Claim Your Masjid</h1>
                <p style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>Find your mosque on the map below and register as an official Muazzin.</p>
            </div>

            {/* Location Bar */}
            <div style={{ padding: "0 20px", marginTop: "-20px", position: "relative", zIndex: 10 }}>
                <div style={{
                    backgroundColor: "#FFF", borderRadius: 12, padding: "8px 12px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)"
                }}>
                    <SearchBar
                        setSendCoords={(coords) => {
                            setLocation({ lat: coords.lat, lng: coords.lng });
                            setCurrentMapCenter({ lat: coords.lat, lng: coords.lng });
                            fetchLocationName(coords.lat, coords.lng);
                            setShowSearchAreaBtn(false);
                            setLoading(true);
                        }}
                        defaultLocationText={locationName}
                        defaultLocationCoords={location}
                        requestCurrentLocation={requestCurrentLocation}
                    />
                </div>
            </div>

            {/* Map Container */}
            <div style={{ padding: "20px", height: "calc(100vh - 200px)" }}>
                <div style={{ width: "100%", height: "100%", borderRadius: 16, overflow: "hidden", position: "relative", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>

                    {showSearchAreaBtn && (
                        <button
                            onClick={handleSearchInArea}
                            style={{
                                position: "absolute", top: 15, left: "50%", transform: "translateX(-50%)", zIndex: 1000,
                                backgroundColor: "#10B981", color: "white", padding: "10px 20px", borderRadius: 24,
                                border: "none", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", cursor: "pointer",
                                fontWeight: "bold", display: "flex", alignItems: "center", gap: 8, fontSize: 14,
                                animation: "slideDown 0.3s ease-out"
                            }}
                        >
                            <IoSearch size={18} /> Search in this area
                        </button>
                    )}

                    <MapContainer
                        center={location.lat ? [location.lat, location.lng] : [20.5937, 78.9629]}
                        zoom={location.lat ? 14 : 5}
                        style={{ height: "100%", width: "100%", zIndex: 0 }}
                    >
                        <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                        <MapEventHandler
                            lastSearchLocation={location}
                            setShowSearchAreaBtn={setShowSearchAreaBtn}
                            setCurrentMapCenter={setCurrentMapCenter}
                        />
                        {location.lat && location.lng && <ChangeMapCenter center={[location.lat, location.lng]} />}

                        {location.lat && location.lng && (
                            <Marker position={[location.lat, location.lng]}>
                                <Popup>You are here</Popup>
                            </Marker>
                        )}

                        {masjids.map((masjid) => {
                            const mosqueIcon = L.divIcon({
                                className: 'custom-masjid-marker',
                                html: `<div style="background-color: #10B981; color: white; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="18px" width="18px" xmlns="http://www.w3.org/2000/svg"><path d="M470.9 231.7c-9.6-18.7-27.4-44.5-56.9-44.5-29.6 0-47.3 25.8-56.9 44.5-8.8 17.2-13.1 36.3-13.1 56.3V384H32v32h448v-32h-9.1v-96c0-20-4.3-39.1-13.1-56.3zM255.4 34.5c-48.4 0-82.6 42.1-98.8 80.2-14 32.9-16.6 69.8-16.6 106.1V384h230.9v-163c0-36.2-2.6-73.1-16.6-106.1-16.3-38.3-50.5-80.4-98.9-80.4z"></path></svg>
                                       </div>`,
                                iconSize: [32, 32],
                                iconAnchor: [16, 32],
                                popupAnchor: [0, -32]
                            });

                            return (
                                <Marker
                                    key={masjid.id}
                                    position={[masjid.location.latitude, masjid.location.longitude]}
                                    icon={mosqueIcon}
                                >
                                    <Tooltip permanent direction="top" offset={[0, -32]} className="masjid-name-tooltip">
                                        {masjid.details?.name || masjid.mosqueName || "Masjid"}
                                    </Tooltip>
                                    <Popup>
                                        <div style={{ textAlign: "center", minWidth: 150 }}>
                                            <strong>{masjid.details?.name || masjid.mosqueName}</strong>
                                            <p style={{ margin: "5px 0", fontSize: 12, color: "#6B7280" }}>
                                                {masjid.details?.addressLine1 || "No address provided"}
                                            </p>
                                            <button
                                                onClick={() => handleClaimClick(masjid)}
                                                style={{
                                                    backgroundColor: "#10B981", color: "#FFF",
                                                    border: "none", borderRadius: 6, padding: "6px 12px",
                                                    cursor: "pointer", width: "100%", marginTop: 5, fontWeight: "bold"
                                                }}
                                            >
                                                Claim as Muazzin
                                            </button>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </MapContainer>
                </div>
            </div>

            {/* ERROR ALERTS */}
            {errorMsg && (
                <div style={{ position: "fixed", bottom: 80, left: 20, right: 20, backgroundColor: "#FEE2E2", color: "#B91C1C", padding: 12, borderRadius: 8, textAlign: "center", zIndex: 9999 }}>
                    {errorMsg}
                </div>
            )}

            {/* WARNING MODAL (Already exists) */}
            {showWarningModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 24, width: "90%", maxWidth: 400 }}>
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 15 }}>
                            <IoWarningOutline size={48} color="#F59E0B" />
                        </div>
                        <h2 style={{ textAlign: "center", margin: "0 0 10px 0", fontSize: 18, color: "#111827" }}>Muazzin Already Exists</h2>
                        <p style={{ textAlign: "center", color: "#6B7280", margin: "0 0 20px 0", fontSize: 14 }}>
                            There is already a registered Muazzin for <strong>{selectedMasjid?.details?.name}</strong>. Do you want to continue registering as an additional Muazzin?
                        </p>
                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => setShowWarningModal(false)} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "1px solid #E5E7EB", backgroundColor: "#FFF", color: "#374151", fontWeight: "600", cursor: "pointer" }}>
                                Cancel
                            </button>
                            <button onClick={() => { setShowWarningModal(false); setShowFormModal(true); }} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", backgroundColor: "#F59E0B", color: "#FFF", fontWeight: "600", cursor: "pointer" }}>
                                Continue Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* REGISTRATION FORM MODAL */}
            {showFormModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div style={{ backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "24px", width: "100%", maxWidth: 600, animation: "slideUp 0.3s ease-out" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                            <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Provide Your Details</h2>
                            <button onClick={() => setShowFormModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                                <IoCloseOutline size={24} color="#6B7280" />
                            </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                            <div>
                                <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, display: "block", fontWeight: "500" }}>Full Name</label>
                                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: "100%", padding: "12px", boxSizing: "border-box", backgroundColor: "#F3F4F6", border: "1px solid transparent", borderRadius: 8, outline: "none" }} placeholder="Enter your full name" />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, display: "block", fontWeight: "500" }}>Phone Number</label>
                                <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} style={{ width: "100%", padding: "12px", boxSizing: "border-box", backgroundColor: "#F3F4F6", border: "1px solid transparent", borderRadius: 8, outline: "none" }} placeholder="Enter your phone number" />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, display: "block", fontWeight: "500" }}>Email</label>
                                <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={{ width: "100%", padding: "12px", boxSizing: "border-box", backgroundColor: "#F3F4F6", border: "1px solid transparent", borderRadius: 8, outline: "none" }} placeholder="Enter your email" />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, display: "block", fontWeight: "500" }}>Address</label>
                                <textarea value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} style={{ width: "100%", padding: "12px", boxSizing: "border-box", backgroundColor: "#F3F4F6", border: "1px solid transparent", borderRadius: 8, outline: "none", minHeight: "80px", resize: "vertical" }} placeholder="Enter your full residential address" />
                            </div>

                            <button disabled={submitting} onClick={handleFormSubmit} style={{ width: "100%", padding: "16px", backgroundColor: "#10B981", color: "#FFF", border: "none", borderRadius: 12, fontWeight: "bold", fontSize: 16, marginTop: 10, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 8, opacity: submitting ? 0.7 : 1 }}>
                                {submitting ? "Submitting..." : "Submit Application"} <IoCheckmarkCircleOutline size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
