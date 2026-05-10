import React from "react";
import { startLocationWatch } from "./utils/geolocation";
import { API_BASE } from "./config";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { IoHome, IoHomeOutline, IoHeart, IoHeartOutline, IoPerson, IoPersonOutline, IoAddCircle, IoAddCircleOutline, IoBusiness, IoBusinessOutline } from "react-icons/io5";
import HomePage from "./pages/HomePage";
import AddMasjid from "./pages/AddMasjid";
import ProtectedRoute from "./components/ProtectedRoute";
import FavoritesPage from "./pages/FavoritesPage";
import AccountsPage from "./pages/AccountsPage";
import AboutMasjidPage from "./pages/AboutMasjidPage";
import WelcomePage from "./pages/WelcomePage";
import MuezzinPage from "./pages/MuezzinPage";
import MasjidList from "./pages/MasjidList";
import UpdateTimingsPage from "./pages/UpdateTimingsPage";
import MapPage from "./pages/MapPage";
import VerificationPage from "./pages/VerificationPage";
import VerificationPrompt from "./pages/VerificationPrompt";
import { TourProvider } from './context/TourContext';
import { MasjidProvider } from "./context/MasjidContext";
import "./index.css";

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const userStr = localStorage.getItem("@user");
  const user = userStr ? JSON.parse(userStr) : null;
  const [settings, setSettings] = React.useState({ show_add_button: true });

  React.useEffect(() => {
    // Capacitor Hardware Back Button handler
    const setupBackButtonListener = async () => {
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        // If we are not on the home page, go back in router history
        if (window.location.pathname !== '/') {
          navigate(-1);
        } else {
          // If we are on the home page, exit the app
          CapacitorApp.exitApp();
        }
      });
    };
    
    setupBackButtonListener();
    
    return () => {
      CapacitorApp.removeAllListeners();
    };
  }, [navigate]);

  React.useEffect(() => {
    // Warm up location cache immediately so getUserLocation() is instant later
    startLocationWatch();

    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`);
        const data = await res.json();
        setSettings(data);
      } catch (err) {
        console.error("Failed to load app settings", err);
      }
    };
    fetchSettings();
  }, []);

  return (
    <div className="app-layout">
      <div className="page-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          {/* <Route path="/add-masjid" element={<ProtectedRoute><AddMasjid /></ProtectedRoute>} /> */}
          <Route path="/add-masjid" element={<AddMasjid />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/account" element={<AccountsPage />} />
          <Route path="/about-masjid" element={<AboutMasjidPage />} />
          <Route path="/masjids" element={<MasjidList />} />
          <Route path="/map" element={<MapPage />} />
          {/* <Route path="/update-timings" element={<ProtectedRoute><UpdateTimingsPage /></ProtectedRoute>} /> */}
          <Route path="/update-timings" element={<UpdateTimingsPage />} />
          <Route path="/muezzin" element={<MuezzinPage />} />
          <Route path="/verification" element={<VerificationPage />} />
          {/* <Route path="/verification-prompt" element={<ProtectedRoute><VerificationPrompt /></ProtectedRoute>} /> */}
          <Route path="/verification-prompt" element={<VerificationPrompt />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''} id="tour-home-tab">
          {({ isActive }) => (<>
            {isActive ? <IoHome /> : <IoHomeOutline />}
            <span>Home</span>
          </>)}
        </NavLink>

        {settings.show_add_button && (
          <NavLink to="/add-masjid" className={({ isActive }) => isActive ? 'active' : ''} id="tour-add-tab">
            {({ isActive }) => (<>
              {isActive ? <IoAddCircle /> : <IoAddCircleOutline />}
              <span>Add</span>
            </>)}
          </NavLink>
        )}

        {user && (
          <NavLink to="/favorites" className={({ isActive }) => isActive ? 'active' : ''}>
            {({ isActive }) => (<>
              {isActive ? <IoHeart /> : <IoHeartOutline />}
              <span>Following</span>
            </>)}
          </NavLink>
        )}

        {user && user.userType === "Muazzin" && (
          <NavLink
            to="/muezzin"
            className={({ isActive }) => (isActive || (location.pathname === "/update-timings" && location.state?.isDashboard)) ? 'active' : ''}
          >
            {() => {
              const activeState = location.pathname === "/muezzin" || (location.pathname === "/update-timings" && location.state?.isDashboard);
              return (
                <>
                  {activeState ? <IoBusiness /> : <IoBusinessOutline />}
                  <span>Your Masjid</span>
                </>
              );
            }}
          </NavLink>
        )}

        <NavLink to="/account" className={({ isActive }) => isActive ? 'active' : ''} id="tour-profile-tab">
          {({ isActive }) => (<>
            {isActive ? <IoPerson /> : <IoPersonOutline />}
            <span>Account</span>
          </>)}
        </NavLink>
      </nav>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <TourProvider>
        <MasjidProvider>
          <AppContent />
        </MasjidProvider>
      </TourProvider>
    </BrowserRouter>
  );
}

export default App;
