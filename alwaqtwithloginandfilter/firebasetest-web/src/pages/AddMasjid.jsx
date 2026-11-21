import React, { useState, useEffect } from "react";
import { API_BASE } from "../config";
import { useNavigate, useLocation } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Tooltip, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SearchBar from "../components/SearchBar";
import CustomTimePicker from "../components/CustomTimePicker";
import { addMasjid } from "../api/apiaddmasjid";
import { IoArrowForward, IoArrowBack, IoCheckmarkCircleOutline, IoLocate, IoTimeOutline, IoAddCircleOutline, IoTrashOutline, IoLocateOutline, IoInformationCircleOutline, IoSync, IoLocationSharp, IoCloseCircleOutline, IoSearchOutline, IoLocation, IoCameraOutline } from "react-icons/io5";
import { getUserLocation } from "../utils/geolocation";
import { useTour } from "../context/TourContext";
import { driver } from "driver.js";

// Haversine formula to compute distance between points
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
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

// Fix leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function MapClickHandler({ onMapClick }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng);
        },
    });
    return null;
}

function ChangeView({ center }) {
    const map = useMap();
    if (center && center[0] && center[1]) {
        map.setView(center, map.getZoom()); // Preserve user's current zoom!
    }
    return null;
}

export default function AddMasjid() {
    const navigate = useNavigate();
    const locationHook = useLocation();
    const [step, setStep] = useState(1);
    const passedState = locationHook.state || {};

    // --- Tour Setup ---
    const { tourActive, tourStage, setTourStage, completeTour, driverObj, setDriverObj } = useTour();

    useEffect(() => {
        if (tourActive && (tourStage === 'add' || tourStage === 'goToAdd')) {
            setTourStage('add');

            setTimeout(() => {
                const tourDriver = driver({
                    showProgress: true,
                    allowClose: true,
                    steps: [
                        { element: '#tour-add-map', popover: { title: '📍 Select Location', description: 'This is the Add Masjid page. Start by tapping anywhere on the map to choose a location, or use the search bar above. \n\n⚠️ This is just a demo walkthrough — no masjid will be added!', side: 'top', align: 'start' } },
                        { element: '#tour-add-nearby-list', popover: { title: '🕌 Existing Masjids', description: 'All Masjids already registered near the selected location will appear here. If yours is listed, no need to add it again!', side: 'bottom', align: 'start' } },
                        { element: '#tour-add-next-btn', popover: { title: '🌟 That\'s It — Tour Complete!', description: 'And that\'s the full app! If a masjid isn\'t listed, you\'d click this button to add it (login required). \n\n✅ You\'re all set to explore on your own now!', side: 'top', align: 'start' } },
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

        return () => {
            if (driverObj && tourStage === 'add') driverObj.destroy();
        };
    }, [tourActive, tourStage]);

    const [location, setLocation] = useState(passedState.location || { lat: 17.385, lng: 78.4867 });
    const [address, setAddress] = useState(passedState.address || "");
    const [masjidName, setMasjidName] = useState("");
    const [contactNumber, setContactNumber] = useState("");

    // NEW STATES: Jumbo Config & Loading
    const [hasJummah, setHasJummah] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [locationofmasjid, setLocationofmasjid] = useState({ lat: "", lng: "" });
    const [nearbyMasjids, setNearbyMasjids] = useState(passedState.nearbyMasjids || []);
    const [loadingNearby, setLoadingNearby] = useState(false);
    const [isLocating, setIsLocating] = useState(false);

    // Timings state
    const [timings, setTimings] = useState({
        fajr: "", dhuhr: "", asar: "", maghrib: "", isha: ""
    });
    const [jummaTimings, setJummaTimings] = useState([""]);
    const [taraweehEntries, setTaraweehEntries] = useState([]);

    // Image capture state
    const [masjidImage, setMasjidImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const fileInputRef = React.useRef(null);
    const cameraInputRef = React.useRef(null);

    const fetchAddress = async (lat, lng) => {
        try {
            const res = await fetch(`${API_BASE}/api/reverseGeocode?lat=${lat}&lng=${lng}`);
            const data = await res.json();
            if (data && data.address) {
                setAddress(data.address);
            } else {
                setAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
            }
        } catch (err) {
            console.error("Reverse geocode err:", err);
            setAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
        }
    };

    const requestCurrentLocation = async () => {
        setIsLocating(true);
        try {
            const pos = await getUserLocation();
            const coords = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
            };
            setLocation(coords);
            fetchNearbyMasjids(coords.lat, coords.lng);
        } catch (err) {
            alert(`Could not get location: ${err.message}`);
        } finally {
            setIsLocating(false);
        }
    };

    const fetchNearbyMasjids = async (lat, lng) => {
        setIsLocating(false);
        setLoadingNearby(true);
        try {
            const baseUrl = API_BASE || window.location.origin;
            const url = new URL(`${baseUrl}/getNearestMasjid`);
            url.searchParams.append("latitude", lat);
            url.searchParams.append("longitude", lng);
            url.searchParams.append("radiusInKm", 0.5);

            const res = await fetch(url.toString());
            const data = await res.json();
            setNearbyMasjids(data.masjids || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingNearby(false);
        }
    };

    const handleMapClick = (latlng) => {
        setLocation({ lat: latlng.lat, lng: latlng.lng });
        fetchNearbyMasjids(latlng.lat, latlng.lng);
    };

    const handleStep2MapClick = (latlng) => {
        setLocationofmasjid({ lat: latlng.lat, lng: latlng.lng });
        fetchAddress(latlng.lat, latlng.lng);
    };

    const getCurrentLocation = async () => {
        setIsLocating(true);
        try {
            const pos = await getUserLocation();
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setLocationofmasjid({ lat, lng });
            fetchAddress(lat, lng);
        } catch (err) {
            alert(`Could not get location: ${err.message}`);
        } finally {
            setIsLocating(false);
        }
    };

    const handleAddMasjid = async () => {
        // Validation: Jumma timing is mandatory
        // Apply jummah toggle logic
        const finalJumma = hasJummah ? jummaTimings.filter(t => t.trim() !== "") : [];
        if (hasJummah && finalJumma.length === 0) {
            alert("Please add at least one Jummah timing or uncheck 'Has Jummah'.");
            return;
        }

        const finalTimings = {
            fajr: timings.fajr,
            dhuhr: timings.dhuhr,
            asar: timings.asar,
            maghrib: timings.maghrib,
            isha: timings.isha,
            jumma: finalJumma,
            taravi: taraweehEntries
        };

        setIsSubmitting(true);
        try {
            // Upload image first if provided
            let imageUrl = null;
            if (masjidImage) {
                const baseUrl = API_BASE || window.location.origin;
                const formData = new FormData();
                formData.append("image", masjidImage);
                const uploadRes = await fetch(`${baseUrl}/api/uploadImage`, {
                    method: "POST",
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadRes.ok && uploadData.imageUrl) {
                    imageUrl = uploadData.imageUrl;
                }
            }

            const finalData = {
                latitude: locationofmasjid.lat,
                longitude: locationofmasjid.lng,
                countryName: "India",
                stateName: "State",
                cityName: "City",
                contactNumber: contactNumber.trim(),
                imageUrl: imageUrl,
                details: {
                    addressLine1: address || "Custom Location",
                    name: masjidName,
                    timings: finalTimings,
                },
            };

            await addMasjid(finalData);
            alert("Masjid submitted successfully! It will be reviewed by an administrator before appearing on the map.");
            window.location.href = "/";
        } catch {
            alert("Failed to add masjid. Please try again.");
            setIsSubmitting(false); // only reset on fail so spinner stays through redirect
        }
    };

    // STEP 1 UI
    if (step === 1) {
        return (
            <div className="safe-page-container">
                <h2 style={{ fontSize: 20, fontWeight: "700", marginBottom: 5 }}>Step 1: Check Presence</h2>
                <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 20 }}>Search for the location to see if the masjid already exists.</p>

                <div style={{ display: "flex", gap: 10, marginBottom: 15, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <SearchBar
                            setSendCoords={(coords) => { setLocation(coords); fetchNearbyMasjids(coords.lat, coords.lng); }}
                            requestCurrentLocation={requestCurrentLocation}
                        />
                    </div>
                    <button
                        onClick={requestCurrentLocation}
                        disabled={isLocating}
                        style={{
                            background: "transparent",
                            border: "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: isLocating ? "wait" : "pointer",
                            color: isLocating ? "#9CA3AF" : "#4B5563",
                            flexShrink: 0,
                            padding: "8px 8px 8px 0"
                        }}
                        title="Use current location"
                    >
                        {isLocating ? (
                            <IoSync size={22} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                            <IoLocateOutline size={22} />
                        )}
                    </button>
                </div>

                <p style={{ fontSize: 13, color: "#4B5563", marginBottom: 10, fontWeight: "500", textAlign: "center", backgroundColor: "#F3F4F6", padding: "8px", borderRadius: "8px" }}>
                    <IoInformationCircleOutline style={{ verticalAlign: "middle", marginRight: 4, color: "#6B7280" }} size={16} />
                    Click anywhere on the map to see masjids in that location
                </p>

                <div id="tour-add-map" style={{ height: 250, borderRadius: 16, overflow: "hidden", marginBottom: 20, border: "1px solid #E5E7EB", position: "relative" }}>
                    {isLocating && (
                        <div style={{
                            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: "rgba(255,255,255,0.7)", zIndex: 1000,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
                        }}>
                            <IoSync size={32} style={{ animation: "spin 1s linear infinite", color: "#10B981" }} />
                            <span style={{ marginTop: 8, fontWeight: "600", color: "#111827" }}>Locating...</span>
                        </div>
                    )}
                    <MapContainer center={[location.lat, location.lng]} zoom={15} style={{ height: "100%" }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <MapClickHandler onMapClick={handleMapClick} />
                        <Marker position={[location.lat, location.lng]} />
                        {nearbyMasjids.map((m, idx) => {
                            if (!m.location?.latitude || !m.location?.longitude) return null;
                            return (
                                <Marker
                                    key={`nearby-${idx}`}
                                    position={[m.location.latitude, m.location.longitude]}
                                    opacity={0.8}
                                >
                                    <Tooltip permanent direction="top" offset={[0, -20]} className="masjid-name-tooltip">
                                        {m.details?.name || m.mosqueName || "Masjid"}
                                    </Tooltip>
                                </Marker>
                            );
                        })}
                        <ChangeView center={[location.lat, location.lng]} />
                    </MapContainer>
                </div>

                {nearbyMasjids.length > 0 && (
                    <div id="tour-add-nearby-list" style={{ background: "#F9FAFB", padding: 15, borderRadius: 12, marginBottom: 20 }}>
                        <h4 style={{ fontSize: 14, fontWeight: "600", marginBottom: 10 }}>Nearby Masjids</h4>
                        {nearbyMasjids.map((m, idx) => (
                            <div
                                key={idx}
                                onClick={() => navigate("/about-masjid", {
                                    state: {
                                        masjid: m,
                                        returnUrl: "/add-masjid",
                                        returnState: { location, address, nearbyMasjids }
                                    }
                                })}
                                style={{
                                    padding: "12px 10px",
                                    borderBottom: idx < nearbyMasjids.length - 1 ? "1px solid #E5E7EB" : "none",
                                    cursor: "pointer",
                                    transition: "background 0.2s"
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = "#F3F4F6"}
                                onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                            >
                                <div style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{m.details?.name}</div>
                                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{m.details?.addressLine1}</div>
                            </div>
                        ))}
                    </div>
                )}

                <button id="tour-add-next-btn" className="btn-primary" style={{ width: "100%", marginBottom: 50 }} onClick={() => setStep(2)}>
                    Not in the list? Proceed <IoArrowForward />
                </button>
            </div>
        );
    }

    // STEP 2 UI
    if (step === 2) {
        return (
            <div className="safe-page-container">
                <h2 style={{ fontSize: 20, fontWeight: "700", marginBottom: 5 }}>Step 2: Masjid Details</h2>
                <div style={{ backgroundColor: "#FEF2F2", color: "#B91C1C", padding: "10px", borderRadius: "8px", marginBottom: "15px", fontSize: "14px", fontWeight: "600", border: "1px solid #FCA5A5" }}>
                    Fields marked with <span style={{ color: "red" }}>*</span> are mandatory to proceed.
                </div>
                <div className="card" style={{ padding: 15 }}>
                    <label className="form-label" style={{ fontWeight: "600" }}>Masjid Name <span style={{ color: "red" }}>*</span></label>
                    <input className="form-input" value={masjidName} onChange={(e) => setMasjidName(e.target.value)} placeholder="Enter full name of Masjid" style={{ marginBottom: 15, border: masjidName.trim() ? "1px solid #D1D5DB" : "1px solid #FCA5A5" }} />

                    <label className="form-label" style={{ fontWeight: "600" }}>Pin Location <span style={{ color: "red" }}>*</span></label>
                    <div style={{ display: "flex", gap: 10, marginBottom: 15, alignItems: "center" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <SearchBar
                                setSendCoords={(coords) => { setLocationofmasjid(coords); fetchAddress(coords.lat, coords.lng); }}
                                requestCurrentLocation={getCurrentLocation}
                            />
                        </div>
                        <button
                            onClick={getCurrentLocation}
                            disabled={isLocating}
                            style={{
                                background: "transparent",
                                border: "none",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: isLocating ? "wait" : "pointer",
                                color: isLocating ? "#9CA3AF" : "#4B5563",
                                flexShrink: 0,
                                padding: "8px 8px 8px 0"
                            }}
                            title="Use current location"
                        >
                            {isLocating ? (
                                <IoSync size={22} className="spin-animation" style={{ animation: "spin 1s linear infinite" }} />
                            ) : (
                                <IoLocateOutline size={22} />
                            )}
                        </button>
                    </div>

                    <p style={{ fontSize: 13, color: "#4B5563", marginBottom: 10, fontWeight: "500", textAlign: "center", backgroundColor: "#F3F4F6", padding: "8px", borderRadius: "8px" }}>
                        <IoInformationCircleOutline style={{ verticalAlign: "middle", marginRight: 4, color: "#6B7280" }} size={16} />
                        Click anywhere on the map to manually select the location
                    </p>

                    <div style={{ height: 250, borderRadius: 12, overflow: "hidden", marginBottom: 15, position: "relative" }}>
                        {isLocating && (
                            <div style={{
                                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: "rgba(255,255,255,0.7)", zIndex: 1000,
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
                            }}>
                                <IoSync size={32} style={{ animation: "spin 1s linear infinite", color: "#10B981" }} />
                                <span style={{ marginTop: 8, fontWeight: "600", color: "#111827" }}>Locating...</span>
                            </div>
                        )}
                        {(() => {
                            const safeCenter = [
                                Number(locationofmasjid.lat) || Number(location.lat) || 17.3850,
                                Number(locationofmasjid.lng) || Number(location.lng) || 78.4867
                            ];
                            return (
                                <MapContainer center={safeCenter} zoom={15} style={{ height: "100%" }}>
                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                    <MapClickHandler onMapClick={handleStep2MapClick} />
                                    {locationofmasjid.lat && <Marker position={[locationofmasjid.lat, locationofmasjid.lng]} />}
                                    <ChangeView center={safeCenter} />
                                </MapContainer>
                            );
                        })()}
                    </div>

                    <label className="form-label" style={{ fontWeight: "600" }}>Address (Auto-captured)</label>
                    <textarea className="form-input" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} style={{ resize: "none", marginBottom: 15 }} />

                    <label className="form-label" style={{ fontWeight: "600", marginTop: 15 }}>📷 Photo of Masjid (Recommended)</label>
                    <p style={{ fontSize: 12, color: "#6B7280", marginTop: -2, marginBottom: 8, lineHeight: "1.4" }}>
                        Upload a photo to help verify this masjid faster.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                                setMasjidImage(file);
                                setImagePreview(URL.createObjectURL(file));
                            }
                        }}
                        style={{ display: "none" }}
                    />
                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                                setMasjidImage(file);
                                setImagePreview(URL.createObjectURL(file));
                            }
                        }}
                        style={{ display: "none" }}
                    />
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <button
                            onClick={() => cameraInputRef.current?.click()}
                            type="button"
                            style={{ flex: 1, padding: "12px", border: "2px dashed #D1D5DB", borderRadius: 10, background: "#F9FAFB", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: "600", color: "#6B7280" }}
                        >
                            <IoCameraOutline size={24} />
                            Take Photo
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            type="button"
                            style={{ flex: 1, padding: "12px", border: "2px dashed #D1D5DB", borderRadius: 10, background: "#F9FAFB", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: "600", color: "#6B7280" }}
                        >
                            <span style={{fontSize: "24px"}}>🖼️</span>
                            Choose from Gallery
                        </button>
                    </div>
                    {imagePreview && (
                        <img src={imagePreview} alt="Preview" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 10, border: "1px solid #E5E7EB", marginBottom: 10 }} />
                    )}

                    <label className="form-label" style={{ fontWeight: "600", marginTop: 5 }}>Your Mobile Number <span style={{ color: "red" }}>*</span></label>
                    <p style={{ fontSize: 12, color: "#6B7280", marginTop: -2, marginBottom: 8, lineHeight: "1.4" }}>
                        Please enter your active mobile number. It will only be used by our team to verify the masjid details before approval.
                    </p>
                    <input type="tel" className="form-input" style={{ border: contactNumber.trim() ? "1px solid #D1D5DB" : "1px solid #FCA5A5" }} value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Enter mobile number" />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 20, marginBottom: 50 }}>
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep(1)}><IoArrowBack /> Back</button>
                    <button className="btn-primary" style={{ flex: 2 }} onClick={() => {
                        if (!masjidName.trim() || !locationofmasjid.lat || !contactNumber.trim()) {
                            alert("Name, Location, and Mobile Number are mandatory!");
                        } else {
                            setStep(3);
                        }
                    }}>Next: Timings <IoArrowForward /></button>
                </div>
            </div>
        );
    }

    // STEP 3 UI (Modernized)
    return (
        <div className="safe-page-container">
            <h2 style={{ fontSize: 20, fontWeight: "700", marginBottom: 5 }}>Step 3: Timings</h2>

            <div className="card" style={{ padding: 15, marginBottom: 15 }}>
                <h3 style={{ fontSize: 16, fontWeight: "700", marginBottom: 15, color: "#10B981" }}>Prayer Timings</h3>
                {["fajr", "dhuhr", "asar", "maghrib", "isha"].map(p => (
                    <div key={p} style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                        <label style={{ flex: 1, fontSize: 14, fontWeight: "600", textTransform: "capitalize" }}>{p}</label>
                        <div style={{ width: 120 }}>
                            <CustomTimePicker
                                value={timings[p]}
                                onChange={(val) => setTimings({ ...timings, [p]: val })}
                                defaultPeriod={p.toLowerCase() === 'fajr' ? 'AM' : 'PM'}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="card" style={{ padding: 15, marginBottom: 15 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={hasJummah} onChange={(e) => setHasJummah(e.target.checked)} id="jummahToggle" style={{ width: 18, height: 18, accentColor: "#10B981" }} />
                        <label htmlFor="jummahToggle" style={{ fontSize: 16, fontWeight: "700", color: "#10B981", margin: 0 }}>Has Jummah Prayer?</label>
                    </div>
                    {hasJummah && (
                        <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setJummaTimings([...jummaTimings, ""])}><IoAddCircleOutline /> Add</button>
                    )}
                </div>
                {hasJummah && jummaTimings.map((t, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                            <CustomTimePicker
                                value={t}
                                onChange={(val) => {
                                    const newT = [...jummaTimings];
                                    newT[idx] = val;
                                    setJummaTimings(newT);
                                }}
                                defaultPeriod="PM"
                            />
                        </div>
                        {jummaTimings.length > 1 && <button onClick={() => setJummaTimings(jummaTimings.filter((_, i) => i !== idx))} style={{ color: "#EF4444", background: "none", border: "none" }}><IoTrashOutline size={20} /></button>}
                    </div>
                ))}
                {hasJummah && jummaTimings.length === 0 && (
                    <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Click 'Add' to specify Jummah timings.</p>
                )}
                {!hasJummah && (
                    <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Jummah prayer is not held here.</p>
                )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep(2)}><IoArrowBack /> Back</button>
                <button className="btn-primary" style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={handleAddMasjid} disabled={isSubmitting}>
                    {isSubmitting ? (
                        <>
                            <div className="spinner" style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
                            Adding Masjid...
                        </>
                    ) : (
                        <>Submit Masjid <IoCheckmarkCircleOutline size={18} /></>
                    )}
                </button>
            </div>
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
