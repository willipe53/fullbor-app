import React from "react";
import {
  Box,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Chip,
  useTheme,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import SecurityIcon from "@mui/icons-material/Security";
import EmailIcon from "@mui/icons-material/Email";
import CategoryIcon from "@mui/icons-material/Category";
import PersonAddIcon from "@mui/icons-material/PersonAdd";

const OneBorIntroduction: React.FC = () => {
  const theme = useTheme();

  return (
    <Box>
      {/* Header Section */}
      <Paper
        elevation={1}
        sx={{
          p: 2,
          mb: 3,
          backgroundColor: theme.palette.primary.main,
          color: "white",
          borderRadius: 2,
        }}
      >
        <Typography variant="h4" gutterBottom sx={{ fontWeight: "bold" }}>
          All of the below needs to be rewritten, so ignore it for now.
        </Typography>
        <Typography variant="h6" sx={{ opacity: 0.9 }}>
          This needs to discuss the full functionality of the app, not just the
          entities. Also, it probably should have that circular diagram of
          functions that are clickable.
        </Typography>
      </Paper>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AccountTreeIcon color="primary" />
            <Typography variant="h6">
              Understanding Entities: The Building Blocks
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Typography paragraph>
            <strong>Entities are the heart of fullbor.</strong> Think of them as
            digital containers for your financial information. All of your
            accounts, portfolios, and holdings are entities, and they work
            together in a parent-child relationship that mirrors how your real
            financial world is organized.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Parent-Child Relationships Made Simple
          </Typography>
          <Typography paragraph>
            Entities can contain other entities, creating a natural hierarchy.
            Here are some examples:
          </Typography>

          <Paper elevation={1} sx={{ p: 2, mb: 2, backgroundColor: "grey.50" }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontWeight: "bold" }}
            >
              Example 1: Investor Entities Structure
            </Typography>
            <List dense>
              <ListItem sx={{ pl: 0 }}>
                <ListItemText primary="👤 Sue (investor)" />
              </ListItem>
              <ListItem sx={{ pl: 3 }}>
                <ListItemText primary="⚖️ Sue's Living Trust (owned by Sue)" />
              </ListItem>
              <ListItem sx={{ pl: 6 }}>
                <ListItemText primary="🏛️ Investor Account 12345 (one of Sue's accounts)" />
              </ListItem>
              <ListItem sx={{ pl: 9 }}>
                <ListItemText primary="📈 Equity Portfolio (one of Sue's holdings)" />
              </ListItem>
              <ListItem sx={{ pl: 9 }}>
                <ListItemText primary="🌆 Manhattan Property (another holding)" />
              </ListItem>
              <ListItem sx={{ pl: 9 }}>
                <ListItemText primary="🏖️ Vacation Home (yet another holding)" />
              </ListItem>
            </List>
          </Paper>

          <Paper elevation={1} sx={{ p: 2, mb: 2, backgroundColor: "grey.50" }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontWeight: "bold" }}
            >
              Example 2: Investment Portfolios Structure
            </Typography>
            <List dense>
              <ListItem sx={{ pl: 0 }}>
                <ListItemText primary="🏛️ Endowment Master Fund (portfolio)" />
              </ListItem>
              <ListItem sx={{ pl: 3 }}>
                <ListItemText primary="💼 PE Fund (held in master fund)" />
              </ListItem>
              <ListItem sx={{ pl: 6 }}>
                <ListItemText primary="🏭 Portfolio Company 1" />
              </ListItem>
              <ListItem sx={{ pl: 6 }}>
                <ListItemText primary="🏭 Portfolio Company 2" />
              </ListItem>
              <ListItem sx={{ pl: 6 }}>
                <ListItemText primary="🏭 Portfolio Company 3" />
              </ListItem>
              <ListItem sx={{ pl: 3 }}>
                <ListItemText primary="⚖️ Hedge Fund (held in master fund)" />
              </ListItem>
              <ListItem sx={{ pl: 6 }}>
                <ListItemText primary="🧩 30% Fixed Income (target holding)" />
              </ListItem>
              <ListItem sx={{ pl: 6 }}>
                <ListItemText primary="🧩 70% Equity (target holding)" />
              </ListItem>
              <ListItem sx={{ pl: 3 }}>
                <ListItemText primary="📈 Exchange Traded Fund (held directly in master fund)" />
              </ListItem>
              <ListItem sx={{ pl: 6 }}>
                <ListItemText primary="📊 Equity 1 (component of ETF)" />
              </ListItem>
              <ListItem sx={{ pl: 6 }}>
                <ListItemText primary="📊 Equity 2 (component of ETF)" />
              </ListItem>
            </List>
          </Paper>

          <Box
            sx={{
              backgroundColor: "info.light",
              p: 2,
              borderRadius: 1,
              color: "info.contrastText",
            }}
          >
            <Typography variant="body2">
              <strong>💡 Managing Your Entities:</strong> You can freely add,
              modify, or organize entities on the
              <strong> Entities tab</strong>. It is important to remember that
              you can only add or remove entities from your primary Client Group
              (the one that is shown in the app header). You can change your
              primary client group in the <strong>Client Groups</strong> tab.
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CategoryIcon color="primary" />
            <Typography variant="h6">
              Entity Types: Setting the Framework
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Typography paragraph>
            <strong>
              Entity Types give your entities structure and meaning.
            </strong>
            They determine what information fields are available when you create
            new entities. For example, you might have different entity types for
            "Bank Account," "Stock Holding," or "Real Estate Property," each
            with their own relevant fields.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Customizing Entity Types
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Typography component="span">
              The <Chip label="color" size="small" sx={{ mx: 0.5 }} /> and{" "}
              <Chip label="short label" size="small" sx={{ mx: 0.5 }} /> for
              entity types can be changed, and this affects the visual
              appearance for{" "}
              <strong>all users across the entire fullbor.ai system</strong> -
              not just your Client Group. This is probably not the way it will
              work in the future production app, but hey that's where we are
              now.
            </Typography>
          </Box>

          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Schema Properties vs. Custom Fields
          </Typography>
          <Typography paragraph>
            While entity types define the <strong>default fields</strong> that
            appear when creating new entities, you're not limited to just those
            fields. You can always add additional information to any entity
            using either the visual form editor for simple key-value pairs, or
            the JSON interface for more complex data structures.
          </Typography>
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <SecurityIcon color="primary" />
            <Typography variant="h6">
              Client Groups: Your Security and Permissions
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Typography paragraph>
            <strong>
              Client Groups are how fullbor.ai keeps your data secure and
              organized.
            </strong>{" "}
            They act like separate workspaces that determine who can see what
            information.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            How Client Groups Work
          </Typography>
          <Typography paragraph>
            The relationship system is designed to be flexible:
          </Typography>
          <List>
            <ListItem>
              <ListItemText primary="👥 Users can belong to multiple Client Groups - like being part of both your family office and your investment club" />
            </ListItem>
            <ListItem>
              <ListItemText primary="📊 Entities can be shared across multiple Client Groups - so the same portfolio might be visible to both your financial advisor and your family members" />
            </ListItem>
          </List>

          <Paper elevation={1} sx={{ p: 2, mb: 2, backgroundColor: "grey.50" }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontWeight: "bold" }}
            >
              Example 1: Financial Advisory Firm
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                Client Group: "Smith Family Assets"
              </Typography>
              <Typography variant="body2">
                • Users: John Smith, Jane Smith, Financial Advisor
              </Typography>
              <Typography variant="body2">
                • Entities: Family Trust, Retirement Accounts, Investment
                Portfolio
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                Client Group: "Smith Business Holdings"
              </Typography>
              <Typography variant="body2">
                • Users: John Smith, Business Partner, CPA
              </Typography>
              <Typography variant="body2">
                • Entities: Company Stock, Business Real Estate, Equipment
                Assets
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>
              John Smith can see both groups, while his family members only see
              the family assets.
            </Typography>
          </Paper>

          <Paper elevation={1} sx={{ p: 2, backgroundColor: "grey.50" }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontWeight: "bold" }}
            >
              Example 2: Investment Club
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: "bold" }}>
              Client Group: "Downtown Investment Club"
            </Typography>
            <Typography variant="body2">
              • Users: Member A, Member B, Member C, Club Treasurer
            </Typography>
            <Typography variant="body2">
              • Entities: Club Portfolio, Individual Contributions, Shared
              Investments
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>
              Each member sees the same entities but might have different levels
              of access based on their role.
            </Typography>
          </Paper>
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PersonAddIcon color="primary" />
            <Typography variant="h6">Getting Started: Account Setup</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Typography paragraph>
            <strong>Anyone can create an account</strong> on fullbor.ai! When
            you first sign up:
          </Typography>
          <List>
            <ListItem>
              <ListItemText primary="1. You'll be able to create your own Client Group immediately" />
            </ListItem>
            <ListItem>
              <ListItemText primary="2. You can start adding entities and organizing your portfolios" />
            </ListItem>
            <ListItem>
              <ListItemText primary="3. You can invite others to join your Client Group" />
            </ListItem>
          </List>
          <Typography paragraph>
            However, if you haven't been invited to join an existing Client
            Group, you'll only be able to create your own new group initially.
            Once you have your own Client Group set up, you become the
            administrator and can invite other users to join you.
          </Typography>
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <EmailIcon color="primary" />
            <Typography variant="h6">
              Invitations: Growing Your Network
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Typography paragraph>
            <strong>
              Invitations are your tool for building your financial team.
            </strong>{" "}
            Whether you want to add your spouse, financial advisor, accountant,
            or business partners, invitations make it simple and secure.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            How Invitations Work
          </Typography>
          <List>
            <ListItem>
              <ListItemText primary="👤 You can invite anyone - they don't need to already have a fullbor.ai account" />
            </ListItem>
            <ListItem>
              <ListItemText primary="🔑 Each invitation generates a unique code that's specifically tied to your Client Group" />
            </ListItem>
            <ListItem>
              <ListItemText primary="⏰ Codes have an expiration date for security" />
            </ListItem>
            <ListItem>
              <ListItemText primary="✅ Once someone uses the code to join your group, that code is automatically expired" />
            </ListItem>
            <ListItem>
              <ListItemText primary="🆕 New users will be guided through account creation, while existing users will simply be added to your group" />
            </ListItem>
          </List>

          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Managing Invitations
          </Typography>
          <Typography paragraph>
            Visit the <strong>Invitations tab</strong> to:
          </Typography>
          <List>
            <ListItem>
              <ListItemText primary="👀 See all pending invitations you've sent" />
            </ListItem>
            <ListItem>
              <ListItemText primary="📅 Check expiration dates (expired invitations appear in red, valid ones in green)" />
            </ListItem>
            <ListItem>
              <ListItemText primary="❌ Manually expire codes if they were created by mistake" />
            </ListItem>
            <ListItem>
              <ListItemText primary="➕ Generate new invitations as needed" />
            </ListItem>
          </List>
        </AccordionDetails>
      </Accordion>

      <Paper
        elevation={1}
        sx={{
          p: 3,
          mt: 3,
          backgroundColor: "success.light",
          color: "success.contrastText",
        }}
      >
        <Typography variant="h6" gutterBottom sx={{ fontWeight: "bold" }}>
          🎯 Getting Help
        </Typography>
        <Typography paragraph>
          Each section of fullbor.ai has helpful information icons (ℹ️) that
          provide specific guidance for that feature. Don't hesitate to explore
          - the system is designed to be intuitive and forgiving.
        </Typography>
        <Typography paragraph>
          <strong>Remember:</strong> fullbor.ai grows with your needs. Start
          simple with basic entities and expand your structure as your financial
          organization becomes more complex. The flexible design means you can
          always reorganize and refine your setup as you learn what works best
          for your situation.
        </Typography>
        <Typography variant="h6" sx={{ textAlign: "center", mt: 2 }}>
          ☝️ Happy hunting! ☝️
        </Typography>
      </Paper>
    </Box>
  );
};

export default OneBorIntroduction;
