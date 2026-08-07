import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { getDbPath } from "../services/db.ts";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";

interface DatabaseSettingsProps {
  onClose: () => void;
}

export function DatabaseSettings({ onClose }: DatabaseSettingsProps) {
  const [dbPath, setDbPath] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getDbPath()
      .then((path) => {
        if (isMounted) setDbPath(path);
      })
      .catch(() => {
        if (isMounted) setError("Failed to load database path");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="lucide:database" className="w-5 h-5" />
          Database Settings
        </CardTitle>
        <CardDescription>Drawings are stored in the local SQLite database</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <div className="space-y-2">
          <Input type="text" value={dbPath} readOnly />
          <p className="text-xs text-muted-foreground">
            The designated app data directory is used automatically.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </CardContent>
    </Card>
  );
}
