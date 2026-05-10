import React from "react";
import { useNavigate } from "react-router-dom";
import { IoMoon, IoLocation, IoTime, IoCalendarOutline } from "react-icons/io5";

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

function formatDistance(d) {
    if (!d) return "---";
    if (typeof d === "string") return d;
    if (typeof d === "number") {
        return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
    }
    return "---";
}

export default function MasjidCard({
    MasjidName,
    MasjidDistance,
    NextNamazTime,
    masjid,
    showEvents = false,
    fullWidth = false,
}) {
    const navigate = useNavigate();
    const hasEvents = masjid?.details?.events?.length > 0;

    const isVerified = masjid?.isVerified !== false; // treat undefined/true as verified for backward compatibility

    return (
        <div
            className={`masjid-card${fullWidth ? " full-width" : ""}`}
            style={!isVerified ? { border: "1px solid #F59E0B", boxShadow: "0 2px 8px rgba(245, 158, 11, 0.15)" } : {}}
            onClick={() => navigate("/about-masjid", { state: { masjid } })}
        >
            <div className="masjid-card-content">
                <div className="masjid-card-icon">
                    <IoMoon size={24} color={!isVerified ? "#F59E0B" : "#10B981"} />
                </div>
                <div className="masjid-card-text">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <h3>{toPascalCase(MasjidName)}</h3>
                        {!isVerified && (
                            <span style={{ backgroundColor: "#FEF3C7", color: "#D97706", fontSize: "10px", padding: "2px 6px", borderRadius: "10px", fontWeight: "bold", whiteSpace: "nowrap", marginLeft: "8px" }}>
                                Yet to update
                            </span>
                        )}
                    </div>
                    <div className="masjid-card-badges">
                        {isVerified && (
                            <span className="badge badge-primary">
                                <IoLocation size={12} /> {formatDistance(MasjidDistance)}
                            </span>
                        )}
                        <span className="badge badge-accent">
                            <IoTime size={12} /> {NextNamazTime || "---"}
                        </span>
                    </div>
                </div>
            </div>

            {showEvents && hasEvents && (
                <div className="events-section">
                    <div className="divider" />
                    <div className="events-title">Upcoming Events</div>
                    {masjid.details.events.slice(0, 2).map((event, idx) => (
                        <div key={idx} className="event-item">
                            <IoCalendarOutline size={14} color="#6B7280" />
                            <span>
                                {event.name || event.title} - {event.date || event.time}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
