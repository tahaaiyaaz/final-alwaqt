import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IoMoon, IoChevronForward, IoArrowBack, IoLocationOutline, IoTimeOutline, IoAddCircleOutline } from "react-icons/io5";

function toPascalCase(str) {
    if (!str) return "Unknown Masjid";
    return str
        .split(/([ -])/g)
        .map((word) =>
            word.match(/[a-zA-Z]/)
                ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                : word
        )
        .join("");
}

export default function MasjidList() {
    const { state } = useLocation();
    const navigate = useNavigate();
    const rawData = state?.masjids || [];
    const title = state?.title || "All Masjids";
    const sortType = state?.sortType || "distance"; // distance, earliest, late

    // Apply sorting logic
    const masjidData = [...rawData].sort((a, b) => {
        if (sortType === "distance") {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        } else if (sortType === "earliest") {
            const aTime = a.targetPrayerMins ?? 9999;
            const bTime = b.targetPrayerMins ?? 9999;
            if (aTime === bTime) return (a.distance || 0) - (b.distance || 0);
            return aTime - bTime;
        } else if (sortType === "late") {
            const aTime = a.targetPrayerMins ?? -1;
            const bTime = b.targetPrayerMins ?? -1;
            if (aTime === bTime) return (a.distance || 0) - (b.distance || 0);
            return bTime - aTime;
        }
        return 0;
    });

    return (
        <div style={{ padding: 20 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <button className="btn-back" onClick={() => navigate(-1)} style={{ marginRight: 15, marginBottom: 0 }}>
                        <IoArrowBack />
                    </button>
                    <h2 style={{ fontSize: 22, fontWeight: "bold", color: "#111827", margin: 0 }}>{title}</h2>
                </div>
            </div>

            {masjidData.length === 0 ? (
                <div className="empty-state"><p>No masjids found.</p></div>
            ) : (
                masjidData.map((item, idx) => (
                    <div
                        key={item.id || idx}
                        className="card"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            padding: 15,
                            marginBottom: 12,
                            cursor: "pointer"
                        }}
                        onClick={() => navigate("/about-masjid", { state: { masjid: item } })}
                    >
                        <div style={{
                            width: 50, height: 50, borderRadius: 25, backgroundColor: "#D1FAE5",
                            display: "flex", alignItems: "center", justifyContent: "center", marginRight: 15
                        }}>
                            <IoMoon size={24} color="#10B981" />
                        </div>

                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
                                {toPascalCase(item.details?.name)}
                            </h3>
                            <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                                {item.details?.addressLine1 || "No address provided"}
                            </p>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                {item.distanceText && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#10B981", fontWeight: "600" }}>
                                        <IoLocationOutline size={14} /> {item.distanceText}
                                    </div>
                                )}
                                {item.targetPrayerTimeStr && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4B5563", background: "#F3F4F6", padding: "2px 8px", borderRadius: 6 }}>
                                        <IoTimeOutline size={14} /> {item.targetPrayerTimeStr}
                                    </div>
                                )}
                            </div>
                        </div>

                        <IoChevronForward size={20} color="#9CA3AF" />
                    </div>
                ))
            )}

            {/* Add Masjid Button at the bottom */}
            <div style={{ padding: "20px 0 40px", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 12 }}>Can't find your masjid?</p>
                <button
                    onClick={() => navigate("/add-masjid")}
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        backgroundColor: "#10B981", color: "#fff", border: "none",
                        padding: "14px 28px", borderRadius: 12, fontSize: 15,
                        fontWeight: "700", cursor: "pointer",
                        boxShadow: "0 4px 6px rgba(16, 185, 129, 0.3)"
                    }}
                >
                    <IoAddCircleOutline size={20} /> Add New Masjid
                </button>
            </div>
        </div>
    );
}
