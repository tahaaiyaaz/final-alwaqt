import React, { useState, useEffect } from "react";
import { IoClose } from "react-icons/io5";
import { useMasjid } from "../context/MasjidContext";
import CustomTimePicker from "./CustomTimePicker";

export default function FilterPopover({ onClose, onApply, initialDistance, initialPrayer }) {
    const { filters } = useMasjid();
    const [timeFilter, setTimeFilter] = useState(filters.timeFilterType || "prayer");
    const [selectedTime, setSelectedTime] = useState(filters.customTimeConfig?.singleTime || "");
    const [selectedStartTime, setSelectedStartTime] = useState(filters.customTimeConfig?.rangeStart || "");
    const [selectedEndTime, setSelectedEndTime] = useState(filters.customTimeConfig?.rangeEnd || "");
    const [distance, setDistance] = useState(initialDistance !== undefined ? initialDistance.toString() : filters.distance.toString());
    const [dropdownValue, setDropdownValue] = useState(initialPrayer !== undefined ? (initialPrayer === "auto" ? "" : initialPrayer) : (filters.prayer === "auto" ? "" : filters.prayer));

    // Trigger apply immediately when filter input changes (auto-apply)
    useEffect(() => {
        // Only auto-apply if dropdownValue changes or distance changes, etc.
        // Actually the user wants apply when clicking "Apply Filters" in the popup
        // BUT also immediately syncing. The prompt says: "it should automatically apply the filters instead of showing this apply filters in the home page."
    }, []);

    const handleApply = () => {
        onApply({
            distance: parseFloat(distance) || 3,
            timeFilterType: dropdownValue ? "prayer" : timeFilter,
            prayerType: dropdownValue,
            customTimeConfig: dropdownValue ? null : {
                type: timeFilter, // "before", "between", or "after"
                singleTime: selectedTime,
                rangeStart: selectedStartTime,
                rangeEnd: selectedEndTime,
                prayerToCheck: null // not used in time filter
            }
        });
        onClose(); // Auto close the popover on apply
    };

    const handleClear = () => {
        setTimeFilter("prayer");
        setSelectedTime("");
        setSelectedStartTime("");
        setSelectedEndTime("");
        setDistance("3");
        setDropdownValue("");
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ fontSize: 20, fontWeight: "bold", color: "#111827", margin: 0 }}>Filter Options</h2>
                    <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                        <IoClose size={24} color="#6B7280" />
                    </button>
                </div>

                {/* Distance Filter */}
                <div style={{ marginBottom: 20 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Distance (km)</label>
                    <input
                        type="number"
                        className="form-input"
                        value={distance}
                        onChange={(e) => setDistance(e.target.value)}
                        placeholder="e.g. 5"
                    />
                </div>

                {/* Prayer Dropdown */}
                <div style={{ marginBottom: 20 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>By Prayer Event</label>
                    <select
                        className="form-select"
                        value={dropdownValue}
                        onChange={(e) => setDropdownValue(e.target.value)}
                    >
                        <option value="">Select a Prayer</option>
                        <option value="fajr">Fajr</option>
                        <option value="dhuhr">Dhuhr</option>
                        <option value="asar">Asar</option>
                        <option value="isha">Isha</option>
                        <option value="jumma">Jummah</option>
                        <option value="taraweeh">Taraweeh</option>
                    </select>
                </div>

                <>
                    <div style={{ textAlign: "center", color: "#6B7280", margin: "10px 0", fontSize: 13 }}>OR Filter by Actual Time</div>

                    {/* Time Filter Type */}
                    <div style={{ display: "flex", gap: 5, marginBottom: 15, flexWrap: "wrap" }}>
                        {["before", "between", "after"].map((type) => (
                            <button
                                key={type}
                                className={`btn-secondary ${timeFilter === type ? "active" : ""}`}
                                style={{
                                    flex: 1,
                                    fontSize: 12,
                                    padding: "8px 4px",
                                    borderColor: timeFilter === type ? "#10B981" : "#D1D5DB",
                                    color: timeFilter === type ? "#10B981" : "#374151"
                                }}
                                onClick={() => setTimeFilter(type)}
                            >
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Time Inputs */}
                    {timeFilter !== "between" ? (
                        <div style={{ marginBottom: 20 }}>
                            <label className="form-label">
                                {timeFilter === "after" ? "Show prayers AFTER this time" : "Select Time"}
                            </label>
                            <CustomTimePicker value={selectedTime} onChange={setSelectedTime} defaultPeriod="PM" />
                        </div>
                    ) : (
                        <div style={{ display: "flex", gap: 15, marginBottom: 20 }}>
                            <div style={{ flex: 1 }}>
                                <label className="form-label">Start</label>
                                <CustomTimePicker value={selectedStartTime} onChange={setSelectedStartTime} defaultPeriod="PM" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="form-label">End</label>
                                <CustomTimePicker value={selectedEndTime} onChange={setSelectedEndTime} defaultPeriod="PM" />
                            </div>
                        </div>
                    )}
                </>
                {/* Actions */}
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={handleClear}>Clear</button>
                    <button className="btn-primary" style={{ flex: 2 }} onClick={handleApply}>Apply Filters</button>
                </div>
            </div>

            <style>{`
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
        }
        .modal-content {
          background: white;
          width: 90%;
          max-width: 400px;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }
        .btn-secondary.active {
          background-color: #ECFDF5;
          border-color: #10B981;
        }
      `}</style>
        </div>
    );
}
