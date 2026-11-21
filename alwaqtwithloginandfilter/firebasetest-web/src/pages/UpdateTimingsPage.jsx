import React, { useEffect, useState, useRef } from "react";
import { API_BASE } from "../config";
import { useLocation, useNavigate } from "react-router-dom";
import { IoArrowBack, IoCheckmarkCircleOutline, IoAddCircleOutline, IoTrashOutline, IoCalendarOutline, IoSaveOutline, IoPersonOutline, IoRepeatOutline, IoTimeOutline, IoLocationOutline, IoWarningOutline, IoCameraOutline, IoCloseCircleOutline, IoLocateOutline, IoSync } from "react-icons/io5";
import { updateMasjidDetails } from "../api/apiupdatemasjiddetails";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTour } from "../context/TourContext";
import { driver } from "driver.js";
import { getUserLocation } from "../utils/geolocation";
import SearchBar from "../components/SearchBar";
import CustomTimePicker from "../components/CustomTimePicker";
// Fix leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ReportMapClickHandler({ onMapClick }) {
    useMapEvents({ click(e) { onMapClick(e.latlng); } });
    return null;
}

function ReportChangeView({ center }) {
    const map = useMap();
    if (center && center[0] && center[1]) {
        map.setView(center, map.getZoom()); // Preserve user's current zoom!
    }
    return null;
}

export default function UpdateTimingsPage({ masjid: propMasjid, isDashboard: propIsDashboard }) {
    const { state } = useLocation();
    const navigate = useNavigate();
    const masjid = propMasjid || state?.masjid;
    const isDashboard = propIsDashboard || state?.isDashboard;

    // --- Tour Setup ---
    const { tourActive, tourStage, setTourStage, completeTour, driverObj, setDriverObj } = useTour();

    useEffect(() => {
        if (tourActive && (tourStage === 'about' || tourStage === 'update')) {
            setTourStage('update');

            setTimeout(() => {
                const steps = [
                    { element: '#daily-prayers', popover: { title: '🕌 Daily Prayer Timings', description: 'Set the Fajr, Dhuhr, Asr, Maghrib, and Isha timings here. Each prayer has a simple time-picker.', side: 'top', align: 'start' } },
                    { element: '#jumma-timings', popover: { title: '📿 Jummah Timings', description: 'Add one or more Jummah salah times. You can also specify the Bayan speaker name.', side: 'top', align: 'start' } },
                    { element: '#taraweeh-schedule', popover: { title: '🌙 Taraweeh Schedule', description: 'During Ramadhan, add Taraweeh timings and Parah details here.', side: 'top', align: 'start' } },
                    { element: '#events-schedule', popover: { title: '🎤 Events', description: 'Add regular events like weekly Bayans or special programs with speaker names and frequency.', side: 'top', align: 'start' } },
                ];

                // Add verification step only if the block is visible
                if (document.getElementById('tour-verification-block')) {
                    steps.push({ element: '#tour-verification-block', popover: { title: '📍 Location Verification', description: 'This masjid was auto-imported. You can verify its exact location with a pin on the map, your phone number, and a photo. The location goes to admin for approval.', side: 'top', align: 'start' } });
                }

                const tourDriver = driver({
                    showProgress: true,
                    allowClose: true,
                    steps: steps,
                    onDestroyStarted: () => {
                        tourDriver.destroy();
                        // End the tour gracefully here. No need to force them to the Add page.
                        completeTour();
                        navigate('/');
                    }
                });

                setDriverObj(tourDriver);
                tourDriver.drive();
            }, 600);
        }

        return () => {
            if (driverObj && tourStage === 'update') driverObj.destroy();
        };
    }, [tourActive, tourStage]);

    // Handle incoming deep link scroll from VerificationPrompt
    useEffect(() => {
        if (state?.scrollToMap) {
            setTimeout(() => {
                const mapBlock = document.getElementById("tour-verification-block");
                if (mapBlock) {
                    mapBlock.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 500);
        }
    }, [state]);

    if (!masjid) {
        return (
            <div className="empty-state">
                <p>No masjid data available.</p>
                <button className="btn-primary" onClick={() => navigate("/")}>Go Home</button>
            </div>
        );
    }

    const currentTimings = masjid.details?.timings || {};

    // Helper: Convert "1:30 PM" to "13:30" (for <input type="time">)
    const parseTo24Hour = (timeStr) => {
        if (!timeStr) return "";
        timeStr = timeStr.trim();

        // Handle AM/PM format
        if (timeStr.toUpperCase().includes("AM") || timeStr.toUpperCase().includes("PM")) {
            const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (match) {
                let hours = parseInt(match[1], 10);
                const minutes = match[2];
                const period = match[3].toUpperCase();

                if (period === "PM" && hours !== 12) hours += 12;
                if (period === "AM" && hours === 12) hours = 0;

                return `${hours.toString().padStart(2, '0')}:${minutes}`;
            }
        }

        // Check if already HH:mm
        const parts = timeStr.split(":");
        if (parts.length >= 2) {
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (!isNaN(hours) && !isNaN(minutes)) {
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            }
        }
        return "";
    };

    // Helper: Convert "13:30" to "1:30 PM" (for database)
    const formatAMPM = (timeStr24) => {
        if (!timeStr24) return "";
        const [hours24, minutes] = timeStr24.split(":");
        let hours = parseInt(hours24, 10);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${hours}:${minutes} ${ampm}`;
    };

    // Helper: Format Dates safely
    const parseDateToYYYYMMDD = (dateStr) => {
        if (!dateStr) return "";
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return "";
            return d.toISOString().split("T")[0];
        } catch {
            return "";
        }
    };
    const formatYYYYMMDDToDateString = (isoStr) => {
        if (!isoStr) return "";
        try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return "";
            return d.toDateString(); // "Wed Mar 12 2026"
        } catch {
            return "";
        }
    };

    // Initialize Jumma arrays
    const initJumma = () => {
        const existing = currentTimings.jummatiming;
        if (Array.isArray(existing)) {
            return existing.map(t => parseTo24Hour(t));
        } else if (typeof existing === 'string' && existing) {
            return [parseTo24Hour(existing)];
        }
        return [""]; // at least one input block
    };

    // Initialize Taraweeh arrays
    const initTaraweeh = () => {
        const existing = currentTimings.taravi || currentTimings.taraweeh;
        if (Array.isArray(existing)) {
            return existing.map(entry => ({
                time: parseTo24Hour(entry.time),
                parah: entry.parah || "",
                startDate: parseDateToYYYYMMDD(entry.startDate)
            }));
        } else if (existing && typeof existing === 'object') {
            return [{
                time: parseTo24Hour(existing.time),
                parah: existing.parah || "",
                startDate: existing.startDate || ""
            }];
        }
        return [];
    };

    const initEvents = () => {
        const existing = masjid.details?.events;
        if (Array.isArray(existing)) {
            return existing.map(ev => ({
                name: ev.name || "",
                description: ev.description || "",
                speakerName: ev.speakerName || "",
                frequency: ev.frequency || "weekly",
                time: ev.time ? parseTo24Hour(ev.time) : "",
                dateInfo: ev.dateInfo || ""
            }));
        }
        return [];
    };

    const [basicInfo, setBasicInfo] = useState({
        name: masjid.details?.name || masjid.mosqueName || masjid.name || "",
        addressLine1: masjid.details?.addressLine1 || masjid.metadata?.address || ""
    });

    const [timings, setTimings] = useState({
        fajr: parseTo24Hour(currentTimings.fajr),
        dhuhr: parseTo24Hour(currentTimings.dhuhr),
        asar: parseTo24Hour(currentTimings.asar || currentTimings.asr),
        maghrib: parseTo24Hour(currentTimings.maghrib),
        isha: parseTo24Hour(currentTimings.isha),
    });

    const [jummaTimings, setJummaTimings] = useState(initJumma());
    const [bayanNames, setBayanNames] = useState(currentTimings.bayan_names || jummaTimings.map(() => ""));
    const [taraweehEntries, setTaraweehEntries] = useState(initTaraweeh());
    const [events, setEvents] = useState(initEvents());
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    // Report modal state
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportType, setReportType] = useState("");
    const [newLocation, setNewLocation] = useState({ lat: null, lng: null });
    const [reportImage, setReportImage] = useState(null);
    const [reportImagePreview, setReportImagePreview] = useState(null);
    const [submittingReport, setSubmittingReport] = useState(false);
    const [reportPhone, setReportPhone] = useState("");
    const [isLocatingReport, setIsLocatingReport] = useState(false);
    const fileInputRef = useRef(null);
    const reportCameraRef = useRef(null);
    // Verification state
    const isVerified = masjid?.isVerified !== false;
    const [verificationLocation, setVerificationLocation] = useState({
        lat: masjid?.olaLocation?.latitude || masjid?.location?.latitude || masjid?.latitude || null,
        lng: masjid?.olaLocation?.longitude || masjid?.location?.longitude || masjid?.longitude || null
    });
    const [verificationPhone, setVerificationPhone] = useState("");
    const [verificationImage, setVerificationImage] = useState(null);
    const [verificationImagePreview, setVerificationImagePreview] = useState(null);
    const verificationFileInputRef = useRef(null);
    const verificationCameraRef = useRef(null);
    const [isLocatingVerification, setIsLocatingVerification] = useState(false);

    // Timings board image state
    const [timingsBoardImage, setTimingsBoardImage] = useState(null);
    const [timingsBoardImagePreview, setTimingsBoardImagePreview] = useState(
        masjid?.details?.timingsImageUrl || null
    );
    const timingsBoardFileInputRef = useRef(null);
    const timingsBoardCameraRef = useRef(null);

    // Scroll to specific section if navigated from shortcut
    useEffect(() => {
        if (state?.targetSection) {
            setTimeout(() => {
                const element = document.getElementById(state.targetSection);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // Highlight the section briefly
                    element.style.transition = 'box-shadow 0.5s';
                    element.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.4)';
                    setTimeout(() => {
                        element.style.boxShadow = 'none';
                    }, 2000);
                }
            }, 500); // small delay to ensure rendering
        }
    }, [state?.targetSection]);

    useEffect(() => {
        if (!masjid?.id || (typeof masjid.id === 'string' && masjid.id.startsWith('ola-'))) return;

        const fetchHistory = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/masjid/${masjid.id}/history`);
                if (res.ok) {
                    const data = await res.json();
                    setHistory(data.history || []);
                }
            } catch (err) {
                console.error("History fetch error:", err);
            }
        };
        fetchHistory();
    }, [masjid]);

    // Dynamic handers for Jumma
    const addJumma = () => {
        setJummaTimings([...jummaTimings, ""]);
        setBayanNames([...bayanNames, ""]);
    };
    const removeJumma = (index) => {
        setJummaTimings(jummaTimings.filter((_, i) => i !== index));
        setBayanNames(bayanNames.filter((_, i) => i !== index));
    };
    const updateJumma = (index, value) => {
        const newTimings = [...jummaTimings];
        newTimings[index] = value;
        setJummaTimings(newTimings);
    };
    const updateBayan = (index, value) => {
        const newNames = [...bayanNames];
        newNames[index] = value;
        setBayanNames(newNames);
    };

    // Dynamic handers for Taraweeh
    const addTaraweeh = () => setTaraweehEntries([...taraweehEntries, { time: "", parah: "", startDate: "" }]);
    const removeTaraweeh = (index) => setTaraweehEntries(taraweehEntries.filter((_, i) => i !== index));
    const updateTaraweeh = (index, field, value) => {
        const newEntries = [...taraweehEntries];
        newEntries[index][field] = value;
        setTaraweehEntries(newEntries);
    };

    // Dynamic handlers for Events
    const addEvent = () => setEvents([...events, { name: "", description: "", speakerName: "", frequency: "weekly", time: "", dateInfo: "" }]);
    const removeEvent = (index) => setEvents(events.filter((_, i) => i !== index));
    const updateEvent = (index, field, value) => {
        setEvents(prev => prev.map((ev, i) =>
            i === index ? { ...ev, [field]: value } : ev
        ));
    };

    // Report handlers
    const openReportModal = (type) => {
        setReportType(type);
        setNewLocation({
            lat: masjid.location?.latitude || null,
            lng: masjid.location?.longitude || null
        });
        setReportImage(null);
        setReportImagePreview(null);
        setReportPhone("");
        setShowReportModal(true);
    };

    useEffect(() => {
        if (state?.openReport && masjid) {
            // Slight delay to ensure the component is fully mounted before state updates 
            setTimeout(() => {
                openReportModal(state.openReport);
            }, 100);
        }
    }, [state?.openReport, masjid]);

    const getCurrentLocationForReport = () => {
        setIsLocatingReport(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setNewLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setIsLocatingReport(false);
                },
                (err) => {
                    alert("Could not get your location: " + err.message);
                    setIsLocatingReport(false);
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            alert("Geolocation is not supported by your browser.");
            setIsLocatingReport(false);
        }
    };

    const handleSubmitReport = async () => {
        if (!reportPhone || reportPhone.length < 10) {
            alert("Please enter a valid mobile number.");
            return;
        }
        if (!reportImage) {
            alert("Please take/select a photo as proof.");
            return;
        }
        if (reportType === 'location_change' && (!newLocation.lat || !newLocation.lng)) {
            alert("Please select the new location on the map.");
            return;
        }

        setSubmittingReport(true);
        try {
            const baseUrl = API_BASE || window.location.origin;

            // 1. Upload image
            const formData = new FormData();
            formData.append("image", reportImage);
            const uploadRes = await fetch(`${baseUrl}/api/uploadImage`, {
                method: "POST",
                body: formData
            });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) throw new Error("Image upload failed");

            // 2. Submit report
            const reportBody = {
                masjidId: masjid.id,
                reportType: reportType,
                imageUrl: uploadData.imageUrl,
            };
            if (reportType === 'location_change') {
                reportBody.newLat = newLocation.lat;
                reportBody.newLng = newLocation.lng;
            }

            const reportRes = await fetch(`${baseUrl}/api/reportMasjid`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reportBody)
            });

            if (reportRes.ok) {
                alert(reportType === 'location_change'
                    ? "Location change report submitted! Nearby users will verify this. Thank you!"
                    : "Report submitted! Nearby users will verify this. Thank you!");
                setShowReportModal(false);
            } else {
                alert("Failed to submit report. Please try again.");
            }
        } catch (err) {
            console.error("Report error:", err);
            alert("Error submitting report. Please try again.");
        } finally {
            setSubmittingReport(false);
        }
    };

    const handleVerificationImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert("File is too large. Max 5MB allowed.");
                return;
            }
            setVerificationImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setVerificationImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeVerificationImage = () => {
        setVerificationImage(null);
        setVerificationImagePreview(null);
        if (verificationFileInputRef.current) {
            verificationFileInputRef.current.value = "";
        }
    };

    const handleUpdate = async () => {
        setLoading(true);

        // Verification validation if not verified
        let verificationData = null;
        if (!isVerified) {
            /* === TEMPORARY COMMENT FOR TESTING ===
            if (!verificationPhone || verificationPhone.trim().length < 10) {
                alert("Please provide a valid 10-digit mobile number for verification.");
                setLoading(false);
                return;
            }
            if (!verificationLocation.lat || !verificationLocation.lng) {
                alert("Please verify the masjid location on the map.");
                setLoading(false);
                return;
            }
            if (!verificationImage) {
                alert("Please upload an image of the masjid for verification.");
                setLoading(false);
                return;
            }
            ======================================= */

            try {
                let imageUrl = "";
                if (verificationImage) {
                    // Upload image first
                    const baseUrl = API_BASE || window.location.origin;
                    const formData = new FormData();
                    formData.append("image", verificationImage);
                    const uploadRes = await fetch(`${baseUrl}/api/uploadImage`, {
                        method: "POST",
                        body: formData
                    });
                    const uploadData = await uploadRes.json();
                    if (!uploadRes.ok) throw new Error("Image upload failed");
                    imageUrl = uploadData.imageUrl;
                }

                verificationData = {
                    lat: verificationLocation.lat,
                    lng: verificationLocation.lng,
                    phone: verificationPhone || "0000000000", // Dummy fallback
                    imageUrl: imageUrl || "https://example.com/dummy.jpg" // Dummy fallback
                };
            } catch (err) {
                console.error("Verification image upload error:", err);
                alert("Failed to upload verification image. Please try again.");
                setLoading(false);
                return;
            }
        }

        const cleanJumma = jummaTimings.filter(t => t.trim() !== "");
        const formattedJumma = cleanJumma.map(t => formatAMPM(t));

        const cleanTaraweeh = taraweehEntries.filter(t => t.time || t.parah || t.startDate);
        const formattedTaraweeh = cleanTaraweeh.map(entry => ({
            time: formatAMPM(entry.time),
            parah: entry.parah,
            startDate: entry.startDate // Day of Ramadan, kept as string/number
        }));

        console.log(events)
        const cleanEvents = events.filter(e =>
            (e.name && e.name.trim() !== "") ||
            (e.description && e.description.trim() !== "") ||
            (e.speakerName && e.speakerName.trim() !== "") ||
            (e.time && e.time.trim() !== "")
        ).map(e => ({
            ...e,
            name: e.name || "Unnamed Event",
            time: formatAMPM(e.time)
        }));

        console.log(cleanEvents)

        const formattedTimings = {
            fajr: formatAMPM(timings.fajr),
            dhuhr: formatAMPM(timings.dhuhr),
            asar: formatAMPM(timings.asar),
            maghrib: formatAMPM(timings.maghrib),
            isha: formatAMPM(timings.isha),
            jummatiming: formattedJumma,
            bayan_names: bayanNames,
            taravi: formattedTaraweeh,
        };

        const updates = {
            name: basicInfo.name,
            addressLine1: basicInfo.addressLine1,
            timings: formattedTimings,
            events: cleanEvents
        };

        // Upload timings board image if selected
        if (timingsBoardImage) {
            try {
                const baseUrl = API_BASE || window.location.origin;
                const tbFormData = new FormData();
                tbFormData.append("image", timingsBoardImage);
                const tbUploadRes = await fetch(`${baseUrl}/api/uploadImage`, {
                    method: "POST",
                    body: tbFormData
                });
                const tbUploadData = await tbUploadRes.json();
                if (!tbUploadRes.ok) throw new Error("Timings board image upload failed");
                updates.timingsImageUrl = tbUploadData.imageUrl;
            } catch (err) {
                console.error("Timings board image upload error:", err);
                alert("Failed to upload timings board photo. Your other changes will still be saved.");
            }
        }

        try {
            let targetId = masjid.id;
            let finalMasjid = { ...masjid };

            // 1. Get updater info from localStorage once
            const storedUser = localStorage.getItem("@user");
            let updater = null;
            if (storedUser) {
                try {
                    const parsed = JSON.parse(storedUser);
                    updater = {
                        id: parsed.userid || parsed.id,
                        name: parsed.name,
                        type: parsed.userType || (parsed.email ? 'User' : 'Unknown')
                    };
                } catch (e) { /* ignore */ }
            }

            // 2. Resolve targetId (handle external OLA masjids)
            if (!targetId || (typeof targetId === 'string' && targetId.startsWith('ola-'))) {
                const addReq = {
                    details: {
                        name: basicInfo.name,
                        addressLine1: basicInfo.addressLine1,
                        timings: formattedTimings,
                        events: cleanEvents
                    },
                    location: {
                        latitude: masjid.location?.latitude || masjid.latitude,
                        longitude: masjid.location?.longitude || masjid.longitude,
                    },
                    timestamps: { createdAt: new Date().toISOString() },
                    source: "ola",
                    olaPlaceId: targetId.replace("ola-", "")
                };

                const addResp = await fetch(`${API_BASE}/addMasjid`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(addReq)
                });

                const addData = await addResp.json();
                if (!addResp.ok) throw new Error(addData.error || "Failed to initialize external masjid");

                targetId = addData.masjidId;
                finalMasjid.id = targetId;
            }

            // 3. Perform the actual update call for ALL masjids
            console.log("=== UPDATE PAYLOAD DEBUG ===", { targetId, updates, updater });
            await updateMasjidDetails(targetId, updates, updater, verificationData);

            const updatedMasjid = {
                ...masjid,
                isVerified: true, // Optimistically force verified status
                name: basicInfo.name,
                details: {
                    ...masjid.details,
                    name: basicInfo.name,
                    addressLine1: basicInfo.addressLine1,
                    timings: formattedTimings,
                    events: cleanEvents
                }
            };

            alert("Timings Updated Successfully!");
            // Use replace: true so hitting back doesn't get messed up traversing local history
            navigate("/about-masjid", { state: { masjid: updatedMasjid }, replace: true });
        } catch (error) {
            console.error(error);
            alert(error.message || "Could not update timings. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: "calc(80px + var(--safe-area-top, 0px)) 20px 100px 20px", backgroundColor: "#F3F4F6", minHeight: "100vh" }}>
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
                {!isDashboard && (
                    <button onClick={() => navigate(-1)} style={{ background: "transparent", border: "none", cursor: "pointer", marginRight: 15, padding: 0, display: "flex", alignItems: "center" }}>
                        <IoArrowBack size={24} color="#111827" />
                    </button>
                )}
                <div style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <h2 style={{ fontSize: 20, fontWeight: "700", color: "#111827", margin: 0, textOverflow: "ellipsis", overflow: "hidden" }}>
                        {isDashboard ? "Your Masjid Dashboard" : "Update Timings"}
                    </h2>
                    <p style={{ fontSize: 13, color: "#10B981", fontWeight: "600", margin: 0, textOverflow: "ellipsis", overflow: "hidden" }}>{masjid.details?.name}</p>
                </div>
                <button
                    onClick={handleUpdate}
                    disabled={loading}
                    style={{
                        backgroundColor: "#10B981", color: "#FFF",
                        border: "none", borderRadius: "8px",
                        padding: "8px 16px", fontSize: "14px", fontWeight: "700",
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                        opacity: loading ? 0.7 : 1, boxShadow: "0 2px 4px rgba(16, 185, 129, 0.4)"
                    }}
                >
                    {loading ? "Saving..." : "Save Changes"} <IoSaveOutline size={18} />
                </button>
            </div>

            {/* Verification Block */}
            {!isVerified && (
                <div id="tour-verification-block" className="card" style={{ marginBottom: 20, borderLeft: "4px solid #F59E0B" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 15 }}>
                        <IoWarningOutline size={24} color="#F59E0B" />
                        <h3 style={{ fontSize: 18, fontWeight: "bold", color: "#111827", margin: 0 }}>Location Verification Required</h3>
                    </div>
                    <p style={{ fontSize: 14, color: "#4B5563", marginBottom: 20 }}>
                        This masjid was added automatically. Please help us verify its exact location, provide a contact number, and upload a recent photo to make it official in our community.
                    </p>

                    <div style={{ display: "grid", gap: 20 }}>
                        {/* Map Picker */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div>
                                    <label style={{ fontSize: 14, color: "#374151", marginBottom: 0, fontWeight: "700", display: "block" }}>
                                        1. Pin Exact Location <span style={{ color: "red" }}>*</span>
                                    </label>
                                    <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4, marginBottom: 0 }}>Drag the map to precisely pin the entrance.</p>
                                </div>
                                <button
                                    type="button"
                                    disabled={isLocatingVerification}
                                    onClick={async () => {
                                        setIsLocatingVerification(true);
                                        try {
                                            const pos = await getUserLocation();
                                            setVerificationLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                                        } catch (err) {
                                            alert("Could not get your location. Please check map permissions.");
                                        } finally {
                                            setIsLocatingVerification(false);
                                        }
                                    }}
                                    style={{ display: "flex", alignItems: "center", gap: 4, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: "600", color: "#065F46", cursor: isLocatingVerification ? "wait" : "pointer", opacity: isLocatingVerification ? 0.7 : 1 }}
                                >
                                    {isLocatingVerification ? (
                                        <><IoSync size={14} style={{ animation: "spin 1s linear infinite" }} /> Locating...</>
                                    ) : (
                                        <><IoLocateOutline size={14} /> Current Location</>
                                    )}
                                </button>
                            </div>
                            
                            {/* Search Bar for manual location selection */}
                            <div style={{ marginBottom: 15 }}>
                                <SearchBar 
                                    setSendCoords={(coords) => setVerificationLocation({ lat: coords.lat, lng: coords.lng })} 
                                    defaultLocationText="" 
                                    defaultLocationCoords={null} 
                                    requestCurrentLocation={() => {}} 
                                    isHeader={false} 
                                />
                            </div>

                            <div style={{ height: 250, borderRadius: 12, overflow: "hidden", border: "1px solid #D1D5DB", zIndex: 0 }}>
                                <MapContainer
                                    center={[verificationLocation.lat || 17.385, verificationLocation.lng || 78.4867]}
                                    zoom={15}
                                    style={{ height: "100%", width: "100%", zIndex: 0 }}
                                    scrollWheelZoom={true}
                                >
                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                    <ReportChangeView center={verificationLocation.lat && verificationLocation.lng ? [verificationLocation.lat, verificationLocation.lng] : null} />
                                    <Marker
                                        position={[verificationLocation.lat || 17.385, verificationLocation.lng || 78.4867]}
                                        draggable={true}
                                        eventHandlers={{
                                            dragend: (e) => {
                                                const marker = e.target;
                                                const position = marker.getLatLng();
                                                setVerificationLocation({ lat: position.lat, lng: position.lng });
                                            },
                                        }}
                                    />
                                    <ReportMapClickHandler onMapClick={(latlng) => {
                                        setVerificationLocation({ lat: latlng.lat, lng: latlng.lng });
                                    }} />
                                </MapContainer>
                            </div>
                        </div>

                        {/* Phone Number */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <label style={{ fontSize: 14, color: "#374151", marginBottom: 8, fontWeight: "700" }}>
                                2. Your Mobile Number <span style={{ color: "red" }}>*</span>
                            </label>
                            <input
                                type="tel"
                                placeholder="e.g. 9876543210"
                                value={verificationPhone}
                                onChange={(e) => setVerificationPhone(e.target.value.replace(/\D/g, ''))}
                                style={{
                                    width: "100%", padding: "14px", boxSizing: "border-box",
                                    border: "1px solid #D1D5DB", borderRadius: 10, fontSize: 16
                                }}
                            />
                            <p style={{ fontSize: 12, color: "#6B7280", marginTop: 6, marginBottom: 0 }}>Only used internally for verification purposes.</p>
                        </div>

                        {/* Image Upload */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <label style={{ fontSize: 14, color: "#374151", marginBottom: 8, fontWeight: "700" }}>
                                3. Masjid Photo <span style={{ color: "red" }}>*</span>
                            </label>
                            {!verificationImagePreview ? (
                                <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                                    <div
                                        onClick={() => verificationCameraRef.current?.click()}
                                        style={{
                                            flex: 1, border: "2px dashed #D1D5DB", borderRadius: "12px", padding: "20px",
                                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                            cursor: "pointer", backgroundColor: "#F9FAFB", transition: "all 0.2s"
                                        }}
                                    >
                                        <IoCameraOutline size={32} color="#9CA3AF" style={{ marginBottom: 10 }} />
                                        <span style={{ color: "#4B5563", fontWeight: "600", fontSize: 13, textAlign: "center" }}>Take Photo</span>
                                    </div>
                                    <div
                                        onClick={() => verificationFileInputRef.current?.click()}
                                        style={{
                                            flex: 1, border: "2px dashed #D1D5DB", borderRadius: "12px", padding: "20px",
                                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                            cursor: "pointer", backgroundColor: "#F9FAFB", transition: "all 0.2s"
                                        }}
                                    >
                                        <span style={{ fontSize: "32px", marginBottom: 10 }}>🖼️</span>
                                        <span style={{ color: "#4B5563", fontWeight: "600", fontSize: 13, textAlign: "center" }}>Upload Gallery</span>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid #E5E7EB" }}>
                                    <img src={verificationImagePreview} alt="Verification" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                                    <button
                                        onClick={removeVerificationImage}
                                        style={{
                                            position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.9)",
                                            border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex",
                                            alignItems: "center", justifyContent: "center", cursor: "pointer",
                                            boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
                                        }}
                                    >
                                        <IoCloseCircleOutline size={24} color="#EF4444" />
                                    </button>
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                ref={verificationFileInputRef}
                                onChange={handleVerificationImageChange}
                                style={{ display: "none" }}
                            />
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                ref={verificationCameraRef}
                                onChange={handleVerificationImageChange}
                                style={{ display: "none" }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Basic Info Card */}
            <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid #10B981" }}>
                <h3 style={{ fontSize: 18, fontWeight: "bold", color: "#111827", marginBottom: 15 }}>General Information</h3>
                <div style={{ display: "grid", gap: 20 }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <label style={{ fontSize: 14, color: "#374151", marginBottom: 8, fontWeight: "700" }}>Masjid Name</label>
                        <div
                            style={{
                                width: "100%", padding: "14px", boxSizing: "border-box",
                                backgroundColor: "#F3F4F6", border: "1px solid #E5E7EB",
                                borderRadius: 10, color: "#6B7280", fontSize: 16,
                            }}
                        >
                            {basicInfo.name || "Unknown Masjid"}
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <label style={{ fontSize: 14, color: "#374151", marginBottom: 8, fontWeight: "700" }}>Location / Address</label>
                        <textarea
                            style={{
                                width: "100%", padding: "14px", boxSizing: "border-box",
                                backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB",
                                borderRadius: 10, outline: "none", color: "#111827", fontSize: 16,
                                transition: "all 0.2s", minHeight: "80px", resize: "vertical"
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = "#10B981";
                                e.target.style.backgroundColor = "#fff";
                                e.target.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.1)";
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = "#E5E7EB";
                                e.target.style.backgroundColor = "#F9FAFB";
                                e.target.style.boxShadow = "none";
                            }}
                            value={basicInfo.addressLine1}
                            onChange={(e) => setBasicInfo({ ...basicInfo, addressLine1: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Timings Board Photo Card */}
            <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: "bold", color: "#6366F1", margin: 0, marginBottom: 8 }}>📋 Timings Board Photo</h3>
                <p style={{ fontSize: 12, color: "#6B7280", marginTop: 0, marginBottom: 15 }}>Optional — Upload a photo of the masjid's physical timings board for authenticity.</p>

                <input
                    ref={timingsBoardFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                                alert("File is too large. Max 5MB allowed.");
                                return;
                            }
                            setTimingsBoardImage(file);
                            const reader = new FileReader();
                            reader.onloadend = () => setTimingsBoardImagePreview(reader.result);
                            reader.readAsDataURL(file);
                        }
                    }}
                />
                <input
                    ref={timingsBoardCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                                alert("File is too large. Max 5MB allowed.");
                                return;
                            }
                            setTimingsBoardImage(file);
                            const reader = new FileReader();
                            reader.onloadend = () => setTimingsBoardImagePreview(reader.result);
                            reader.readAsDataURL(file);
                        }
                    }}
                />

                {!timingsBoardImagePreview ? (
                    <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                        <div
                            onClick={() => timingsBoardCameraRef.current?.click()}
                            style={{
                                flex: 1, border: "2px dashed #C7D2FE", borderRadius: "12px", padding: "20px",
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", backgroundColor: "#EEF2FF", transition: "all 0.2s"
                            }}
                        >
                            <IoCameraOutline size={32} color="#818CF8" style={{ marginBottom: 10 }} />
                            <span style={{ color: "#4338CA", fontWeight: "600", fontSize: 13, textAlign: "center" }}>Take Photo</span>
                        </div>
                        <div
                            onClick={() => timingsBoardFileInputRef.current?.click()}
                            style={{
                                flex: 1, border: "2px dashed #C7D2FE", borderRadius: "12px", padding: "20px",
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", backgroundColor: "#EEF2FF", transition: "all 0.2s"
                            }}
                        >
                            <span style={{ fontSize: "32px", marginBottom: 10 }}>🖼️</span>
                            <span style={{ color: "#4338CA", fontWeight: "600", fontSize: 13, textAlign: "center" }}>Upload Gallery</span>
                        </div>
                    </div>
                ) : (
                    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid #E5E7EB" }}>
                        <img src={timingsBoardImagePreview} alt="Timings Board" style={{ width: "100%", maxHeight: 300, objectFit: "cover", display: "block" }} />
                        <button
                            onClick={() => {
                                setTimingsBoardImage(null);
                                setTimingsBoardImagePreview(null);
                                if (timingsBoardFileInputRef.current) timingsBoardFileInputRef.current.value = "";
                            }}
                            style={{
                                position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.9)",
                                border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex",
                                alignItems: "center", justifyContent: "center", cursor: "pointer",
                                boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
                            }}
                        >
                            <IoCloseCircleOutline size={24} color="#EF4444" />
                        </button>
                        <button
                            onClick={() => timingsBoardFileInputRef.current?.click()}
                            style={{
                                position: "absolute", bottom: 10, right: 10, background: "rgba(255,255,255,0.9)",
                                border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: "600",
                                color: "#4338CA", cursor: "pointer", boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
                            }}
                        >
                            Change Photo
                        </button>
                    </div>
                )}
            </div>

            {/* Daily Prayers Card */}
            <div id="daily-prayers" className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: "bold", color: "#374151", marginBottom: 15 }}>Daily Prayers</h3>
                {['fajr', 'dhuhr', 'asar', 'maghrib', 'isha'].map((prayer) => (
                    <div key={prayer} className="time-row" style={{ marginBottom: 15 }}>
                        <label style={{ fontSize: 15, fontWeight: 500, color: "#4B5563" }}>
                            {prayer.charAt(0).toUpperCase() + prayer.slice(1)}
                        </label>
                        <CustomTimePicker
                            value={timings[prayer]}
                            onChange={(val) => setTimings({ ...timings, [prayer]: val })}
                            defaultPeriod={prayer.toLowerCase() === 'fajr' ? 'AM' : 'PM'}
                        />
                    </div>
                ))}
            </div>

            {/* Jumu'ah Timings Card */}
            <div id="jumma-timings" className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
                    <h3 style={{ fontSize: 16, fontWeight: "bold", color: "#059669", margin: 0 }}>Jummah Timings</h3>
                    <button
                        onClick={addJumma}
                        style={{ color: "#059669", background: "none", border: "none", display: "flex", alignItems: "center", gap: 5, fontWeight: "600", cursor: "pointer" }}
                    >
                        <IoAddCircleOutline size={18} /> Add
                    </button>
                </div>
                {jummaTimings.map((time, idx) => (
                    <div key={idx} style={{ backgroundColor: "#F0FDF4", padding: 15, borderRadius: 8, marginBottom: 15 }}>
                        <div className="time-row" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                            <label style={{ fontSize: 14, fontWeight: 600, color: "#065F46", flex: 1 }}>
                                Time {jummaTimings.length > 1 ? `#${idx + 1}` : ''}
                            </label>
                            <div style={{ flex: 2 }}>
                                <CustomTimePicker
                                    value={time}
                                    onChange={(val) => updateJumma(idx, val)}
                                    defaultPeriod="PM"
                                />
                            </div>
                            {jummaTimings.length > 1 && (
                                <button onClick={() => removeJumma(idx)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}>
                                    <IoTrashOutline size={20} />
                                </button>
                            )}
                        </div>
                        <div className="time-row">
                            <label style={{ fontSize: 13, fontWeight: 500, color: "#4B5563", marginBottom: 5, display: "block" }}>Bayan Name / Speaker</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="e.g. Maulana X - Importance of Salah"
                                value={bayanNames[idx] || ""}
                                onChange={(e) => updateBayan(idx, e.target.value)}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Taraweeh Schedule Card */}
            <div id="taraweeh-schedule" className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
                    <h3 style={{ fontSize: 16, fontWeight: "bold", color: "#6366F1", margin: 0 }}>Taraweeh Schedule</h3>
                    <button
                        onClick={addTaraweeh}
                        style={{ color: "#6366F1", background: "none", border: "none", display: "flex", alignItems: "center", gap: 5, fontWeight: "600", cursor: "pointer" }}
                    >
                        <IoAddCircleOutline size={18} /> Add
                    </button>
                </div>

                {taraweehEntries.length === 0 && (
                    <p style={{ color: "#6B7280", fontSize: 14, fontStyle: "italic", textAlign: "center", margin: "10px 0" }}>
                        No Taraweeh schedule added.
                    </p>
                )}

                {taraweehEntries.map((entry, idx) => (
                    <div key={idx} style={{ backgroundColor: "#F9FAFB", padding: 15, borderRadius: 8, marginBottom: 15, position: "relative" }}>
                        <button
                            onClick={() => removeTaraweeh(idx)}
                            style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}
                        >
                            <IoTrashOutline size={20} />
                        </button>
                        <h4 style={{ margin: "0 0 10px 0", fontSize: 14, color: "#4B5563" }}>Taraweeh #{idx + 1}</h4>

                        <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 14, color: "#374151", width: "35%" }}>Day of Ramadan</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    placeholder="e.g. 1"
                                    className="modal-input"
                                    style={{ margin: 0, padding: "8px", width: "60%" }}
                                    value={entry.startDate}
                                    onChange={(e) => updateTaraweeh(idx, "startDate", e.target.value)}
                                />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 14, color: "#374151", width: "30%" }}>Time</span>
                                <div style={{ width: "65%" }}>
                                    <CustomTimePicker
                                        value={entry.time}
                                        onChange={(val) => updateTaraweeh(idx, "time", val)}
                                        defaultPeriod="PM"
                                    />
                                </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 14, color: "#374151", width: "35%" }}>Parah</span>
                                <input
                                    type="text"
                                    placeholder="e.g. Parah 1 to 3"
                                    className="modal-input"
                                    style={{ margin: 0, padding: "8px", width: "60%" }}
                                    value={entry.parah}
                                    onChange={(e) => updateTaraweeh(idx, "parah", e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Events Builder Card */}
            <div id="events-schedule" className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
                    <h3 style={{ fontSize: 16, fontWeight: "bold", color: "#F59E0B", margin: 0 }}>Events</h3>
                    <button
                        onClick={addEvent}
                        style={{ color: "#F59E0B", background: "none", border: "none", display: "flex", alignItems: "center", gap: 5, fontWeight: "600", cursor: "pointer" }}
                    >
                        <IoAddCircleOutline size={18} /> Add
                    </button>
                </div>

                {events.length === 0 && (
                    <p style={{ color: "#6B7280", fontSize: 14, fontStyle: "italic", textAlign: "center", margin: "10px 0" }}>
                        No events added.
                    </p>
                )}

                {events.map((ev, idx) => (
                    <div key={idx} style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", padding: 20, borderRadius: 12, marginBottom: 20, position: "relative", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <button
                            onClick={() => removeEvent(idx)}
                            style={{ position: "absolute", top: 15, right: 15, background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", transition: "color 0.2s" }}
                            onMouseOver={(e) => e.currentTarget.style.color = "#EF4444"}
                            onMouseOut={(e) => e.currentTarget.style.color = "#9CA3AF"}
                        >
                            <IoTrashOutline size={22} />
                        </button>

                        {/* Title Input */}
                        <div style={{ marginBottom: 16, paddingRight: 40 }}>
                            <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: "500", display: "block" }}>Event Name</label>
                            <input
                                type="text"
                                placeholder={`Event Name ${idx + 1}`}
                                style={{
                                    width: "100%", border: "none", background: "transparent",
                                    fontSize: 22, fontWeight: "700", color: "#111827", padding: 2, outline: "none"
                                }}
                                value={ev.name}
                                onChange={(e) => updateEvent(idx, "name", e.target.value)}
                            />
                        </div>

                        {/* 1-Column Stacked Grid container */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", marginBottom: 16 }}>

                            {/* Row 2: Speaker */}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: "500" }}>Speaker</label>
                                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                    <IoPersonOutline style={{ position: "absolute", left: 12, color: "#9CA3AF" }} size={18} />
                                    <input
                                        type="text"
                                        placeholder="Optional"
                                        style={{
                                            width: "100%", padding: "10px 12px 10px 38px", boxSizing: "border-box",
                                            backgroundColor: "#F3F4F6", border: "1px solid transparent",
                                            borderRadius: 8, outline: "none", color: "#111827", fontSize: 14,
                                            transition: "border-color 0.2s"
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = "#10B981"}
                                        onBlur={(e) => e.target.style.borderColor = "transparent"}
                                        value={ev.speakerName}
                                        onChange={(e) => updateEvent(idx, "speakerName", e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Row 2: Frequency */}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: "500" }}>Frequency</label>
                                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                    <IoRepeatOutline style={{ position: "absolute", left: 12, color: "#9CA3AF", pointerEvents: "none" }} size={18} />
                                    <select
                                        style={{
                                            width: "100%", padding: "10px 12px 10px 38px", boxSizing: "border-box",
                                            backgroundColor: "#F3F4F6", border: "1px solid transparent",
                                            borderRadius: 8, outline: "none", color: "#111827", fontSize: 14,
                                            appearance: "none", transition: "border-color 0.2s"
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = "#10B981"}
                                        onBlur={(e) => e.target.style.borderColor = "transparent"}
                                        value={ev.frequency}
                                        onChange={(e) => updateEvent(idx, "frequency", e.target.value)}
                                    >
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="yearly">Yearly</option>
                                    </select>
                                </div>
                            </div>

                            {/* Row 3: Day/Date/Month */}
                            {ev.frequency === "weekly" && (
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                    <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: "500" }}>Day of Week</label>
                                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                        <IoCalendarOutline style={{ position: "absolute", left: 12, color: "#9CA3AF", pointerEvents: "none" }} size={18} />
                                        <select
                                            style={{
                                                width: "100%", padding: "10px 12px 10px 38px", boxSizing: "border-box",
                                                backgroundColor: "#F3F4F6", border: "1px solid transparent",
                                                borderRadius: 8, outline: "none", color: "#111827", fontSize: 14,
                                                appearance: "none", transition: "border-color 0.2s"
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = "#10B981"}
                                            onBlur={(e) => e.target.style.borderColor = "transparent"}
                                            value={ev.dateInfo}
                                            onChange={(e) => updateEvent(idx, "dateInfo", e.target.value)}
                                        >
                                            <option value="">Select Day</option>
                                            <option value="Monday">Monday</option>
                                            <option value="Tuesday">Tuesday</option>
                                            <option value="Wednesday">Wednesday</option>
                                            <option value="Thursday">Thursday</option>
                                            <option value="Friday">Friday</option>
                                            <option value="Saturday">Saturday</option>
                                            <option value="Sunday">Sunday</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                            {ev.frequency === "monthly" && (
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                    <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: "500" }}>Date</label>
                                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                        <IoCalendarOutline style={{ position: "absolute", left: 12, color: "#9CA3AF" }} size={18} />
                                        <input
                                            type="number"
                                            min="1" max="31"
                                            placeholder="e.g. 15"
                                            style={{
                                                width: "100%", padding: "10px 12px 10px 38px", boxSizing: "border-box",
                                                backgroundColor: "#F3F4F6", border: "1px solid transparent",
                                                borderRadius: 8, outline: "none", color: "#111827", fontSize: 14,
                                                transition: "border-color 0.2s"
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = "#10B981"}
                                            onBlur={(e) => e.target.style.borderColor = "transparent"}
                                            value={ev.dateInfo}
                                            onChange={(e) => updateEvent(idx, "dateInfo", e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                            {ev.frequency === "yearly" && (
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                    <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: "500" }}>Date & Month</label>
                                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                        <IoCalendarOutline style={{ position: "absolute", left: 12, color: "#9CA3AF" }} size={18} />
                                        <input
                                            type="text"
                                            placeholder="e.g. 10th Muharram"
                                            style={{
                                                width: "100%", padding: "10px 12px 10px 38px", boxSizing: "border-box",
                                                backgroundColor: "#F3F4F6", border: "1px solid transparent",
                                                borderRadius: 8, outline: "none", color: "#111827", fontSize: 14,
                                                transition: "border-color 0.2s"
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = "#10B981"}
                                            onBlur={(e) => e.target.style.borderColor = "transparent"}
                                            value={ev.dateInfo}
                                            onChange={(e) => updateEvent(idx, "dateInfo", e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Row 4: Time */}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: "500" }}>Time</label>
                                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                    <IoTimeOutline style={{ position: "absolute", left: 12, color: "#9CA3AF" }} size={18} />
                                    <div style={{ width: "100%", paddingLeft: "38px" }}>
                                        <CustomTimePicker
                                            value={ev.time}
                                            onChange={(val) => updateEvent(idx, "time", val)}
                                            defaultPeriod="PM"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Row 5: Description */}
                            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                                <label style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: "500" }}>Description</label>
                                <textarea
                                    placeholder="Brief details about the event..."
                                    style={{
                                        width: "100%", padding: "12px", boxSizing: "border-box",
                                        backgroundColor: "#F3F4F6", border: "1px solid transparent",
                                        borderRadius: 8, outline: "none", color: "#111827", fontSize: 14,
                                        minHeight: "80px", resize: "vertical", fontFamily: "inherit",
                                        transition: "border-color 0.2s"
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = "#10B981"}
                                    onBlur={(e) => e.target.style.borderColor = "transparent"}
                                    value={ev.description}
                                    onChange={(e) => updateEvent(idx, "description", e.target.value)}
                                />
                            </div>

                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Save Button */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                <button
                    onClick={handleUpdate}
                    disabled={loading}
                    style={{
                        backgroundColor: "#10B981", color: "#FFF", width: "100%",
                        border: "none", borderRadius: "12px",
                        padding: "16px", fontSize: "16px", fontWeight: "600",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        opacity: loading ? 0.7 : 1, boxShadow: "0 4px 6px -1px rgba(16, 185, 129, 0.2)"
                    }}
                >
                    {loading ? (
                        <>
                            <div style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
                            Saving...
                        </>
                    ) : (
                        <>Save All Changes <IoSaveOutline size={20} /></>
                    )}
                </button>
            </div>
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>

            {/* Report Section */}
            <div style={{ marginTop: 30, padding: "20px 0", borderTop: "2px solid #E5E7EB" }}>
                <h3 style={{ fontSize: 16, fontWeight: "700", color: "#6B7280", marginBottom: 12 }}>Something wrong with this masjid?</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                        onClick={() => openReportModal('location_change')}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#F59E0B", color: "white", border: "none", padding: "14px", borderRadius: "12px", fontSize: "15px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(245, 158, 11, 0.3)" }}
                    >
                        <IoLocationOutline size={20} />Report Location Change
                    </button>

                    <button
                        onClick={() => openReportModal('does_not_exist')}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", color: "white", border: "none", padding: "14px", borderRadius: "12px", fontSize: "15px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(239, 68, 68, 0.3)" }}
                    >
                        <IoWarningOutline size={20} />Masjid Does Not Exist Here
                    </button>
                </div>
            </div>

            {/* Report Modal */}
            {showReportModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto", position: "relative" }}>
                        <button onClick={() => setShowReportModal(false)} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer" }}>
                            <IoCloseCircleOutline size={28} color="#9CA3AF" />
                        </button>

                        <h3 style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}>
                            {reportType === 'location_change' ? '📍 Report Location Change' : '⚠️ Masjid Does Not Exist'}
                        </h3>
                        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20, lineHeight: 1.5 }}>
                            {reportType === 'location_change'
                                ? `Tap the map or use GPS to select the correct location of "${masjid.details?.name || 'this masjid'}".`
                                : `Report that "${masjid.details?.name || 'this masjid'}" no longer exists at this location. Please take a photo as proof.`}
                        </p>

                        {/* Map for location_change */}
                        {reportType === 'location_change' && (
                            <div style={{ marginBottom: 15 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                    <label style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Tap map or use GPS:</label>
                                    <button
                                        onClick={getCurrentLocationForReport}
                                        disabled={isLocatingReport}
                                        style={{ display: "flex", alignItems: "center", gap: 4, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: "600", color: "#065F46", cursor: isLocatingReport ? "wait" : "pointer" }}
                                    >
                                        {isLocatingReport ? (
                                            <><IoSync size={14} style={{ animation: "spin 1s linear infinite" }} /> Locating...</>
                                        ) : (
                                            <><IoLocateOutline size={14} /> Current Location</>
                                        )}
                                    </button>
                                </div>
                                <div style={{ height: 200, borderRadius: 12, overflow: "hidden", border: "1px solid #E5E7EB" }}>
                                    <MapContainer
                                        center={[newLocation.lat || 17.385, newLocation.lng || 78.487]}
                                        zoom={16}
                                        style={{ height: "100%", width: "100%" }}
                                    >
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                        <ReportMapClickHandler onMapClick={(latlng) => setNewLocation({ lat: latlng.lat, lng: latlng.lng })} />
                                        {newLocation.lat && <Marker position={[newLocation.lat, newLocation.lng]} />}
                                        <ReportChangeView center={[newLocation.lat || 17.385, newLocation.lng || 78.487]} />
                                    </MapContainer>

                                    {/* NEW: Current Location Button for Verification */}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                const pos = await getUserLocation();
                                                setNewLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                                            } catch (err) {
                                                alert("Could not fetch location. Please ensure location services are enabled.");
                                            }
                                        }}
                                        style={{
                                            position: "absolute", bottom: 10, right: 10, zIndex: 1000,
                                            background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8,
                                            padding: "6px 10px", boxShadow: "0 2px 5px rgba(0,0,0,0.15)",
                                            fontSize: 12, fontWeight: "600", color: "#111827", cursor: "pointer",
                                            display: "flex", alignItems: "center", gap: 6
                                        }}
                                    >
                                        📍 Current Location
                                    </button>
                                </div>
                                {newLocation.lat && (
                                    <p style={{ fontSize: 12, color: "#10B981", fontWeight: "600", marginTop: 6 }}>
                                        📍 New: {newLocation.lat.toFixed(6)}, {newLocation.lng.toFixed(6)}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Image capture */}
                        <div style={{ marginBottom: 15 }}>
                            <label style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8, display: "block" }}>
                                📷 Take/Select Photo (Required):
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        setReportImage(file);
                                        setReportImagePreview(URL.createObjectURL(file));
                                    }
                                }}
                                style={{ display: "none" }}
                            />
                            <input
                                ref={reportCameraRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        setReportImage(file);
                                        setReportImagePreview(URL.createObjectURL(file));
                                    }
                                }}
                                style={{ display: "none" }}
                            />
                            <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                                <button
                                    onClick={() => reportCameraRef.current?.click()}
                                    style={{ flex: 1, padding: "12px", border: "2px dashed #D1D5DB", borderRadius: 10, background: "#F9FAFB", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: "600", color: "#6B7280" }}
                                >
                                    <IoCameraOutline size={24} />
                                    Take Photo
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ flex: 1, padding: "12px", border: "2px dashed #D1D5DB", borderRadius: 10, background: "#F9FAFB", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: "600", color: "#6B7280" }}
                                >
                                    <span style={{fontSize:"24px"}}>🖼️</span>
                                    From Gallery
                                </button>
                            </div>
                            {reportImagePreview && (
                                <img src={reportImagePreview} alt="Preview" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 10, marginTop: 10, border: "1px solid #E5E7EB" }} />
                            )}
                        </div>

                        {/* Mobile Number (mandatory) */}
                        <div style={{ marginBottom: 15 }}>
                            <label style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, display: "block" }}>
                                📱 Your Mobile Number (Required):
                            </label>
                            <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 8, lineHeight: 1.4 }}>
                                Our team will contact you to verify this report.
                            </p>
                            <input
                                type="tel"
                                placeholder="Enter your mobile number"
                                value={reportPhone}
                                onChange={(e) => setReportPhone(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                            />
                        </div>

                        {/* Submit */}
                        <button
                            onClick={handleSubmitReport}
                            disabled={submittingReport}
                            style={{
                                width: "100%", padding: "14px", borderRadius: 12,
                                background: reportType === 'location_change' ? "#F59E0B" : "#EF4444",
                                color: "white", fontWeight: "700", fontSize: 15, border: "none",
                                cursor: submittingReport ? "not-allowed" : "pointer",
                                opacity: submittingReport ? 0.7 : 1
                            }}
                        >
                            {submittingReport ? "Submitting..." : "Submit Report"}
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
