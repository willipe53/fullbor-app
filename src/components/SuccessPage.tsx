import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  AppBar,
  Toolbar,
  Container,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  Badge,
} from "@mui/material";
import { ViewList, Dashboard, People, Receipt } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { styled } from "@mui/material/styles";
import boar6white from "../assets/images/boar6white.png";
import EntitiesTable from "./EntitiesTable";
import UsersTable from "./UsersTable";
import TransactionsTable from "./TransactionsTable";
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

  // Get current user for count queries
  const { data: currentUserData } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiService.queryUsers({}),
    enabled: !!userId,
  });

  const currentUser =
    currentUserData && currentUserData.length > 0 ? currentUserData[0] : null;

  // Count queries for badge display
  const { data: entitiesCount } = useQuery({
    queryKey: ["entity-count", "all", currentUser?.user_id],
    queryFn: () =>
      apiService.queryEntities({
        count: true,
        client_group_id: currentUser?.primary_client_group_id,
      }),
    enabled: !!currentUser?.user_id && !!currentUser?.primary_client_group_id,
    select: (data) => (typeof data === "number" ? data : data?.count || 0),
  });

  const { data: usersCount } = useQuery({
    queryKey: [
      "user-count",
      currentUser?.user_name,
      currentUser?.primary_client_group_name,
    ],
    queryFn: () =>
      apiService.queryUsers({
        count: true,
      }),
    enabled:
      !!currentUser?.user_name && !!currentUser?.primary_client_group_name,
    select: (data) => (typeof data === "number" ? data : data?.count || 0),
  });

  const { data: transactionsCount } = useQuery({
    queryKey: [
      "transaction-count",
      currentUser?.user_name,
      currentUser?.primary_client_group_name,
    ],
    queryFn: () =>
      apiService.queryTransactions({
        count: true,
        client_group_name: currentUser?.primary_client_group_name,
      }),
    enabled:
      !!currentUser?.user_name && !!currentUser?.primary_client_group_name,
    select: (data) => (typeof data === "number" ? data : data?.count || 0),
  });

  // Client group onboarding logic
  // console.log("🔍 SuccessPage - Calling useClientGroupOnboarding with:", {
  //   userEmail,
  //   userId,
  // });
  const {
    isLoading: onboardingLoading,
    needsOnboarding,
    user,
    completeOnboarding,
  } = useClientGroupOnboarding(userEmail, userId);

  // Query to get client group information
  const { data: clientGroups } = useQuery({
    queryKey: ["client-groups", user?.primary_client_group_id],
    queryFn: () => {
      if (!user?.primary_client_group_id) return Promise.resolve([]);
      return apiService.queryClientGroups({
        client_group_id: user.primary_client_group_id,
      });
    },
    enabled: !!user?.primary_client_group_id,
  });

  const primaryClientGroup =
    clientGroups && clientGroups.length > 0 ? clientGroups[0] : null;

  const handleOnboardingComplete = async (clientGroupId: number) => {
    try {
      await completeOnboarding(clientGroupId);
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    }
  };

  const handleOnboardingCancel = () => {
    logout();
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  // Helper function to render tabs with badges
  const renderTabWithBadge = (
    icon: React.ReactElement,
    label: string,
    count?: number
  ) => (
    <Tab
      icon={
        count !== undefined ? (
          <Badge
            badgeContent={count}
            sx={{
              "& .MuiBadge-badge": {
                backgroundColor: "#1976b2",
                color: "white",
              },
            }}
            max={999}
          >
            {icon}
          </Badge>
        ) : (
          icon
        )
      }
      label={label}
    />
  );

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
        return <UsersTable />;
      case 3:
        return <TransactionsTable />;
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
                  {primaryClientGroup.name}
                </Typography>
              )}
            </Box>
            <Button color="inherit" onClick={logout}>
              Logout
            </Button>
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
                {primaryClientGroup.name}
              </Typography>
            )}
          </Box>
          <Button color="inherit" onClick={logout}>
            Logout
          </Button>
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
            {renderTabWithBadge(<ViewList />, "Entities", entitiesCount)}
            {renderTabWithBadge(<People />, "Users", usersCount)}
            {renderTabWithBadge(<Receipt />, "Transactions", transactionsCount)}
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
