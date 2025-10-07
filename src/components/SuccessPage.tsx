import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  AppBar,
  Toolbar,
  Container,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  ViewList,
  Dashboard,
  Settings,
  Mail,
  Group,
  Person,
  Logout,
  SwapHoriz,
} from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { styled } from "@mui/material/styles";
import boar6white from "../assets/images/boar6white.png";
import EntitiesTable from "./EntitiesTable";
import UsersTable from "./UsersTable";
import TransactionsTable from "./TransactionsTable";
import ClientGroupsTable from "./ClientGroupsTable";
import InvitationsTable from "./InvitationsTable";
import ClientGroupOnboarding from "./ClientGroupOnboarding";
import OneBorIntroduction from "./OneBorIntroduction";
import { useClientGroupOnboarding } from "../hooks/useClientGroupOnboarding";
import * as apiService from "../services/api";

const HeaderLogo = styled("img")({
  height: "40px",
  width: "auto",
});

const SuccessPage: React.FC = () => {
  const { userEmail, userId, logout } = useAuth();
  const [currentTab, setCurrentTab] = useState(0);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(
    null
  );

  // Get current user for count queries
  const { data: currentUserData } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.queryUsers({ sub: userId! }),
    enabled: !!userId,
  });

  const currentUser = useMemo(() => {
    if (!currentUserData) return null;
    // Handle both array and paginated response
    const usersArray = Array.isArray(currentUserData)
      ? currentUserData
      : currentUserData.data || [];
    // Find the user that matches the current userId (sub)
    return usersArray.find((u: apiService.User) => u.sub === userId) || null;
  }, [currentUserData, userId]);

  // Client group onboarding logic
  // console.log("🔍 SuccessPage - Calling useClientGroupOnboarding with:", {
  //   userEmail,
  //   userId,
  // });
  const {
    isLoading: onboardingLoading,
    needsOnboarding,
    completeOnboarding,
  } = useClientGroupOnboarding(userEmail, userId);

  // Query to get client group information
  const { data: clientGroups } = useQuery({
    queryKey: ["client-groups", currentUser?.primary_client_group_id],
    queryFn: async () => {
      if (!currentUser?.primary_client_group_id) return [];
      const response = await apiService.queryClientGroups({});
      if (Array.isArray(response)) {
        return response;
      }
      if (
        typeof response === "object" &&
        response !== null &&
        "data" in response
      ) {
        return response.data || [];
      }
      return [];
    },
    enabled: !!currentUser?.primary_client_group_id,
  });

  const primaryClientGroup = useMemo(() => {
    if (!clientGroups || !currentUser?.primary_client_group_id) return null;

    return (
      clientGroups.find(
        (cg: apiService.ClientGroup) =>
          cg.client_group_id === currentUser.primary_client_group_id
      ) || null
    );
  }, [clientGroups, currentUser?.primary_client_group_id]);

  const handleOnboardingComplete = async (clientGroupId: number) => {
    try {
      await completeOnboarding(clientGroupId);
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    }
  };

  // Settings menu handlers
  const handleSettingsClick = (event: React.MouseEvent<HTMLElement>) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const handleMenuAction = (action: string) => {
    handleSettingsClose();
    switch (action) {
      case "users":
        setCurrentTab(3); // UsersTable tab
        break;
      case "client-groups":
        setCurrentTab(4); // ClientGroupsTable tab
        break;
      case "invitations":
        setCurrentTab(5); // InvitationsTable tab
        break;
      case "logout":
        logout();
        break;
    }
  };

  const handleOnboardingCancel = () => {
    logout();
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const renderTabContent = () => {
    switch (currentTab) {
      case 0:
        return (
          <Container maxWidth="lg">
            {/* Welcome Section */}
            <Paper
              elevation={1}
              sx={{
                p: 2,
                mt: 3,
                mb: 3,
                backgroundColor: "transparent",
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  minHeight: 0,
                }}
              >
                <Box sx={{ flex: 1, lineHeight: 1.2 }}>
                  <Typography variant="h6" sx={{ fontWeight: "bold", mb: 0.5 }}>
                    Welcome to One Book of Record!
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8, mb: "16px" }}>
                    Logged in as: <strong>{userEmail}</strong> • Use the tabs
                    above to manage your data
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Introduction Section */}
            <OneBorIntroduction />
          </Container>
        );
      case 1:
        return <EntitiesTable />;
      case 2:
        return <TransactionsTable />;
      case 3:
        return <UsersTable />;
      case 4:
        return <ClientGroupsTable />;
      case 5:
        return <InvitationsTable />;
      default:
        return null;
    }
  };

  // Show loading screen while checking user status
  if (onboardingLoading) {
    return (
      <Box>
        {/* Header with Logout button */}
        <AppBar position="static" sx={{ backgroundColor: "#0b365a" }}>
          <Toolbar sx={{ justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <HeaderLogo src={boar6white} alt="fullbor.ai Logo" />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {primaryClientGroup && (
                <Typography
                  variant="h6"
                  component="div"
                  sx={{
                    color: "inherit",
                    fontWeight: 500,
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  {primaryClientGroup.client_group_name}
                </Typography>
              )}
              <IconButton
                color="inherit"
                onClick={handleSettingsClick}
                aria-label="settings"
              >
                <Settings />
              </IconButton>
              <Menu
                anchorEl={settingsAnchorEl}
                open={Boolean(settingsAnchorEl)}
                onClose={handleSettingsClose}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "right",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
              >
                <MenuItem onClick={() => handleMenuAction("users")}>
                  <ListItemIcon>
                    <Person fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>User Settings</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleMenuAction("client-groups")}>
                  <ListItemIcon>
                    <Group fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Client Groups</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleMenuAction("invitations")}>
                  <ListItemIcon>
                    <Mail fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Invite Users</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleMenuAction("logout")}>
                  <ListItemIcon>
                    <Logout fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Sign Out</ListItemText>
                </MenuItem>
              </Menu>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Loading screen */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "calc(100vh - 64px)",
            gap: 2,
          }}
        >
          <CircularProgress size={40} />
          <Typography variant="body1" color="text.secondary">
            Setting up your account...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header with Logout button */}
      <AppBar position="static" sx={{ backgroundColor: "#0b365a" }}>
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <HeaderLogo src={boar6white} alt="fullbor.ai Logo" />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {primaryClientGroup && (
              <Typography
                variant="h6"
                component="div"
                sx={{
                  color: "inherit",
                  fontWeight: 500,
                  display: { xs: "none", sm: "block" },
                }}
              >
                {primaryClientGroup.client_group_name}
              </Typography>
            )}
            <IconButton
              color="inherit"
              onClick={handleSettingsClick}
              aria-label="settings"
            >
              <Settings />
            </IconButton>
            <Menu
              anchorEl={settingsAnchorEl}
              open={Boolean(settingsAnchorEl)}
              onClose={handleSettingsClose}
              anchorOrigin={{
                vertical: "bottom",
                horizontal: "right",
              }}
              transformOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
            >
              <MenuItem onClick={() => handleMenuAction("users")}>
                <ListItemIcon>
                  <Person fontSize="small" />
                </ListItemIcon>
                <ListItemText>User Settings</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => handleMenuAction("client-groups")}>
                <ListItemIcon>
                  <Group fontSize="small" />
                </ListItemIcon>
                <ListItemText>Client Groups</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => handleMenuAction("invitations")}>
                <ListItemIcon>
                  <Mail fontSize="small" />
                </ListItemIcon>
                <ListItemText>Invite Users</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => handleMenuAction("logout")}>
                <ListItemIcon>
                  <Logout fontSize="small" />
                </ListItemIcon>
                <ListItemText>Sign Out</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Navigation Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Tabs value={currentTab} onChange={handleTabChange}>
            <Tab icon={<Dashboard />} label="Dashboard" />
            <Tab icon={<ViewList />} label="Entities" />
            <Tab icon={<SwapHoriz />} label="Transactions" />
          </Tabs>
        </Box>
      </Box>

      {/* Tab Content */}
      <Box sx={{ minHeight: "calc(100vh - 120px)" }}>{renderTabContent()}</Box>

      {/* Client Group Onboarding Modal */}
      <ClientGroupOnboarding
        open={needsOnboarding}
        userEmail={userEmail || ""}
        userId={userId || ""}
        onComplete={handleOnboardingComplete}
        onCancel={handleOnboardingCancel}
      />
    </Box>
  );
};

export default SuccessPage;
