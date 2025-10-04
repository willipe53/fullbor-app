import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Button,
  Paper,
  Divider,
} from "@mui/material";
import { ArrowForward, ArrowBack } from "@mui/icons-material";

export interface TransferListItem {
  id: string | number;
  label: string;
}

interface TransferListProps {
  title: string;
  leftTitle: string;
  rightTitle: string;
  availableItems: TransferListItem[];
  selectedItems: TransferListItem[];
  onSelectionChange: (selected: TransferListItem[]) => void;
  disabled?: boolean;
}

const TransferList: React.FC<TransferListProps> = ({
  title,
  leftTitle,
  rightTitle,
  availableItems,
  selectedItems,
  onSelectionChange,
  disabled = false,
}) => {
  const [checked, setChecked] = useState<(string | number)[]>([]);
  const [left, setLeft] = useState<TransferListItem[]>([]);
  const [right, setRight] = useState<TransferListItem[]>([]);

  // Update left and right lists when props change
  useEffect(() => {
    console.log("🔧 TransferList - useEffect triggered");
    console.log("🔧 TransferList - availableItems:", availableItems);
    console.log("🔧 TransferList - selectedItems:", selectedItems);
    const selectedIds = new Set(selectedItems.map((item) => item.id));
    const leftItems = availableItems.filter(
      (item) => !selectedIds.has(item.id)
    );
    console.log("🔧 TransferList - leftItems:", leftItems);

    setLeft(leftItems);
    setRight(selectedItems);
  }, [availableItems, selectedItems]);

  const leftChecked = checked.filter((value) =>
    left.some((item) => item.id === value)
  );
  const rightChecked = checked.filter((value) =>
    right.some((item) => item.id === value)
  );

  const handleToggle = (itemId: string | number) => () => {
    const currentIndex = checked.indexOf(itemId);
    const newChecked = [...checked];

    if (currentIndex === -1) {
      newChecked.push(itemId);
    } else {
      newChecked.splice(currentIndex, 1);
    }

    setChecked(newChecked);
  };

  const handleAllRight = () => {
    const newRight = [...right, ...left];
    setRight(newRight);
    setLeft([]);
    setChecked([]);
    onSelectionChange(newRight);
  };

  const handleCheckedRight = () => {
    const itemsToMove = left.filter((item) => leftChecked.includes(item.id));
    const newRight = [...right, ...itemsToMove];
    const newLeft = left.filter((item) => !leftChecked.includes(item.id));

    console.log("🔧 TransferList - Moving items right:", itemsToMove);
    console.log("🔧 TransferList - New right list:", newRight);

    setRight(newRight);
    setLeft(newLeft);
    setChecked(checked.filter((id) => !leftChecked.includes(id)));
    onSelectionChange(newRight);
  };

  const handleCheckedLeft = () => {
    const itemsToMove = right.filter((item) => rightChecked.includes(item.id));
    const newLeft = [...left, ...itemsToMove];
    const newRight = right.filter((item) => !rightChecked.includes(item.id));

    setLeft(newLeft);
    setRight(newRight);
    setChecked(checked.filter((id) => !rightChecked.includes(id)));
    onSelectionChange(newRight);
  };

  const handleAllLeft = () => {
    const newLeft = [...left, ...right];
    setLeft(newLeft);
    setRight([]);
    setChecked([]);
    onSelectionChange([]);
  };

  const customList = (title: string, items: TransferListItem[]) => (
    <Paper
      sx={{
        flex: 1,
        height: 300,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          p: 1,
          backgroundColor: "grey.100",
          fontSize: "0.875rem",
          fontWeight: 600,
          minHeight: "auto",
        }}
      >
        {title}
      </Typography>
      <Divider />
      <List
        dense
        component="div"
        role="list"
        sx={{ flex: 1, overflow: "auto", p: 0 }}
      >
        {items.map((item) => {
          const labelId = `transfer-list-item-${item.id}-label`;
          const isSelected = checked.indexOf(item.id) !== -1;

          return (
            <ListItem key={item.id} role="listitem" disablePadding>
              <ListItemButton
                onClick={handleToggle(item.id)}
                disabled={disabled}
                selected={isSelected}
                sx={{
                  fontSize: "0.75rem",
                  minHeight: "32px",
                  "&.Mui-selected": {
                    backgroundColor: "primary.light",
                    color: "primary.contrastText",
                    "&:hover": {
                      backgroundColor: "primary.main",
                    },
                  },
                }}
              >
                <ListItemText
                  id={labelId}
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: "0.75rem",
                    lineHeight: 1.2,
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "stretch",
          gap: 2,
          width: "100%",
        }}
      >
        {customList(leftTitle, left)}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Button
            sx={{ my: 0.5 }}
            variant="outlined"
            size="small"
            onClick={handleAllRight}
            disabled={left.length === 0 || disabled}
            aria-label="move all right"
          >
            ≫
          </Button>
          <Button
            sx={{ my: 0.5 }}
            variant="outlined"
            size="small"
            onClick={handleCheckedRight}
            disabled={leftChecked.length === 0 || disabled}
            aria-label="move selected right"
          >
            <ArrowForward />
          </Button>
          <Button
            sx={{ my: 0.5 }}
            variant="outlined"
            size="small"
            onClick={handleCheckedLeft}
            disabled={rightChecked.length === 0 || disabled}
            aria-label="move selected left"
          >
            <ArrowBack />
          </Button>
          <Button
            sx={{ my: 0.5 }}
            variant="outlined"
            size="small"
            onClick={handleAllLeft}
            disabled={right.length === 0 || disabled}
            aria-label="move all left"
          >
            ≪
          </Button>
        </Box>
        {customList(rightTitle, right)}
      </Box>
    </Box>
  );
};

export default TransferList;
