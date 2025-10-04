import React from "react";
import { Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import * as apiService from "../services/api";
import { formatDatabaseTimestamp } from "../utils";

interface AuditTrailProps {
  updateDate?: string; // ISO datetime string from database
  updatedUserId?: number; // Database user_id who made the update
}

const AuditTrail: React.FC<AuditTrailProps> = ({
  updateDate,
  updatedUserId,
}) => {
  // Don't show anything for new records (no update date)
  if (!updateDate || !updatedUserId) {
    return null;
  }

  // Fetch user information for the user who made the update
  const { data: updatedByUser } = useQuery({
    queryKey: ["user-by-id", updatedUserId],
    queryFn: () => apiService.queryUsers({ user_id: updatedUserId }),
    enabled: !!updatedUserId,
    select: (data) => (data && data.length > 0 ? data[0] : null),
  });

  const formattedDate = formatDatabaseTimestamp(updateDate);
  const userEmail = updatedByUser?.email || `User ID ${updatedUserId}`;

  return (
    <Typography
      variant="caption"
      sx={{
        fontStyle: "italic",
        color: "text.secondary",
        fontSize: "0.75rem",
        display: "block",
        mt: 2,
        mb: 1,
      }}
    >
      Record last updated on {formattedDate} by {userEmail}
    </Typography>
  );
};

export default AuditTrail;
