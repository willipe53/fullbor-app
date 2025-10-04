import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  InputAdornment,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";

interface ForgotPasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

const ForgotPasswordDialog: React.FC<ForgotPasswordDialogProps> = ({
  open,
  onClose,
}) => {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "reset">("email");
  const [showPassword, setShowPassword] = useState(false);
  const { forgotPassword, confirmForgotPassword } = useAuth();

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      await forgotPassword(email);
      setStep("reset");
    } catch (error: any) {
      console.error("Forgot password error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationCode || !newPassword) return;

    setLoading(true);
    try {
      await confirmForgotPassword(email, confirmationCode, newPassword);
      handleClose();
    } catch (error: any) {
      console.error("Password reset error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setEmail("");
      setNewPassword("");
      setConfirmationCode("");
      setStep("email");
      setShowPassword(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ textAlign: "center" }}>
        {step === "email" ? "Reset Password" : "Enter New Password"}
      </DialogTitle>

      {step === "email" ? (
        <form onSubmit={handleSubmitEmail}>
          <DialogContent>
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
            >
              <Typography variant="body1" textAlign="center" sx={{ mb: 2 }}>
                Enter your email address and we'll send you a password reset
                code.
              </Typography>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                disabled={loading}
              />
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
              disabled={loading || !email}
              variant="contained"
              fullWidth
              sx={{ ml: 1 }}
            >
              {loading ? <CircularProgress size={24} /> : "Send Reset Code"}
            </Button>
          </DialogActions>
        </form>
      ) : (
        <form onSubmit={handleSubmitReset}>
          <DialogContent>
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
            >
              <Typography variant="body1" textAlign="center" sx={{ mb: 2 }}>
                We've sent a password reset code to <strong>{email}</strong>.
                Enter the code and your new password below.
              </Typography>
              <TextField
                label="Reset Code"
                type="text"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                required
                fullWidth
                disabled={loading}
                placeholder="Enter 6-digit code"
                inputProps={{ maxLength: 6 }}
              />
              <TextField
                label="New Password"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                fullWidth
                disabled={loading}
                helperText="Password must be at least 8 characters"
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
                !confirmationCode ||
                !newPassword ||
                newPassword.length < 8
              }
              variant="contained"
              fullWidth
              sx={{ ml: 1 }}
            >
              {loading ? <CircularProgress size={24} /> : "Reset Password"}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
};

export default ForgotPasswordDialog;
