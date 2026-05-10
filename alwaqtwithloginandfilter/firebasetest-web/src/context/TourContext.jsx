import React, { createContext, useContext, useEffect, useState } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useNavigate, useLocation } from 'react-router-dom';

const TourContext = createContext();

export const useTour = () => useContext(TourContext);

export const TourProvider = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Track which stage of the tour the user is in globally
    const [tourActive, setTourActive] = useState(false);
    const [tourStage, setTourStage] = useState(null); // 'home', 'about', 'update', 'add'

    // We will hold a reference to the active driver instance
    const [driverObj, setDriverObj] = useState(null);

    // Initialize the tour if they haven't seen it yet
    useEffect(() => {
        const hasSeenTour = localStorage.getItem('hasSeenAppTour');
        if (!hasSeenTour) {
            startTour();
        }
    }, []);

    const completeTour = () => {
        setTourActive(false);
        setTourStage(null);
        localStorage.setItem('hasSeenAppTour', 'true');
        if (driverObj) {
            driverObj.destroy();
        }
    };

    const startTour = () => {
        setTourActive(true);
        setTourStage('home');
        if (location.pathname !== '/') {
            navigate('/');
        }
    };

    return (
        <TourContext.Provider value={{
            tourActive,
            tourStage,
            setTourStage,
            driverObj,
            setDriverObj,
            completeTour,
            startTour
        }}>
            {children}
        </TourContext.Provider>
    );
};
