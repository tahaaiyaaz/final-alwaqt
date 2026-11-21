import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';

import { IoLogoGoogle } from "react-icons/io5";
import { API_BASE } from "../config";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth, firebaseSignOut, getBearerToken } from "../firebaseConfig";

export default function AccountsPage() {
    const [user, setUser] = useState(null);
    const [mobileNumber, setMobileNumber] = useState("");
    const [userType, setUserType] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Initialize Google Auth (required on ALL platforms)
        GoogleAuth.initialize({
            clientId: '475951667280-nc58b2tqb3rr5f2fc6hcamdnlhlq18id.apps.googleusercontent.com',
            scopes: ['profile', 'email'],
            grantOfflineAccess: true,
        });

        // Check localStorage for existing session & sync role
        const stored = localStorage.getItem("@user");
        if (stored) {
            const parsed = JSON.parse(stored);
            setUser(parsed);
            (async () => {
                try {
                    const token = await getBearerToken();
                    if (token) {
                        const res = await fetch(`${API_BASE}/api/user/me`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (data?.userdata) {
                                localStorage.setItem("@user", JSON.stringify(data.userdata));
                                setUser(data.userdata);
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Could not sync user role:", e);
                }
            })();
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
                const googleIdToken = result.authentication?.idToken || result.idToken;
                let firebaseUid = result.id;
                let bearerToken = null;

                // Connect Google credentials to Firebase to obtain genuine Firebase Bearer ID Token
                if (googleIdToken) {
                    try {
                        const credential = GoogleAuthProvider.credential(googleIdToken);
                        const userCred = await signInWithCredential(auth, credential);
                        firebaseUid = userCred.user.uid;
                        bearerToken = await userCred.user.getIdToken();
                    } catch (fbErr) {
                        console.warn("Firebase credential sign-in note:", fbErr);
                        // Fallback: use the Google ID token itself
                        bearerToken = googleIdToken;
                    }
                }

                if (bearerToken) {
                    localStorage.setItem("@authToken", bearerToken);
                }

                const appUser = {
                    id: firebaseUid || result.id || "google-user",
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
            await firebaseSignOut();
        } catch (fbErr) {
            console.warn("Firebase sign-out note:", fbErr);
        }
        try {
            await GoogleAuth.signOut();
        } catch (err) {
            console.error("Sign-out error (ignoring):", err);
        }
        localStorage.removeItem("@user");
        localStorage.removeItem("@authToken");
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
        <div className="safe-page-container">
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
                {user.isAdmin && (
                    <>
                        <div className="divider" />
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", backgroundColor: "#ECFDF5", borderRadius: 10, border: "1px solid #A7F3D0" }}>
                            <span style={{ fontSize: 20 }}>🛡️</span>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#065F46", textTransform: "uppercase", letterSpacing: "0.5px" }}>Role</span>
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#047857" }}>System Administrator</p>
                            </div>
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
