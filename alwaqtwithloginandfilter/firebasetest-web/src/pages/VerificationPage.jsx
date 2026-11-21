import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IoArrowBack, IoCheckmarkCircle, IoCloseCircle, IoHelpCircle } from "react-icons/io5";
import { MapContainer, TileLayer, Marker, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { API_BASE } from "../config";
import { getBearerToken } from "../firebaseConfig";

// Custom Leaflet Icons for Old (Blue) and New (Red/Amber)
const oldPosIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const newPosIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Component to adjust map bounds to fit both markers
function FitBounds({ bounds }) {
    const map = useMap();
    if (bounds && bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30] });
    }
    return null;
}

export default function VerificationPage() {
    const location = useLocation();
    const navigate = useNavigate();

    // The item context (new masjid or report) passed from HomePage
    const item = location.state?.item;

    const [verificationPhone, setVerificationPhone] = useState("");
    const [verificationDescription, setVerificationDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [user] = useState(() => JSON.parse(localStorage.getItem("@user") || "null"));
    const isAdmin = Boolean(user?.isAdmin || item?.isAdminReview);

    if (!item) {
        return (
            <div style={{ padding: 20, textAlign: "center" }}>
                <h2>No Verification Data</h2>
                <button onClick={() => navigate("/")} style={{ background: "#4F46E5", color: "white", border: "none", padding: "10px 20px", borderRadius: 8 }}>Go Back</button>
            </div>
        );
    }

    const reportType = item.type === "new_masjid" ? "new_masjid" : item.report_type;

    // Helper to format Pascal Case
    const toPascalCase = (str) => {
        if (!str) return "";
        return str
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const handleAdminDecision = async (decision) => {
        setSubmitting(true);
        try {
            const token = await getBearerToken();
            const baseUrl = API_BASE || window.location.origin;
            const endpoint = decision === 'approve'
                ? `${baseUrl}/api/admin/approveMasjid`
                : `${baseUrl}/api/admin/rejectMasjid`;

            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { "Authorization": `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ masjidId: item.id })
            });

            const data = await res.json();
            if (res.ok) {
                // Save to localStorage so this item won't appear again for this user
                const existing = JSON.parse(localStorage.getItem('verified_masjids') || '[]');
                if (!existing.includes(item.id)) {
                    existing.push(item.id);
                    localStorage.setItem('verified_masjids', JSON.stringify(existing));
                }
                alert(decision === 'approve'
                    ? "Masjid has been approved and is now live on the map!"
                    : "Masjid submission has been rejected.");
                navigate("/", { replace: true });
            } else {
                alert(data.error || "Failed to process admin action.");
            }
        } catch (err) {
            console.error("Admin decision error:", err);
            alert("Network error processing admin action.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleVerify = async (decision) => {
        if (!verificationPhone || verificationPhone.length < 10) {
            alert("Please provide a valid 10-digit mobile number.");
            return;
        }

        setSubmitting(true);
        try {
            const baseUrl = API_BASE || window.location.origin;
            let endpoint, body;

            if (item.type === 'new_masjid') {
                endpoint = `${baseUrl}/api/verifyMasjid`;
                body = { masjidId: item.id, verifierPhone: verificationPhone, decision, description: verificationDescription };
            } else {
                endpoint = `${baseUrl}/api/verifyReport`;
                body = { reportId: item.id, verifierPhone: verificationPhone, decision, description: verificationDescription };
            }

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                // Save to localStorage so this item won't appear again for this user
                const storageKey = item.type === 'new_masjid' ? 'verified_masjids' : 'verified_reports';
                const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (!existing.includes(item.id)) {
                    existing.push(item.id);
                    localStorage.setItem(storageKey, JSON.stringify(existing));
                }
                alert("Thank you! Your verification feedback has been securely submitted.");
                navigate("/", { replace: true });
            } else {
                alert("Failed to submit verification. Please try again.");
            }
        } catch (err) {
            console.error("Error submitting verification:", err);
            alert("Network error occurred.");
        } finally {
            setSubmitting(false);
        }
    };

    let bounds = [];
    if (reportType === 'location_change' && item.original_lat && item.new_lat) {
        bounds = [
            [Number(item.original_lat), Number(item.original_lng)],
            [Number(item.new_lat), Number(item.new_lng)]
        ];
    }

    // Determine safe center point
    const centerLat = Number(item.latitude || item.original_lat || item.new_lat || 0);
    const centerLng = Number(item.longitude || item.original_lng || item.new_lng || 0);
    const mapCenter = [centerLat, centerLng];

    const hasValidCenter = centerLat !== 0 && centerLng !== 0;

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#F3F4F6", paddingBottom: 60, fontFamily: "'Inter', sans-serif" }}>
            {/* Header */}
            <div style={{ backgroundColor: "#111827", color: "white", padding: "calc(15px + var(--safe-area-top, 0px)) 20px 15px", display: "flex", alignItems: "center", gap: 15 }}>
                <IoArrowBack size={24} style={{ cursor: "pointer" }} onClick={() => navigate(-1)} />
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: "700" }}>{item.type === 'new_masjid' && isAdmin ? 'Admin Masjid Review' : 'Verify Community Report'}</h2>
            </div>

            <div style={{ padding: 20 }}>
                {/* Information Card */}
                <div style={{ backgroundColor: "white", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 20, fontWeight: "800", color: "#111827" }}>{toPascalCase(item.name)}</h3>
                        <span style={{
                            fontSize: 12, fontWeight: "700", padding: "4px 10px", borderRadius: 12,
                            backgroundColor: item.type === 'new_masjid' && isAdmin ? '#DCFCE7' : reportType === 'new_masjid' ? '#D1FAE5' : reportType === 'location_change' ? '#FEF3C7' : '#FEE2E2',
                            color: item.type === 'new_masjid' && isAdmin ? '#047857' : reportType === 'new_masjid' ? '#065F46' : reportType === 'location_change' ? '#92400E' : '#991B1B'
                        }}>
                            {item.type === 'new_masjid' && isAdmin ? '🛡️ Admin Review' : reportType === 'new_masjid' ? '🆕 New Masjid' : reportType === 'location_change' ? '📍 Location Change' : '❌ Not Found'}
                        </span>
                    </div>

                    <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5, marginBottom: 15 }}>
                        {reportType === 'new_masjid' && (isAdmin ? "As an administrator, review this newly added masjid and approve it to make it live on the map." : "A user has added this new masjid. Please verify if it exists at this location.")}
                        {reportType === 'location_change' && "A user reported that this masjid is located somewhere else. Please review the old and new locations."}
                        {reportType === 'does_not_exist' && "A user reported that this masjid no longer exists at this location."}
                    </p>

                    {/* Image Evidence */}
                    {item.image_url && (
                        <div style={{ marginBottom: 20 }}>
                            <p style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>📷 Reporter's Proof Photo:</p>
                            <img
                                src={`${API_BASE}${item.image_url}`}
                                alt="Evidence"
                                style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 12, border: "1px solid #E5E7EB" }}
                            />
                        </div>
                    )}

                    {/* Map UI */}
                    {hasValidCenter && (
                        <div style={{ height: 250, borderRadius: 12, overflow: "hidden", border: "1px solid #E5E7EB", marginBottom: 20 }}>
                            <MapContainer
                                center={mapCenter}
                                zoom={16}
                                style={{ height: "100%", width: "100%" }}
                            >
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                                {/* Standard single marker for New / Does Not Exist */}
                                {reportType !== 'location_change' && (
                                    <Marker position={mapCenter} icon={oldPosIcon} />
                                )}

                                {/* Dual Markers + Polyline for Location Change */}
                                {reportType === 'location_change' && item.original_lat && item.new_lat && (
                                    <>
                                        <Marker position={[Number(item.original_lat), Number(item.original_lng)]} icon={oldPosIcon} title="Old Location" />
                                        <Marker position={[Number(item.new_lat), Number(item.new_lng)]} icon={newPosIcon} title="New Location" />
                                        <Polyline positions={bounds} color="#6B7280" dashArray="5, 10" weight={2} />
                                        <FitBounds bounds={bounds} />
                                    </>
                                )}
                            </MapContainer>
                        </div>
                    )}

                    {/* Map Legend for Location Change */}
                    {reportType === 'location_change' && hasValidCenter && (
                        <div style={{ display: "flex", gap: 20, marginBottom: 15, padding: "10px 14px", backgroundColor: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#2A81CB", display: "inline-block" }}></span>
                                <span style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Old Location (Current)</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#CB2B3E", display: "inline-block" }}></span>
                                <span style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>New Location (Reported)</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Module */}
                {item.type === 'new_masjid' && isAdmin ? (
                    <div style={{ backgroundColor: "white", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                            <span style={{ fontSize: 24 }}>🛡️</span>
                            <div>
                                <h4 style={{ margin: 0, fontSize: 16, fontWeight: "700", color: "#111827" }}>Administrator Decision</h4>
                                <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>Your action directly publishes or rejects this masjid nationwide.</p>
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
                            <button
                                disabled={submitting}
                                onClick={() => handleAdminDecision('approve')}
                                style={{
                                    display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
                                    width: "100%", padding: "14px", borderRadius: 10,
                                    background: "#10B981", color: "white", fontWeight: "700", fontSize: 15, border: "none",
                                    cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1,
                                    boxShadow: "0 4px 12px rgba(16,185,129,0.25)"
                                }}
                            >
                                <IoCheckmarkCircle size={22} /> Approve Masjid (Make Live on Map)
                            </button>
                            <button
                                disabled={submitting}
                                onClick={() => handleAdminDecision('reject')}
                                style={{
                                    display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
                                    width: "100%", padding: "14px", borderRadius: 10,
                                    background: "#EF4444", color: "white", fontWeight: "600", fontSize: 14, border: "none",
                                    cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1
                                }}
                            >
                                <IoCloseCircle size={20} /> Reject Masjid Submission
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: "white", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                        <h4 style={{ margin: "0 0 15px 0", fontSize: 15, fontWeight: "700", color: "#111827" }}>Your Feedback</h4>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, display: "block" }}>
                                📱 Enter your mobile number to verify:
                            </label>
                            <input
                                type="tel"
                                placeholder="e.g. 9876543210"
                                value={verificationPhone}
                                onChange={(e) => setVerificationPhone(e.target.value)}
                                style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 15, outline: "none", boxSizing: "border-box", backgroundColor: "#F9FAFB", marginBottom: 15 }}
                            />

                            <label style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, display: "block" }}>
                                📝 Additional Comments (Optional):
                            </label>
                            <textarea
                                placeholder="Provide any extra context, describe the location, etc..."
                                value={verificationDescription}
                                onChange={(e) => setVerificationDescription(e.target.value)}
                                rows={3}
                                style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 14, outline: "none", boxSizing: "border-box", backgroundColor: "#F9FAFB", resize: "vertical" }}
                            />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {reportType === 'location_change' && (
                                <>
                                    <button disabled={submitting} onClick={() => handleVerify('approve_new')} style={actionBtnStyle("#10B981")}>
                                        <IoCheckmarkCircle size={20} /> Yes, the red pin (New Location) is correct
                                    </button>
                                    <button disabled={submitting} onClick={() => handleVerify('reject_new')} style={actionBtnStyle("#6B7280")}>
                                        <IoCloseCircle size={20} /> No, the blue pin (Old Location) is correct
                                    </button>
                                    <button disabled={submitting} onClick={() => handleVerify('does_not_exist')} style={actionBtnStyle("#EF4444")}>
                                        <IoHelpCircle size={20} /> Neither, the masjid does not exist
                                    </button>
                                </>
                            )}

                            {reportType === 'does_not_exist' && (
                                <>
                                    <button disabled={submitting} onClick={() => handleVerify('approve_not_exist')} style={actionBtnStyle("#EF4444")}>
                                        <IoCheckmarkCircle size={20} /> Yes, the masjid no longer exists
                                    </button>
                                    <button disabled={submitting} onClick={() => handleVerify('reject_not_exist')} style={actionBtnStyle("#10B981")}>
                                        <IoCloseCircle size={20} /> No, the masjid is still there
                                    </button>
                                </>
                            )}

                            {reportType === 'new_masjid' && (
                                <>
                                    <button disabled={submitting} onClick={() => handleVerify('approve_new_masjid')} style={actionBtnStyle("#10B981")}>
                                        <IoCheckmarkCircle size={20} /> Yes, this masjid exists here
                                    </button>
                                    <button disabled={submitting} onClick={() => handleVerify('reject_new_masjid')} style={actionBtnStyle("#EF4444")}>
                                        <IoCloseCircle size={20} /> No, this masjid does not exist
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const actionBtnStyle = (color) => ({
    display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
    width: "100%", padding: "14px", borderRadius: 10,
    background: color, color: "white", fontWeight: "600", fontSize: 14, border: "none",
    cursor: "pointer", transition: "opacity 0.2s", opacity: 0.95
});
