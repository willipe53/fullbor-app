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
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import ConfirmationDialog from "./ConfirmationDialog";

interface SignupDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onSwitchToSignin?: () => void;
}

const SignupDialog: React.FC<SignupDialogProps> = ({
  open,
  onClose,
  onSuccess,
  onSwitchToSignin,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const { signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || password !== confirmPassword) return;

    setLoading(true);
    try {
      await signup(email, password);
      // Signup successful, show confirmation dialog
      setSignupEmail(email);
      setSignupPassword(password);
      setShowConfirmation(true);
      // Clear form but don't close dialog yet
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      // Error handling will be done in the parent component via context
      console.error("Signup error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setShowConfirmation(false);
      setSignupEmail("");
      setSignupPassword("");
    }
  };

  const handleConfirmationClose = () => {
    setShowConfirmation(false);
    setSignupEmail("");
    setSignupPassword("");
    onClose(); // Close the main signup dialog too
    onSuccess?.(); // Call success callback after confirmation dialog closes
  };

  const isFormValid =
    email && password && password === confirmPassword && password.length >= 8;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ textAlign: "center" }}>Sign Up</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
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
            <TextField
              label="Confirm Password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
              disabled={loading}
              error={confirmPassword !== "" && password !== confirmPassword}
              helperText={
                confirmPassword !== "" && password !== confirmPassword
                  ? "Passwords do not match"
                  : ""
              }
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle confirm password visibility"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      edge="end"
                      disabled={loading}
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            {onSwitchToSignin && (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
                <Button
                  variant="text"
                  size="small"
                  onClick={onSwitchToSignin}
                  disabled={loading}
                  sx={{ textTransform: "none" }}
                >
                  Already have an account? Sign in
                </Button>
              </Box>
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
            disabled={loading || !isFormValid}
            variant="contained"
            fullWidth
            sx={{ ml: 1 }}
          >
            {loading ? <CircularProgress size={24} /> : "Sign Up"}
          </Button>
        </DialogActions>
      </form>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        open={showConfirmation}
        onClose={handleConfirmationClose}
        email={signupEmail}
        password={signupPassword}
      />
    </Dialog>
  );
};

export default SignupDialog;
