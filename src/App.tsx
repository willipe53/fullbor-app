import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LandingPage from "./components/LandingPage";
import SuccessPage from "./components/SuccessPage";
import AcceptInvitation from "./components/AcceptInvitation";
import ErrorSnackbar from "./components/ErrorSnackbar";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2",
    },
    secondary: {
      main: "#dc004e",
    },
  },
});

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Add a global error handler for auth errors
  React.useEffect(() => {
    const handleAuthError = (event: any) => {
      if (event.detail?.error) {
        setError(event.detail.error.message || "Authentication failed");
      }
    };

    window.addEventListener("auth-error", handleAuthError);
    return () => window.removeEventListener("auth-error", handleAuthError);
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/accept_invitation/:invitationCode"
          element={<AcceptInvitation />}
        />
        <Route
          path="/"
          element={
            <>
              {isAuthenticated ? <SuccessPage /> : <LandingPage />}
              <ErrorSnackbar
                open={!!error}
                message={error || ""}
                onClose={() => setError(null)}
              />
            </>
          }
        />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
