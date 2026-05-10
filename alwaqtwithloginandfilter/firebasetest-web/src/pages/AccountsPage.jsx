import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';

import { IoLogoGoogle } from "react-icons/io5";
import { API_BASE } from "../config";

export default function AccountsPage() {
    const [user, setUser] = useState(null);
    const [mobileNumber, setMobileNumber] = useState("");
    const [userType, setUserType] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Initialize Google Auth (required on ALL platforms)
        GoogleAuth.initialize({
            clientId: '1019099666555-3l4avatplemsa5drh2a0o7gnob0i3a0s.apps.googleusercontent.com',
            scopes: ['profile', 'email'],
            grantOfflineAccess: true,
        });

        // Check localStorage for existing session
        const stored = localStorage.getItem("@user");
        if (stored) {
            setUser(JSON.parse(stored));
        }
    }, []);

    const signupWithMobile = async (userinfo) => {
        try {
            const res = await fetch(`${API_BASE}/signupwithmobile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: { uid: userinfo.id, name: userinfo.name, email: userinfo.email },
                }),
            });
            const data = await res.json();
            if (data.userdata) {
                localStorage.setItem("@user", JSON.stringify(data.userdata));
                setUser(data.userdata);
                
                // First-time Verification Prompt routing
                if (!localStorage.getItem("hasSeenVerificationPrompt")) {
                    localStorage.setItem("hasSeenVerificationPrompt", "true");
                    navigate("/verification-prompt");
                } else if (data.userdata.userType === "Muazzin") {
                    navigate("/muezzin");
                }
            }
        } catch (err) {
            console.error("Signup error:", err);
        }
    };

    const handleSignIn = async () => {
        setLoading(true);
        try {
            const result = await GoogleAuth.signIn();

            if (result) {
                const appUser = {
                    id: result.id || result.authentication?.idToken,
                    name: result.name || result.displayName || "Google User",
                    email: result.email,
                };
                localStorage.setItem("@user", JSON.stringify(appUser));
                setUser(appUser);
                await signupWithMobile(appUser);
            }
        } catch (err) {
            console.error("Google Sign-In Error:", err);
            // If the user simply closed the popup, error might be generic. Let's not alert aggressively unless unexpected.
            if (err?.error !== "popup_closed_by_user" && err?.type !== "user_cancelled") {
                alert("Google Sign-In Failed: " + (err.message || JSON.stringify(err)));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await GoogleAuth.signOut();
        } catch (err) {
            console.error("Sign-out error (ignoring):", err);
        }
        localStorage.removeItem("@user");
        setUser(null);
    };


    if (!user) {
        return (
            <div className="centered-container">
                <h2 style={{ fontSize: 22, fontWeight: "bold", color: "#111827" }}>No user is logged in.</h2>
                <button className="btn-primary" onClick={handleSignIn} disabled={loading}>
                    {loading ? <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : (
                        <>
                            <IoLogoGoogle size={20} />
                            Sign in with Google
                        </>
                    )}
                </button>
            </div>
        );
    }

    return (
        <div style={{ padding: 20 }}>
            <div className="card">
                <h2 style={{ fontSize: 22, fontWeight: "bold", color: "#10B981", textAlign: "center", marginBottom: 20 }}>
                    Account Details
                </h2>
                <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>Name</span>
                    <p style={{ fontSize: 16, fontWeight: 600 }}>{user.name || "N/A"}</p>
                </div>
                <div className="divider" />
                <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>Email</span>
                    <p style={{ fontSize: 16, fontWeight: 600 }}>{user.email}</p>
                </div>
                {user.mobileNumber && (
                    <>
                        <div className="divider" />
                        <div>
                            <span style={{ fontSize: 12, color: "#6B7280" }}>Mobile</span>
                            <p style={{ fontSize: 16, fontWeight: 600 }}>{user.mobileNumber}</p>
                        </div>
                    </>
                )}
            </div>

            {/* 
            {(!user.mobileNumber || !user.userType) && (
                <div className="card">
                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 15 }}>Complete Profile</h3>
                    <label className="form-label">Mobile Number</label>
                    <input
                        className="form-input"
                        placeholder="Enter Mobile Number"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        type="tel"
                        style={{ marginBottom: 15 }}
                    />
                    <label className="form-label">Account Type</label>
                    <select
                        className="form-select"
                        value={userType}
                        onChange={(e) => setUserType(e.target.value)}
                        style={{ marginBottom: 20 }}
                    >
                        <option value="">Select User Type</option>
                        <option value="Muazzin">Muazzin</option>
                        <option value="Not Muazzin">Not Muazzin</option>
                    </select>
                    <button className="btn-primary" onClick={() => {}} style={{ width: "100%" }}>
                        Update Details
                    </button>
                </div>
            )}
            */}

            <button className="btn-danger" onClick={handleSignOut} style={{ width: "100%" }}>
                Sign Out
            </button>
        </div>
    );
}
