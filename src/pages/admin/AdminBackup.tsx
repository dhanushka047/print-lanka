import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, Upload, RefreshCw, Clock, Database, HardDrive, AlertTriangle, FileCode, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import JSZip from "jszip";

interface BackupSettings {
  autoBackupEnabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  lastBackupAt: string | null;
  retainCount: number;
}

interface BackupManifest {
  version: string;
  createdAt: string;
  type: "data_only" | "full";
  tables: Record<string, unknown[]>;
  files?: { bucket: string; path: string; zipPath: string }[];
}

// All tables to backup
const ALL_TABLES = [
  "available_colors",
  "bank_details",
  "coupons",
  "product_categories",
  "shop_products",
  "shop_product_images",
  "system_settings",
  "gallery_posts",
  "profiles",
  "orders",
  "order_items",
  "payment_slips",
  "shop_orders",
  "shop_order_items",
  "shop_payment_slips",
  "shop_cart_items",
  "user_coupons",
  "user_roles",
  "notifications",
  "sms_campaigns",
  "sms_campaign_recipients",
] as const;

// Storage buckets to backup
const STORAGE_BUCKETS = ["models", "payment-slips", "site-assets", "shop-products"];

export default function AdminBackup() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<BackupSettings>({
    autoBackupEnabled: false,
    frequency: "daily",
    lastBackupAt: null,
    retainCount: 5,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupStatus, setBackupStatus] = useState("");
  const [restoreAuth, setRestoreAuth] = useState(true);
  const [isDumpingSQL, setIsDumpingSQL] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "backup_settings")
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data?.value) {
        const value = data.value as Record<string, unknown>;
        setSettings({
          autoBackupEnabled: value.autoBackupEnabled as boolean ?? false,
          frequency: value.frequency as "daily" | "weekly" | "monthly" ?? "daily",
          lastBackupAt: value.lastBackupAt as string ?? null,
          retainCount: value.retainCount as number ?? 5,
        });
      }
    } catch (error) {
      console.error("Error fetching backup settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (newSettings: BackupSettings) => {
    setIsSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      // Check if setting exists
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "backup_settings")
        .maybeSingle();

      if (existing) {
        await fetch(`${supabaseUrl}/rest/v1/system_settings?key=eq.backup_settings`, {
          method: "PATCH",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            value: newSettings,
            updated_by: user.user?.id,
            updated_at: new Date().toISOString(),
          }),
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/system_settings`, {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: "backup_settings",
            value: newSettings,
            updated_by: user.user?.id,
          }),
        });
      }

      setSettings(newSettings);
      toast({ title: "Settings saved", description: "Backup settings have been updated." });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const performBackup = async (includeFiles: boolean) => {
    setIsBackingUp(true);
    setBackupProgress(0);
    setBackupStatus("Initializing backup...");
    
    try {
      const zip = new JSZip();
      const manifest: BackupManifest = {
        version: "2.0",
        createdAt: new Date().toISOString(),
        type: includeFiles ? "full" : "data_only",
        tables: {},
        files: [],
      };

      // Fetch all table data
      const tablesToBackup = includeFiles ? ALL_TABLES : ALL_TABLES.slice(0, 7); // Config tables only for data backup
      const totalSteps = tablesToBackup.length + (includeFiles ? STORAGE_BUCKETS.length : 0);
      let currentStep = 0;

      for (const table of tablesToBackup) {
        setBackupStatus(`Backing up table: ${table}...`);
        const { data, error } = await supabase.from(table).select("*");
        if (error) {
          console.error(`Error fetching ${table}:`, error);
        } else {
          manifest.tables[table] = data || [];
        }
        currentStep++;
        setBackupProgress((currentStep / totalSteps) * 100);
      }

      // If including files, download all files from storage
      if (includeFiles) {
        const storageFolder = zip.folder("storage");
        
        for (const bucket of STORAGE_BUCKETS) {
          setBackupStatus(`Backing up storage bucket: ${bucket}...`);
          const bucketFolder = storageFolder?.folder(bucket);
          
          // List all files in bucket (including nested)
          const files = await listAllFilesInBucket(bucket);
          
          for (const file of files) {
            try {
              const { data, error } = await supabase.storage.from(bucket).download(file.path);
              if (error) {
                console.error(`Error downloading ${bucket}/${file.path}:`, error);
                continue;
              }
              
              bucketFolder?.file(file.path, data);
              manifest.files?.push({
                bucket,
                path: file.path,
                zipPath: `storage/${bucket}/${file.path}`,
              });
            } catch (err) {
              console.error(`Error processing ${bucket}/${file.path}:`, err);
            }
          }
          
          currentStep++;
          setBackupProgress((currentStep / totalSteps) * 100);
        }
      }

      // Add manifest to zip
      setBackupStatus("Creating backup archive...");
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      // Generate and download zip
      const blob = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      }, (metadata) => {
        setBackupProgress(metadata.percent);
        setBackupStatus(`Compressing: ${Math.round(metadata.percent)}%`);
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${includeFiles ? "full" : "data"}-${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update last backup timestamp
      const newSettings = { ...settings, lastBackupAt: new Date().toISOString() };
      await saveSettings(newSettings);

      toast({ 
        title: "Backup complete", 
        description: `${includeFiles ? "Full" : "Data"} backup downloaded successfully.` 
      });
    } catch (error) {
      console.error("Backup error:", error);
      toast({ title: "Backup failed", description: "Could not create backup.", variant: "destructive" });
    } finally {
      setIsBackingUp(false);
      setBackupProgress(0);
      setBackupStatus("");
    }
  };

  // Helper to list all files in a bucket recursively
  const listAllFilesInBucket = async (bucket: string, prefix = ""): Promise<{ path: string }[]> => {
    const files: { path: string }[] = [];
    
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) {
      console.error(`Error listing ${bucket}/${prefix}:`, error);
      return files;
    }

    for (const item of data || []) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      
      if (item.id === null) {
        // It's a folder, recurse
        const nestedFiles = await listAllFilesInBucket(bucket, fullPath);
        files.push(...nestedFiles);
      } else {
        // It's a file
        files.push({ path: fullPath });
      }
    }

    return files;
  };

  const downloadSQLDump = async () => {
    setIsDumpingSQL(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/db-dump`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate SQL dump");
      }

      const sqlContent = await response.text();
      const blob = new Blob([sqlContent], { type: "application/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `db-dump-${new Date().toISOString().split("T")[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "SQL Dump Complete",
        description: "Full database SQL dump has been downloaded.",
      });
    } catch (error) {
      console.error("SQL dump error:", error);
      toast({
        title: "SQL Dump Failed",
        description: error instanceof Error ? error.message : "Could not create SQL dump.",
        variant: "destructive",
      });
    } finally {
      setIsDumpingSQL(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedFile) return;

    setIsRestoring(true);
    setBackupProgress(0);
    setBackupStatus("Reading backup file...");
    
    try {
      const zip = await JSZip.loadAsync(selectedFile);
      
      // Read manifest
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        throw new Error("Invalid backup file: manifest.json not found");
      }
      
      const manifestText = await manifestFile.async("string");
      const manifest: BackupManifest = JSON.parse(manifestText);

      if (!manifest.version || !manifest.tables) {
        throw new Error("Invalid backup file format");
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      // Calculate total steps
      const tableEntries = Object.entries(manifest.tables);
      const filesToRestore = manifest.files || [];
      const totalSteps = tableEntries.length + filesToRestore.length;
      let currentStep = 0;

      // Restore tables
      for (const [tableName, rows] of tableEntries) {
        setBackupStatus(`Restoring table: ${tableName}...`);
        
        if (!Array.isArray(rows) || rows.length === 0) {
          currentStep++;
          setBackupProgress((currentStep / totalSteps) * 100);
          continue;
        }

        // Clear existing data for config tables only
        const configTables = ["available_colors", "bank_details", "coupons", "product_categories", "system_settings"];
        if (configTables.includes(tableName)) {
          await fetch(`${supabaseUrl}/rest/v1/${tableName}?id=neq.00000000-0000-0000-0000-000000000000`, {
            method: "DELETE",
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
          });
        }

        // Insert backup data using upsert
        const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
          },
          body: JSON.stringify(rows),
        });
        
        if (!response.ok) {
          console.error(`Error restoring ${tableName}:`, await response.text());
        }
        
        currentStep++;
        setBackupProgress((currentStep / totalSteps) * 100);
      }

      // Restore files if this is a full backup
      if (manifest.type === "full" && filesToRestore.length > 0) {
        for (const fileInfo of filesToRestore) {
          setBackupStatus(`Restoring file: ${fileInfo.bucket}/${fileInfo.path}...`);
          
          const zipFile = zip.file(fileInfo.zipPath);
          if (!zipFile) {
            console.error(`File not found in zip: ${fileInfo.zipPath}`);
            currentStep++;
            setBackupProgress((currentStep / totalSteps) * 100);
            continue;
          }

          try {
            const fileData = await zipFile.async("blob");
            
            // Upload to storage
            const { error } = await supabase.storage
              .from(fileInfo.bucket)
              .upload(fileInfo.path, fileData, { upsert: true });
            
            if (error) {
              console.error(`Error uploading ${fileInfo.bucket}/${fileInfo.path}:`, error);
            }
          } catch (err) {
            console.error(`Error restoring file ${fileInfo.zipPath}:`, err);
          }
          
          currentStep++;
          setBackupProgress((currentStep / totalSteps) * 100);
        }
      }

      // Restore auth users if enabled and profiles exist
      let authResult = null;
      if (restoreAuth && manifest.tables.profiles) {
        setBackupStatus("Restoring user accounts...");
        const profiles = manifest.tables.profiles as Array<{
          user_id: string;
          email: string;
          first_name: string;
          last_name: string;
          phone: string;
        }>;

        const profilesWithEmail = profiles.filter((p) => p.email);
        if (profilesWithEmail.length > 0) {
          try {
            const response = await fetch(
              `${supabaseUrl}/functions/v1/restore-auth-users`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ profiles: profilesWithEmail }),
              }
            );

            if (response.ok) {
              authResult = await response.json();
            }
          } catch (authError) {
            console.error("Auth restore error:", authError);
          }
        }
      }

      let description = `Restored ${tableEntries.length} tables`;
      if (filesToRestore.length > 0) {
        description += ` and ${filesToRestore.length} files`;
      }
      if (authResult) {
        description += `. Users: ${authResult.created} created, ${authResult.skipped} skipped, ${authResult.resetEmailsSent} reset emails sent`;
      }

      toast({ 
        title: "Restore complete", 
        description
      });
      setRestoreDialogOpen(false);
      setSelectedFile(null);
    } catch (error) {
      console.error("Restore error:", error);
      toast({ 
        title: "Restore failed", 
        description: error instanceof Error ? error.message : "Could not restore backup.", 
        variant: "destructive" 
      });
    } finally {
      setIsRestoring(false);
      setBackupProgress(0);
      setBackupStatus("");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Backup & Restore</h1>
        <p className="text-muted-foreground">Manage automatic and manual backups of your data</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Auto Backup Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Automatic Backup
            </CardTitle>
            <CardDescription>
              Configure automatic backups for your settings and configuration data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-backup">Enable Auto Backup</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically backup settings data
                </p>
              </div>
              <Switch
                id="auto-backup"
                checked={settings.autoBackupEnabled}
                onCheckedChange={(checked) => {
                  const newSettings = { ...settings, autoBackupEnabled: checked };
                  saveSettings(newSettings);
                }}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label>Backup Frequency</Label>
              <Select
                value={settings.frequency}
                onValueChange={(value: "daily" | "weekly" | "monthly") => {
                  const newSettings = { ...settings, frequency: value };
                  saveSettings(newSettings);
                }}
                disabled={!settings.autoBackupEnabled || isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {settings.lastBackupAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                Last backup: {new Date(settings.lastBackupAt).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Manual Backup
            </CardTitle>
            <CardDescription>
              Create an immediate backup of your data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isBackingUp && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{backupStatus}</span>
                  <span className="font-medium">{Math.round(backupProgress)}%</span>
                </div>
                <Progress value={backupProgress} className="h-2" />
              </div>
            )}
            
            <Button
              className="w-full"
              onClick={() => performBackup(false)}
              disabled={isBackingUp}
            >
              {isBackingUp ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Database className="w-4 h-4 mr-2" />
              )}
              Download Data Backup (ZIP)
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Configuration tables only: colors, coupons, bank details, categories, products, settings
            </p>

            <div className="border-t pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => performBackup(true)}
                disabled={isBackingUp}
              >
                {isBackingUp ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <HardDrive className="w-4 h-4 mr-2" />
                )}
                Download Full Backup (ZIP)
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                ALL database tables + ALL storage files (models, payment slips, assets, products)
              </p>
            </div>

            <div className="border-t pt-4">
              <Button
                variant="secondary"
                className="w-full"
                onClick={downloadSQLDump}
                disabled={isDumpingSQL || isBackingUp}
              >
                {isDumpingSQL ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileCode className="w-4 h-4 mr-2" />
                )}
                Download SQL Dump
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Full SQL file with schema + data (requires DB URL secret)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Restore */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Restore from Backup
            </CardTitle>
            <CardDescription>
              Restore your data from a previous backup file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                Restoring will overwrite existing data. Make sure to create a backup first before restoring.
              </AlertDescription>
            </Alert>

            <Button variant="outline" onClick={() => setRestoreDialogOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Backup File
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from Backup</DialogTitle>
            <DialogDescription>
              Select a backup ZIP file to restore your data. Full backups will also restore all storage files.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backup-file">Backup File (ZIP)</Label>
              <Input
                id="backup-file"
                type="file"
                accept=".zip"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>

            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}

            <div className="flex items-start space-x-3 p-3 border rounded-lg bg-muted/30">
              <Checkbox
                id="restore-auth"
                checked={restoreAuth}
                onCheckedChange={(checked) => setRestoreAuth(checked === true)}
              />
              <div className="space-y-1">
                <label htmlFor="restore-auth" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Restore User Accounts
                </label>
                <p className="text-xs text-muted-foreground">
                  Recreates auth accounts from profile emails and sends password reset emails to users
                </p>
              </div>
            </div>

            {isRestoring && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{backupStatus}</span>
                  <span className="font-medium">{Math.round(backupProgress)}%</span>
                </div>
                <Progress value={backupProgress} className="h-2" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialogOpen(false)} disabled={isRestoring}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={!selectedFile || isRestoring}
            >
              {isRestoring ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Restore Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
