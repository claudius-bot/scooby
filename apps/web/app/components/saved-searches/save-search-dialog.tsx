"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SaveSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  searchType: string;
  criteria: Record<string, unknown>;
}

export function SaveSearchDialog({
  isOpen,
  onClose,
  searchType,
  criteria,
}: SaveSearchDialogProps) {
  const [name, setName] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertFrequency, setAlertFrequency] = useState<string>("daily");
  const queryClient = useQueryClient();

  const { mutate: saveSearch, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          searchType,
          criteria,
          alertEnabled,
          alertFrequency: alertEnabled ? alertFrequency : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save search");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      onClose();
      setName("");
      setAlertEnabled(false);
    },
  });

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-lg shadow-xl z-50">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-accent-600" />
            <h2 className="text-lg font-semibold">Save Search</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-neutral-100"
          >
            <X className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 mb-1.5 block">
              Search Name
            </label>
            <Input
              placeholder="e.g., Aspirin Death Reports"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="alertEnabled"
              checked={alertEnabled}
              onChange={(e) => setAlertEnabled(e.target.checked)}
              className="rounded border-neutral-300"
            />
            <label
              htmlFor="alertEnabled"
              className="text-sm text-neutral-700 cursor-pointer"
            >
              Enable alerts for new results
            </label>
          </div>

          {alertEnabled && (
            <div>
              <label className="text-sm font-medium text-neutral-700 mb-1.5 block">
                Alert Frequency
              </label>
              <Select value={alertFrequency} onValueChange={setAlertFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded">
            <p className="font-medium mb-1">Search criteria:</p>
            <p className="font-mono break-all">
              {JSON.stringify(criteria, null, 2).slice(0, 200)}
              {JSON.stringify(criteria).length > 200 && "..."}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => saveSearch()} disabled={!name.trim() || isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Search"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
