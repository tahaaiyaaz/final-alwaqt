import React from "react";
import { useNavigate } from "react-router-dom";

export default function WelcomePage() {
    const navigate = useNavigate();

    return (
        <div className="centered-container" style={{ backgroundColor: "#F3F4F6", justifyContent: "space-between", padding: "calc(40px + var(--safe-area-top, 0px)) 20px calc(40px + var(--safe-area-bottom, 0px))" }}>
            <div style={{ flex: 1 }} />

            <div style={{ textAlign: "center" }}>
                <img src="/alwqt_image.png" alt="Al Waqt Logo" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 20, marginBottom: 20 }} />
                <h1 style={{ fontSize: 42, fontWeight: "bold", color: "#10B981", marginBottom: 8 }}>Al Waqt</h1>
                <p style={{ fontSize: 16, color: "#6B7280" }}>Your Own Islamic Community App</p>
            </div>

            <div style={{ flex: 1 }} />

            <button
                className="btn-primary"
                style={{ width: "100%", padding: 18, borderRadius: 12, fontSize: 18, fontWeight: "bold" }}
                onClick={() => navigate("/")}
            >
                Let's Start
            </button>
        </div>
    );
}
