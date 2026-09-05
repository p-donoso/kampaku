"use client";

import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import { ConversationSummary } from "@/components/chat/conversation-summary";
import type { ConversationRecord } from "@/lib/types";

interface ConversationSidebarProps {
  conversations: ConversationRecord[];
  activeId?: string;
  activeSummary?: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ConversationSidebar({
  conversations,
  activeId,
  activeSummary,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function saveRename(id: string) {
    const title = editTitle.trim();
    if (!title) return;
    await onRename(id, title);
    setEditingId(null);
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <span className="text-xs font-medium text-secondary">Conversations</span>
        <Button onClick={onNew} size="small" color="inherit" startIcon={<AddRounded />}>
          New
        </Button>
      </div>
      <ConversationSummary summary={activeSummary} />
      <List dense className="flex-1 overflow-y-auto p-2">
        {conversations.map((conversation) => (
          <ListItemButton
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
            selected={activeId === conversation.id}
            className="!mb-1 !rounded-lg"
          >
            {editingId === conversation.id ? (
              <div className="flex w-full items-center gap-1" onClick={(event) => event.stopPropagation()}>
                <TextField
                  size="small"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveRename(conversation.id);
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
                <Button size="small" onClick={() => void saveRename(conversation.id)}>Save</Button>
              </div>
            ) : (
              <>
                <ListItemText
                  primary={conversation.title ?? "Untitled"}
                  secondary={new Date(conversation.updatedAt).toLocaleDateString()}
                  slotProps={{ primary: { noWrap: true, variant: "caption" }, secondary: { variant: "caption" } }}
                />
                <div className="flex shrink-0 gap-0.5" onClick={(event) => event.stopPropagation()}>
                  <IconButton
                    size="small"
                    aria-label="Rename conversation"
                    onClick={() => {
                      setEditingId(conversation.id);
                      setEditTitle(conversation.title ?? "");
                    }}
                  >
                    <EditRounded fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Delete conversation"
                    onClick={() => setDeletingId(conversation.id)}
                  >
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </div>
              </>
            )}
          </ListItemButton>
        ))}
      </List>
      {deletingId && (
        <div className="border-t border-border p-3 text-xs">
          <p className="mb-2 text-secondary">Delete this conversation?</p>
          <div className="flex gap-2">
            <Button size="small" color="error" variant="contained" onClick={() => void onDelete(deletingId).then(() => setDeletingId(null))}>
              Delete
            </Button>
            <Button size="small" color="inherit" onClick={() => setDeletingId(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </>
  );
}
