import React, { useState } from "react";
import { Button, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import LoginDialog from "./LoginDialog";
import SignupDialog from "./SignupDialog";
import boar6white from "../assets/images/boar6white.png";

const AppContainer = styled("div")({
  height: "100vh",
  width: "100vw",
  display: "flex",
  flexDirection: "column",
});

const Toolbar = styled("div")({
  height: "64px",
  width: "100%",
  display: "flex",
  flexDirection: "row",
  justifyContent: "flex-end",
  alignItems: "center",
  padding: "0 16px",
  boxSizing: "border-box",
});

const MainPage = styled("div")({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
});

const LogoImage = styled("img")({
  maxWidth: 300,
  maxHeight: 200,
  width: "auto",
  height: "auto",
  marginBottom: "16px",
});

const LandingPage: React.FC = () => {
  const [loginOpen, setLoginOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);

  return (
    <AppContainer id="app">
      {/* Toolbar with Login/Signup buttons */}
      <Toolbar id="toolbar">
        <Button
          variant="contained"
          sx={{ mr: 2 }}
          onClick={() => setSignupOpen(true)}
        >
          Sign Up
        </Button>
        <Button variant="outlined" onClick={() => setLoginOpen(true)}>
          Login
        </Button>
      </Toolbar>

      {/* Main content with centered logo */}
      <MainPage id="mainpage">
        <LogoImage src={boar6white} alt="fullbor.ai Logo" />
        <Typography variant="h4" color="text.primary" textAlign="center">
          fullbor.ai
        </Typography>
        <Typography
          variant="subtitle1"
          color="text.secondary"
          textAlign="center"
          sx={{ mt: 1 }}
        >
          The asset allocators toolkit
        </Typography>
      </MainPage>

      {/* Login Dialog */}
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

      {/* Signup Dialog */}
      <SignupDialog open={signupOpen} onClose={() => setSignupOpen(false)} />
    </AppContainer>
  );
};

export default LandingPage;
