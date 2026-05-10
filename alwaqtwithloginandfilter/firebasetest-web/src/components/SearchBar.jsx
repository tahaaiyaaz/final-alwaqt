import React, { useState, useCallback, useEffect, useRef } from "react";
import { IoSearch, IoLocationOutline, IoCloseCircle, IoChevronDownOutline, IoLocationSharp } from "react-icons/io5";
import { MdMyLocation } from "react-icons/md";
import debounce from "lodash.debounce";
import { API_BASE } from "../config";

export default function SearchBar({ setSendCoords, defaultLocationText, defaultLocationCoords, requestCurrentLocation, isHeader, onSelectOnMap }) {
    const [isFocused, setIsFocused] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLocating, setIsLocating] = useState(false);

    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    // Update query when the prop changes
    useEffect(() => {
        if (defaultLocationText && !isFocused) {
            setQuery(defaultLocationText);
        }
    }, [defaultLocationText, isFocused]);

    // Close the dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsFocused(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchResults = useCallback(
        debounce(async (text, baseCoords) => {
            if (!text || text.length < 2) {
                setResults([]);
                setIsSearching(false);
                return;
            }
            setIsSearching(true);
            try {
                let url = `${API_BASE}/api/autocomplete?input=${encodeURIComponent(text)}`;
                if (baseCoords && baseCoords.lat && baseCoords.lng) {
                    url += `&lat=${baseCoords.lat}&lng=${baseCoords.lng}`;
                }
                const response = await fetch(url);
                const data = await response.json();
                setResults(data.predictions || data.results || []);
            } catch (err) {
                console.error("Search error:", err);
            } finally {
                setIsSearching(false);
            }
        }, 300),
        []
    );

    const handleSelect = (item) => {
        if (item.isCurrentLocation) {
            setIsLocating(true);
            if (requestCurrentLocation) {
                requestCurrentLocation();
            }
            // Add a small delay so the user sees the "Locating..." text before the dropdown closes
            setTimeout(() => {
                setIsLocating(false);
                setIsFocused(false);
            }, 800);
            return;
        }

        let lat, lng, text;

        if (item.isPopular) {
            lat = item.lat;
            lng = item.lng;
            text = item.name;
        } else {
            lat = item.geometry?.location?.lat;
            lng = item.geometry?.location?.lng;
            text = item.description || item.structured_formatting?.main_text || item.name || "";
        }

        if (lat && lng) {
            setSendCoords({ lat, lng });
            // User requested: "if it is selected location then this should be just place holder not the value of this input"
            // We clear the query so the input is empty, but the placeholder shows the selected location
        }

        setIsFocused(false);
        setQuery("");
        setResults([]);
    };

    const popularLocations = [
        { name: "Kerala", isPopular: true, lat: 10.8505, lng: 76.2711 },
        { name: "Tamil Nadu", isPopular: true, lat: 11.1271, lng: 78.6569 },
        { name: "Punjab", isPopular: true, lat: 31.1471, lng: 75.3412 },
        { name: "Maharashtra", isPopular: true, lat: 19.7515, lng: 75.7139 }
    ];

    return (
        <div ref={wrapperRef} style={{ position: "relative", width: "100%", fontFamily: "'Inter', sans-serif" }}>

            {/* Input Field */}
            <div style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                backgroundColor: isHeader ? "#F3F4F6" : "#fff",
                border: isHeader ? "1px solid transparent" : (isFocused ? "1px solid #2563EB" : "1px solid #E5E7EB"),
                borderRadius: 30, padding: "12px 18px",
                boxShadow: isHeader ? "none" : (isFocused ? "0 4px 12px rgba(37, 99, 235, 0.15)" : "0 2px 4px rgba(0,0,0,0.02)"),
                transition: "all 0.2s"
            }}>
                <IoLocationOutline size={22} color={isFocused ? "#2563EB" : "#3B82F6"} />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder={defaultLocationText || "Search city, area or loc..."}
                    value={query}
                    onFocus={() => {
                        setIsFocused(true);
                    }}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        fetchResults(e.target.value, defaultLocationCoords);
                    }}
                    style={{
                        flex: 1, border: "none", outline: "none", fontSize: 16,
                        color: "#111827", fontWeight: "400", background: "transparent"
                    }}
                />
                {query && isFocused ? (
                    <IoCloseCircle
                        size={22}
                        color="#9CA3AF"
                        style={{ cursor: "pointer" }}
                        onClick={() => { setQuery(""); inputRef.current?.focus(); setResults([]); }}
                    />
                ) : (
                    <IoChevronDownOutline size={20} color="#9CA3AF" style={{ cursor: "pointer" }} onClick={() => setIsFocused(true)} />
                )}
            </div>

            {/* Dropdown Options */}
            {isFocused && (
                <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8,
                    backgroundColor: "#fff", borderRadius: 12, border: "1px solid #E5E7EB",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.1)", zIndex: 1000,
                    overflow: "hidden", maxHeight: 350, display: "flex", flexDirection: "column"
                }}>
                    <div style={{ overflowY: "auto", flex: 1 }}>
                        {/* Use Current Location */}
                        <div
                            onClick={() => {
                                if (!isLocating) handleSelect({ isCurrentLocation: true });
                            }}
                            style={{
                                display: "flex", alignItems: "flex-start", gap: 12, padding: "16px",
                                cursor: isLocating ? "wait" : "pointer", borderBottom: "1px solid #f3f4f6",
                                transition: "background-color 0.15s",
                                opacity: isLocating ? 0.7 : 1
                            }}
                            onMouseEnter={(e) => { if (!isLocating) e.currentTarget.style.backgroundColor = "#F8FAFC" }}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                            <MdMyLocation size={24} color="#3B82F6" style={{ marginTop: 2 }} />
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontSize: 16, fontWeight: "600", color: "#3B82F6" }}>
                                    {isLocating ? "Locating..." : "Use current location"}
                                </span>
                                <span style={{ fontSize: 14, color: "#6B7280", marginTop: 2 }}>
                                    {isLocating ? "Please wait while we fetch your location" : "Tap to fetch your exact location"}
                                </span>
                            </div>
                        </div>

                        {!query || query.length < 2 ? (
                            /* Default View: Popular Locations */
                            <div style={{ paddingBottom: 8 }}>
                                <div style={{ padding: "16px 16px 8px 16px", fontSize: 13, fontWeight: "600", color: "#9CA3AF", letterSpacing: "0.5px" }}>
                                    POPULAR LOCATIONS
                                </div>
                                {popularLocations.map((item, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleSelect(item)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 14,
                                            padding: "14px 16px", cursor: "pointer",
                                            transition: "background-color 0.1s"
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F9FAFB"}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                    >
                                        <IoLocationOutline size={22} color="#6B7280" />
                                        <span style={{ fontSize: 16, color: "#111827", fontWeight: "400" }}>
                                            {item.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : isSearching ? (
                            <div style={{ padding: "20px", textAlign: "center", color: "#6B7280", fontSize: 15 }}>
                                Searching...
                            </div>
                        ) : (
                            /* Autocomplete Suggestions */
                            <div style={{ paddingBottom: 8 }}>
                                {results.length === 0 ? (
                                    <div style={{ padding: "20px", textAlign: "center", color: "#6B7280", fontSize: 15 }}>
                                        No results found
                                    </div>
                                ) : undefined}
                                {results.map((item, idx) => {
                                    const mainText = item.structured_formatting?.main_text || item.name || item.description?.split(",")[0] || "";
                                    const subText = item.structured_formatting?.secondary_text || item.description || "";

                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelect(item)}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 14,
                                                padding: "14px 16px", cursor: "pointer", borderBottom: "1px solid #F9FAFB",
                                                transition: "background-color 0.1s"
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F9FAFB"}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", flexShrink: 0 }}>
                                                <IoLocationSharp size={20} color="#6B7280" />
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                                <span style={{ fontSize: 16, fontWeight: "500", color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {mainText}
                                                </span>
                                                {subText && subText !== mainText && (
                                                    <span style={{ fontSize: 14, color: "#6B7280", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        {subText}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Select on Map Option */}
                        {onSelectOnMap && (
                            <div
                                onClick={() => {
                                    setIsFocused(false);
                                    setQuery("");
                                    setResults([]);
                                    onSelectOnMap();
                                }}
                                style={{
                                    display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                                    cursor: "pointer", borderTop: "1px solid #E5E7EB",
                                    transition: "background-color 0.15s", backgroundColor: "#F0FDF4"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#DCFCE7"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#F0FDF4"}
                            >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 18, backgroundColor: "#D1FAE5", flexShrink: 0 }}>
                                    <IoLocationSharp size={20} color="#10B981" />
                                </div>
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                    <span style={{ fontSize: 15, fontWeight: "600", color: "#059669" }}>Select on Map</span>
                                    <span style={{ fontSize: 13, color: "#6B7280", marginTop: 1 }}>Tap a location on the map to search</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
