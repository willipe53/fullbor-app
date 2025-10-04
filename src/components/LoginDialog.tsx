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
import ForgotPasswordDialog from "./ForgotPasswordDialog";

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onSwitchToSignup?: () => void;
}

const LoginDialog: React.FC<LoginDialogProps> = ({
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
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      await login(email, password);
      setEmail("");
      setPassword("");
      onClose();
      onSuccess?.();
    } catch (error: any) {
      // Error handling will be done in the parent component via context
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setEmail("");
      setPassword("");
      setShowForgotPassword(false);
    }
  };

  const handleForgotPasswordClose = () => {
    setShowForgotPassword(false);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ textAlign: "center" }}>Login</DialogTitle>
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
            disabled={loading || !email || !password}
            variant="contained"
            fullWidth
            sx={{ ml: 1 }}
          >
            {loading ? <CircularProgress size={24} /> : "Login"}
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

export default LoginDialog;
