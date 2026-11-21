import React, { useState, useEffect } from "react";
import { API_BASE } from "../config";
import { useLocation, useNavigate } from "react-router-dom";
import {
    IoLocationSharp,
    IoNavigate,
    IoArrowBack,
    IoCreateOutline,
    IoTimeOutline,
    IoPeopleOutline,
    IoMoonOutline,
    IoMapOutline,
    IoCalendarOutline,
    IoWarningOutline,
    IoLocationOutline
} from "react-icons/io5";
import HeartButton from "../components/HeartButton";
import { useTour } from "../context/TourContext";
import { driver } from "driver.js";

function toPascalCase(str) {
    if (!str) return "";
    return str
        .split(/([ -])/g)
        .map((word) =>
            word.match(/[a-zA-Z]/)
                ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                : word
        )
        .join("");
}

export default function AboutMasjidPage() {
    const { state } = useLocation();
    const navigate = useNavigate();
    const masjid = state?.masjid;

    const [masjidData, setMasjidData] = useState(masjid); // live data, re-fetched
    const [displayAddress, setDisplayAddress] = useState("");
    const [isLoadingAddress, setIsLoadingAddress] = useState(false);
    const [history, setHistory] = useState([]);

    // --- NEW: Tour Setup ---
    const { tourActive, tourStage, setTourStage, driverObj, setDriverObj } = useTour();

    useEffect(() => {
        if (tourActive && tourStage === 'home') {
            // Upgrade stage so we know we've reached About page
            setTourStage('about');

            setTimeout(() => {
                const tourDriver = driver({
                    showProgress: true,
                    allowClose: true,
                    steps: [
                        {
                            element: '#tour-about-edit-btn',
                            popover: {
                                title: 'Updating Timings',
                                description: "Notice the 'Update' buttons on each section. You can click these to propose new timings. (Note: You must be logged in to update verified Masjids). Click this button to proceed!",
                                side: "bottom",
                                align: 'start'
                            }
                        }
                    ],
                    onDestroyStarted: () => {
                        tourDriver.destroy();
                    }
                });

                setDriverObj(tourDriver);
                tourDriver.drive();
            }, 500);
        }

        return () => {
            if (driverObj && tourStage === 'about') driverObj.destroy();
        };
    }, [tourActive, tourStage]);

    useEffect(() => {
        if (!masjid) return;

        const fetchData = async () => {
            // 0. Re-fetch the latest masjid data from backend
            try {
                const freshRes = await fetch(`${API_BASE}/api/masjid/${masjid.id}`);
                if (freshRes.ok) {
                    const freshData = await freshRes.json();
                    if (freshData && freshData.id) {
                        // Preserve client-side fields like distanceText
                        setMasjidData(prev => ({
                            ...prev,
                            ...freshData,
                            distanceText: prev?.distanceText || masjid.distanceText
                        }));
                    }
                }
            } catch (err) { console.error("Fresh fetch err:", err); }

            // 1. Get Address
            const existingAddress = masjid.details?.addressLine1 || masjid.details?.address || masjid.address;
            if (existingAddress && existingAddress !== "Custom Location" && !existingAddress.startsWith("Lat:")) {
                setDisplayAddress(existingAddress);
            } else {
                const loc = masjid.location;
                if (loc?.latitude && loc?.longitude) {
                    setIsLoadingAddress(true);
                    try {
                        const res = await fetch(`${API_BASE}/api/reverseGeocode?lat=${loc.latitude}&lng=${loc.longitude}`);
                        const data = await res.json();
                        setDisplayAddress(data?.address || "Address not available");
                    } catch { setDisplayAddress("Address not available"); }
                    finally { setIsLoadingAddress(false); }
                }
            }

            // 2. Get Change History
            try {
                const hRes = await fetch(`${API_BASE}/api/masjid/${masjid.id}/history`);
                if (hRes.ok) {
                    const hData = await hRes.json();
                    setHistory(hData.history || []);
                }
            } catch (err) { console.error("History fetch err:", err); }
        };

        fetchData();
    }, [masjid]);

    if (!masjidData) {
        return (
            <div className="empty-state">
                <p>No masjid data available.</p>
                <button className="btn-primary" onClick={() => navigate("/")}>Go Home</button>
            </div>
        );
    }

    const details = masjidData.details || {};
    const timings = details.timings || {};
    const name = details.name || masjidData.mosqueName || "Unknown Masjid";

    const safeTime = (t) => {
        if (!t || t === "NaN" || t === "undefined") return "---";
        try {
            const tStr = typeof t === 'string' ? t.trim() : Object.values(t).join("");
            if (!tStr) return "---";
            const parts = tStr.split(":");
            if (parts.length >= 2) {
                let hours = parseInt(parts[0], 10);
                const minutes = parts[1].replace(/[^0-9]/g, '');
                if (!isNaN(hours)) {
                    if (tStr.toLowerCase().includes('am') || tStr.toLowerCase().includes('pm')) return tStr;
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    hours = hours % 12 || 12;
                    return `${hours}:${minutes.padStart(2, '0')} ${ampm}`;
                }
            }
            return tStr;
        } catch { return "---"; }
    };

    const prayerList = [
        { name: "Fajr", time: timings.fajr },
        { name: "Dhuhr", time: timings.dhuhr },
        { name: "Asr", time: timings.asar || timings.asr },
        { name: "Maghrib", time: timings.maghrib },
        { name: "Isha", time: timings.isha },
    ];

    const jummaTimings = Array.isArray(timings?.jummatiming) ? timings.jummatiming : (timings?.jummatiming ? [timings.jummatiming] : []);
    const taraweehEntries = Array.isArray(timings?.taravi || timings?.taraweeh) ? (timings.taravi || timings.taraweeh) : [];

    const openGoogleMaps = () => {
        if (masjidData.location?.latitude && masjidData.location?.longitude) {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${masjidData.location.latitude},${masjidData.location.longitude}`, "_blank");
        } else { alert("Location not available"); }
    };

    const events = details.events || [];
    const isVerified = masjidData?.isVerified !== false;

    return (
        <div className="about-page-content page-padding" style={{ paddingBottom: 100, paddingTop: "calc(80px + var(--safe-area-top, 0px))" }}>
            {/* Fixed Top Navbar */}
            <div style={{
                position: "fixed", top: 0, left: 0, right: 0,
                height: "calc(60px + var(--safe-area-top, 0px))",
                paddingTop: "var(--safe-area-top, 0px)",
                paddingLeft: "20px", paddingRight: "20px",
                boxSizing: "border-box",
                backgroundColor: "#fff", display: "flex", alignItems: "center",
                boxShadow: "0 2px 5px rgba(0,0,0,0.05)", zIndex: 1000
            }}>
                <button onClick={() => {
                    if (state?.returnUrl) {
                        navigate(state.returnUrl, { state: state.returnState });
                    } else {
                        navigate(-1);
                    }
                }} style={{ background: "transparent", border: "none", cursor: "pointer", marginRight: 15, padding: 0, display: "flex", alignItems: "center" }}><IoArrowBack size={24} color="#111827" /></button>
                <h2 style={{ fontSize: 18, fontWeight: "600", color: "#111827", margin: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{toPascalCase(name)}</h2>
                <div style={{ marginLeft: "10px" }}><HeartButton masjidid={masjidData.id || masjidData.mosqueId} /></div>
            </div>

            {/* Report Section - Header */}
            {history.length > 0 && (
                <div style={{ marginBottom: 15, padding: "15px", backgroundColor: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: "700", color: "#6B7280", margin: "0 0 10px 0" }}>Something wrong with this masjid?</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <button
                            onClick={() => navigate("/update-timings", { state: { masjid: masjidData, openReport: 'location_change' } })}
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#F59E0B", color: "white", border: "none", padding: "12px", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: "0 2px 4px rgba(245, 158, 11, 0.2)" }}
                        >
                            <IoLocationOutline size={18} />Report Location Change
                        </button>

                        <button
                            onClick={() => navigate("/update-timings", { state: { masjid: masjidData, openReport: 'does_not_exist' } })}
                            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", color: "white", border: "none", padding: "12px", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: "0 2px 4px rgba(239, 68, 68, 0.2)" }}
                        >
                            <IoWarningOutline size={18} />Masjid Does Not Exist Here
                        </button>
                    </div>
                </div>
            )}

            {/* Address & History Card */}
            {isVerified && (
                <div className="card" style={{ marginBottom: 15 }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                        <IoLocationSharp size={20} color="#10B981" /><span style={{ fontSize: 16, fontWeight: "bold", marginLeft: 8, color: "#111827" }}>Address</span>
                    </div>
                    {isLoadingAddress ? <div className="spinner" style={{ width: 20, height: 20, margin: "10px 0" }} /> : <p style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.5, marginBottom: 15 }}>{displayAddress}</p>}

                    <div style={{ display: "flex", gap: 10, marginBottom: history.length > 0 ? 15 : 0 }}>
                        <div onClick={openGoogleMaps} style={{ display: "flex", alignItems: "center", backgroundColor: "#ECFDF5", padding: "6px 14px", borderRadius: 20, fontSize: 14, color: "#065F46", fontWeight: "600", cursor: "pointer" }}>
                            <IoNavigate size={16} color="#10B981" style={{ marginRight: 6 }} />{masjidData.distanceText && masjidData.distanceText !== "N/A" ? masjidData.distanceText : "Navigate"}
                        </div>
                    </div>
                </div>
            )}

            {/* Jumma Timings */}
            {jummaTimings.length > 0 && (
                <div className="card" style={{ marginBottom: 15 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 15 }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <IoPeopleOutline size={20} color="#059669" /><span style={{ fontSize: 16, fontWeight: "bold", marginLeft: 8, color: "#059669" }}>Jumma Timings</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                            <button
                                onClick={() => navigate("/update-timings", { state: { masjid: masjidData, targetSection: "jumma-timings" } })}
                                style={{ background: "none", border: "none", color: "#10B981", fontSize: 12, fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}
                            >
                                <IoCreateOutline size={14} /> Update
                            </button>
                            {history.length > 0 && (
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 11, color: "#374151", fontWeight: "600" }}>Updated by {history[0].updated_by_name}</div>
                                    <div style={{ fontSize: 10, color: "#059669", fontWeight: "500" }}>({history[0].updater_role || "User"})</div>
                                    <div style={{ fontSize: 9, color: "#6B7280", marginTop: 2 }}>{new Date(history[0].created_at).toLocaleString()}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    {jummaTimings.map((time, index) => (
                        <div key={index} style={{ padding: "10px 0", borderBottom: index !== jummaTimings.length - 1 ? "1px solid #E5E7EB" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <div style={{ fontSize: 15, color: "#4B5563", fontWeight: "500" }}>Jumma {jummaTimings.length > 1 ? index + 1 : ''}</div>
                                <div style={{ fontSize: 15, color: "#111827", fontWeight: "600" }}>{safeTime(time)}</div>
                            </div>
                            {timings.bayan_names && timings.bayan_names[index] && <div style={{ fontSize: 13, color: "#10B981", fontWeight: "500" }}>Bayan: {timings.bayan_names[index]}</div>}
                        </div>
                    ))}
                </div>
            )}

            {/* Daily Timings */}
            <div className="card" style={{ marginBottom: 15 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 15 }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                        <IoTimeOutline size={20} color="#10B981" /><span style={{ fontSize: 16, fontWeight: "bold", marginLeft: 8, color: "#111827" }}>Daily Prayer Timings</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                        <button
                            id="tour-about-edit-btn"
                            onClick={() => navigate("/update-timings", { state: { masjid: masjidData, targetSection: "daily-prayers" } })}
                            style={{ background: "none", border: "none", color: "#10B981", fontSize: 12, fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}
                        >
                            <IoCreateOutline size={14} /> Update
                        </button>
                        {history.length > 0 && (
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 11, color: "#374151", fontWeight: "600" }}>Updated by {history[0].updated_by_name}</div>
                                <div style={{ fontSize: 10, color: "#10B981", fontWeight: "500" }}>({history[0].updater_role || "User"})</div>
                                <div style={{ fontSize: 9, color: "#6B7280", marginTop: 2 }}>{new Date(history[0].created_at).toLocaleString()}</div>
                            </div>
                        )}
                    </div>
                </div>
                {prayerList.map((p, index) => (
                    <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: index !== prayerList.length - 1 ? "1px solid #E5E7EB" : "none" }}>
                        <div style={{ fontSize: 15, color: "#4B5563", fontWeight: "500" }}>{p.name}</div>
                        <div style={{ fontSize: 15, color: "#111827", fontWeight: "600" }}>{safeTime(p.time)}</div>
                    </div>
                ))}
            </div>

            {/* Timings Board Photo */}
            {masjidData?.details?.timingsImageUrl && (
                <div className="card" style={{ marginBottom: 15 }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 20, marginRight: 8 }}>📋</span>
                        <span style={{ fontSize: 16, fontWeight: "bold", color: "#6366F1" }}>Official Timings Board</span>
                    </div>
                    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #E5E7EB" }}>
                        <img
                            src={masjidData.details.timingsImageUrl}
                            alt="Timings Board"
                            style={{ width: "100%", maxHeight: 400, objectFit: "contain", display: "block", backgroundColor: "#F9FAFB" }}
                            onClick={() => window.open(masjidData.details.timingsImageUrl, "_blank")}
                        />
                    </div>
                    <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, marginBottom: 0, textAlign: "center" }}>Tap to view full size</p>
                </div>
            )}

            {/* Taraweeh Section */}
            {taraweehEntries.length > 0 && (
                <div className="card" style={{ marginBottom: 15 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <IoMoonOutline size={20} color="#8B5CF6" />
                            <span style={{ fontSize: 16, fontWeight: "bold", marginLeft: 8, color: "#8B5CF6" }}>Taraweeh</span>
                        </div>
                        <button
                            onClick={() => navigate("/update-timings", { state: { masjid: masjidData, targetSection: "taraweeh-schedule" } })}
                            style={{ background: "none", border: "none", color: "#10B981", fontSize: 12, fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}
                        >
                            <IoCreateOutline size={14} /> Update
                        </button>
                    </div>
                    {taraweehEntries.map((entry, idx) => (
                        <div key={idx} style={{ padding: "10px 0", borderBottom: idx !== taraweehEntries.length - 1 ? "1px solid #E5E7EB" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <div style={{ fontSize: 15, color: "#4B5563", fontWeight: "500" }}>
                                    {entry.parah ? `Parah ${entry.parah}` : `Taraweeh ${taraweehEntries.length > 1 ? idx + 1 : ""}`}
                                </div>
                                <div style={{ fontSize: 15, color: "#111827", fontWeight: "600" }}>{safeTime(entry.time)}</div>
                            </div>
                            {entry.startDate && (
                                <div style={{ fontSize: 13, color: "#6B7280" }}>Start: {entry.startDate}</div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Events Section */}
            {events.length > 0 && (
                <div className="card" style={{ marginBottom: 15 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <IoCalendarOutline size={20} color="#F59E0B" />
                            <span style={{ fontSize: 16, fontWeight: "bold", marginLeft: 8, color: "#F59E0B" }}>Events</span>
                        </div>
                        <button
                            onClick={() => navigate("/update-timings", { state: { masjid: masjidData, targetSection: "events-schedule" } })}
                            style={{ background: "none", border: "none", color: "#10B981", fontSize: 12, fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}
                        >
                            <IoCreateOutline size={14} /> Update
                        </button>
                    </div>
                    {events.map((ev, idx) => (
                        <div key={idx} style={{ padding: "10px 0", borderBottom: idx !== events.length - 1 ? "1px solid #E5E7EB" : "none" }}>
                            <div style={{ fontSize: 15, color: "#111827", fontWeight: "600", marginBottom: 4 }}>{ev.name}</div>
                            {ev.description && <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>{ev.description}</div>}
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                {ev.time && <span style={{ fontSize: 13, color: "#4B5563" }}>🕐 {safeTime(ev.time)}</span>}
                                {ev.speakerName && <span style={{ fontSize: 13, color: "#4B5563" }}>🎤 {ev.speakerName}</span>}
                                {ev.frequency && <span style={{ fontSize: 13, color: "#4B5563" }}>📅 {ev.frequency}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 25, marginBottom: 20 }}>
                <button style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#10B981", color: "white", border: "none", padding: "16px", borderRadius: "12px", fontSize: "16px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(16, 185, 129, 0.4)" }} onClick={() => navigate("/update-timings", { state: { masjid: masjidData } })}>
                    <IoCreateOutline size={22} />Update Timings
                </button>
            </div>
        </div>
    );
}
