import React, { createContext, useContext, useState, useEffect } from 'react';

const MasjidContext = createContext();

export const useMasjid = () => useContext(MasjidContext);

export const MasjidProvider = ({ children }) => {
    const [location, setLocation] = useState({ lat: 17.385044, lng: 78.486671 });
    const [locationName, setLocationName] = useState("Loading current location...");
    const [masjids, setMasjids] = useState([]);
    const [filters, setFilters] = useState({
        distance: 2,
        prayer: "auto",
        timeFilterType: "prayer", // 'prayer', 'before', 'between', 'after'
        customTimeConfig: null
    });
    const [lastFetchedCoords, setLastFetchedCoords] = useState(null);

    // Persist to sessionStorage to handle page reloads without re-fetching everything
    useEffect(() => {
        const saved = sessionStorage.getItem('masjid_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            setLocation(parsed.location);
            setLocationName(parsed.locationName);
            setMasjids(parsed.masjids);
            setFilters(parsed.filters);
            setLastFetchedCoords(parsed.lastFetchedCoords);
        }
    }, []);

    useEffect(() => {
        const state = { location, locationName, masjids, filters, lastFetchedCoords };
        sessionStorage.setItem('masjid_state', JSON.stringify(state));
    }, [location, locationName, masjids, filters, lastFetchedCoords]);

    const value = {
        location, setLocation,
        locationName, setLocationName,
        masjids, setMasjids,
        filters, setFilters,
        lastFetchedCoords, setLastFetchedCoords
    };

    return <MasjidContext.Provider value={value}>{children}</MasjidContext.Provider>;
};
