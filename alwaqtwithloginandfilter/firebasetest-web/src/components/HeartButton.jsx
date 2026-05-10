import React, { useState } from "react";
import { IoHeart, IoHeartOutline } from "react-icons/io5";
import { updateUserDetails } from "../api/userupdate";

export default function HeartButton({ masjidid, initialFavorited = false }) {
    const [isFavorited, setIsFavorited] = useState(initialFavorited);
    const [loading, setLoading] = useState(false);

    const handlePress = async (e) => {
        e.stopPropagation(); // prevent navigation if placed inside a card
        setLoading(true);

        try {
            let userData = localStorage.getItem("@user");
            if (!userData) {
                alert("Please login to add favorites.");
                setLoading(false);
                return;
            }

            userData = JSON.parse(userData);

            // Update favorites list
            const updates = { favorites: [masjidid] };
            await updateUserDetails(userData.userid || userData.id, updates);

            setIsFavorited(!isFavorited);
            alert(isFavorited ? "Unfollowed masjid" : "Following masjid");
        } catch (err) {
            console.error(err);
            alert("Failed to update user details.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handlePress}
            disabled={loading}
            style={{
                backgroundColor: isFavorited ? "#ECFDF5" : "#10B981",
                color: isFavorited ? "#10B981" : "#FFFFFF",
                border: isFavorited ? "1px solid #10B981" : "none",
                borderRadius: "20px",
                cursor: "pointer",
                padding: "6px 16px",
                fontSize: "14px",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isFavorited ? "none" : "0 2px 4px rgba(16, 185, 129, 0.2)"
            }}
        >
            {isFavorited ? "Following" : "Follow"}
        </button>
    );
}
