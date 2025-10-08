import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  Alert,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import ForgotPasswordDialog from "./ForgotPasswordDialog";

interface SigninDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onSwitchToSignup?: () => void;
}

const SigninDialog: React.FC<SigninDialogProps> = ({
  open,
  onClose,
  onSuccess,
  onSwitchToSignup,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [error, setError] = useState<string>("");
  const { signin, confirmSignup } = useAuth();
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError("");
    try {
      await signin(email, password);
      setEmail("");
      setPassword("");
      setError("");
      setNeedsConfirmation(false);
      onClose();
      onSuccess?.();
    } catch (error: any) {
      console.error("Signin error:", error);

      // Handle specific Cognito error codes
      const errorCode = error?.code || error?.name;
      const errorMessage = error?.message || "";

      if (
        errorCode === "UserNotConfirmedException" ||
        errorMessage.includes("not confirmed")
      ) {
        setError(
          "Your account has not been verified. Please check your email for the verification code."
        );
        setNeedsConfirmation(true);
      } else if (
        errorCode === "NotAuthorizedException" ||
        errorCode === "UserNotFoundException"
      ) {
        setError("Incorrect email or password. Please try again.");
      } else if (errorCode === "InvalidParameterException") {
        setError("Invalid email or password format.");
      } else if (errorCode === "TooManyRequestsException") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(errorMessage || "Sign in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !confirmationCode) return;

    setLoading(true);
    setError("");
    try {
      await confirmSignup(email, confirmationCode);
      setError("");
      setNeedsConfirmation(false);
      setConfirmationCode("");
      // After confirmation, try to sign in again
      await signin(email, password);
      setEmail("");
      setPassword("");
      onClose();
      onSuccess?.();
    } catch (error: any) {
      console.error("Confirmation error:", error);
      const errorMessage = error?.message || "";
      if (errorMessage.includes("Invalid verification code")) {
        setError("Invalid verification code. Please check and try again.");
      } else {
        setError(errorMessage || "Verification failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setEmail("");
      setPassword("");
      setError("");
      setNeedsConfirmation(false);
      setConfirmationCode("");
      setShowForgotPassword(false);
    }
  };

  const handleForgotPasswordClose = () => {
    setShowForgotPassword(false);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ textAlign: "center" }}>
        {needsConfirmation ? "Verify Your Account" : "Sign In"}
      </DialogTitle>
      <form onSubmit={needsConfirmation ? handleConfirmAccount : handleSubmit}>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {error}
              </Alert>
            )}

            {needsConfirmation ? (
              <>
                <Alert severity="info" sx={{ mb: 1 }}>
                  Please enter the verification code sent to your email.
                </Alert>
                <TextField
                  label="Verification Code"
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                  required
                  fullWidth
                  disabled={loading}
                  placeholder="Enter 6-digit code"
                  autoFocus
                />
              </>
            ) : (
              <>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  fullWidth
                  disabled={loading}
                />
                <TextField
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  fullWidth
                  disabled={loading}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          disabled={loading}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </>
            )}
            {!needsConfirmation && (
              <Box
                sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}
              >
                <Button
                  variant="text"
                  size="small"
                  onClick={() => setShowForgotPassword(true)}
                  disabled={loading}
                  sx={{ textTransform: "none" }}
                >
                  Forgot Password?
                </Button>
                {onSwitchToSignup && (
                  <Button
                    variant="text"
                    size="small"
                    onClick={onSwitchToSignup}
                    disabled={loading}
                    sx={{ textTransform: "none" }}
                  >
                    Need an account? Sign up
                  </Button>
                )}
              </Box>
            )}
            {needsConfirmation && (
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setNeedsConfirmation(false);
                  setConfirmationCode("");
                  setError("");
                }}
                disabled={loading}
                sx={{ textTransform: "none" }}
              >
                ← Back to Sign In
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button
            onClick={handleClose}
            disabled={loading}
            variant="outlined"
            fullWidth
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              loading ||
              (needsConfirmation ? !confirmationCode : !email || !password)
            }
            variant="contained"
            fullWidth
            sx={{ ml: 1 }}
          >
            {loading ? (
              <CircularProgress size={24} />
            ) : needsConfirmation ? (
              "Verify"
            ) : (
              "Sign In"
            )}
          </Button>
        </DialogActions>
      </form>

      {/* Forgot Password Dialog */}
      <ForgotPasswordDialog
        open={showForgotPassword}
        onClose={handleForgotPasswordClose}
      />
    </Dialog>
  );
};

export default SigninDialog;
