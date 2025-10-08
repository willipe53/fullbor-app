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
} from "@mui/material";
import { useAuth } from "../contexts/AuthContext";

interface ConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  email: string;
  password: string;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  onClose,
  email,
  password,
}) => {
  const [confirmationCode, setConfirmationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { confirmSignup, signin } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationCode) return;

    setLoading(true);
    try {
      // First confirm the signup
      await confirmSignup(email, confirmationCode);

      // Then automatically log the user in
      await signin(email, password);

      onClose();
      setConfirmationCode("");
    } catch (error: any) {
      console.error("Confirmation error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setConfirmationCode("");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ textAlign: "center" }}>Confirm Your Email</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <Typography variant="body1" textAlign="center" sx={{ mb: 2 }}>
              You should have received an email at <strong>{email}</strong> from
              fullbor.ai with your confirmation code. Please enter that code
              here to get access to the system.
            </Typography>
            <TextField
              label="Confirmation Code"
              type="text"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              required
              fullWidth
              disabled={loading}
              placeholder="Enter 6-digit code"
              inputProps={{ maxLength: 6 }}
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
            disabled={loading || !confirmationCode}
            variant="contained"
            fullWidth
            sx={{ ml: 1 }}
          >
            {loading ? <CircularProgress size={24} /> : "Confirm"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ConfirmationDialog;
