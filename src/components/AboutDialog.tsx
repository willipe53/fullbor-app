import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
} from "@mui/material";
import boar32 from "../assets/images/boar32.png";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  userEmail: string | null;
  primaryClientGroupName: string | null;
}

const AboutDialog: React.FC<AboutDialogProps> = ({
  open,
  onClose,
  userEmail,
  primaryClientGroupName,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ textAlign: "center", pb: 1 }}>
        About fullbor.ai
      </DialogTitle>
      <DialogContent>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            py: 2,
          }}
        >
          {/* Logo */}
          <Box
            component="img"
            src={boar32}
            alt="fullbor.ai Logo"
            sx={{
              maxWidth: 150,
              height: "auto",
            }}
          />

          {/* Tagline */}
          <Typography
            variant="subtitle1"
            color="text.secondary"
            sx={{ fontStyle: "italic" }}
          >
            The asset allocator's toolkit
          </Typography>

          {/* User Information */}
          <Box
            sx={{
              width: "100%",
              mt: 2,
              pt: 2,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                Username:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {userEmail || "Not available"}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Primary Client Group:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {primaryClientGroupName || "Not assigned"}
              </Typography>
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button onClick={onClose} variant="contained" fullWidth>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AboutDialog;
