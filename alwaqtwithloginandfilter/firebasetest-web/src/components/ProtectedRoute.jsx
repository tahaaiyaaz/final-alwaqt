import React from "react";
import { Navigate, useLocation } from "react-router-dom";

/**
 * ProtectedRoute – wraps pages that require authentication.
 * If no user is stored in localStorage, redirect to /account.
 * During the app tour, auth checks are bypassed so the tour can show all pages.
 */
export default function ProtectedRoute({ children }) {
    const stored = localStorage.getItem("@user");
    const tourActive = !localStorage.getItem('hasSeenAppTour');
    const loc = useLocation();

    // During the tour, allow unauthenticated access
    if (tourActive) {
        return children;
    }

    // Prevent double-alert by tracking in sessionStorage
    const alertKey = `auth_alert_${loc.pathname}`;
    const showAlert = () => {
        if (!sessionStorage.getItem(alertKey)) {
            sessionStorage.setItem(alertKey, 'true');
            setTimeout(() => sessionStorage.removeItem(alertKey), 2000);
            alert("Please sign in to access this page.");
        }
    };

    if (!stored) {
        showAlert();
        return <Navigate to="/account" replace />;
    }

    // Validate the stored value is actually parseable JSON with an id
    try {
        const user = JSON.parse(stored);
        if (!user || !user.id) {
            showAlert();
            return <Navigate to="/account" replace />;
        }
    } catch {
        localStorage.removeItem("@user");
        showAlert();
        return <Navigate to="/account" replace />;
    }

    return children;
}
