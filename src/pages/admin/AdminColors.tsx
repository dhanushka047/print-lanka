import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Loader2, Trash2, GripVertical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Color {
  id: string;
  name: string;
  hex_value: string;
  is_active: boolean;
  sort_order: number;
}

export default function AdminColors() {
  const [colors, setColors] = useState<Color[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newColor, setNewColor] = useState({ name: "", hex_value: "#3b82f6" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    fetchColors();
  }, []);

  const fetchColors = async () => {
    const { data, error } = await supabase
      .from("available_colors")
      .select("*")
      .order("sort_order");

    if (!error && data) {
      setColors(data);
    }
    setIsLoading(false);
  };

  const handleCreateColor = async () => {
    if (!newColor.name.trim()) {
      toast.error("Color name is required");
      return;
    }

    setIsCreating(true);
    try {
      const maxOrder = colors.length > 0 ? Math.max(...colors.map(c => c.sort_order)) : 0;
      
      const { error } = await supabase.from("available_colors").insert({
        name: newColor.name,
        hex_value: newColor.hex_value,
        sort_order: maxOrder + 1,
      });

      if (error) throw error;

      toast.success("Color added successfully");
      setDialogOpen(false);
      setNewColor({ name: "", hex_value: "#3b82f6" });
      fetchColors();
    } catch (error: any) {
      toast.error(error.message || "Failed to add color");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleActive = async (color: Color) => {
    const { error } = await supabase
      .from("available_colors")
      .update({ is_active: !color.is_active })
      .eq("id", color.id);

    if (!error) {
      fetchColors();
      toast.success(`Color ${!color.is_active ? "enabled" : "disabled"}`);
    }
  };

  const handleDeleteColor = async (id: string) => {
    if (!confirm("Are you sure you want to delete this color?")) return;

    const { error } = await supabase.from("available_colors").delete().eq("id", id);

    if (!error) {
      fetchColors();
      toast.success("Color deleted");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === colors.length && colors.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(colors.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const { error } = await supabase.from("available_colors").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Deleted ${ids.length} color${ids.length > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      fetchColors();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete colors");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Colors</h1>
          <p className="text-muted-foreground">Manage available print colors</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary-gradient">
              <Plus className="w-4 h-4 mr-2" />
              Add Color
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Color</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Color Name</Label>
                <Input
                  placeholder="e.g., Ocean Blue"
                  value={newColor.name}
                  onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-3">
                  <Input
                    type="color"
                    value={newColor.hex_value}
                    onChange={(e) => setNewColor({ ...newColor, hex_value: e.target.value })}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={newColor.hex_value}
                    onChange={(e) => setNewColor({ ...newColor, hex_value: e.target.value })}
                    placeholder="#000000"
                  />
                </div>
              </div>

              <Button onClick={handleCreateColor} disabled={isCreating} className="w-full">
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Color
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Colors</CardTitle>
          <CardDescription>Colors that customers can choose for their prints</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : colors.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No colors added yet</p>
          ) : (
            <div className="space-y-2">
              {colors.map((color) => (
                <div
                  key={color.id}
                  className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-secondary/50 transition-colors"
                >
                  <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-border shadow-inner"
                    style={{ backgroundColor: color.hex_value }}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{color.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{color.hex_value}</p>
                  </div>
                  <Switch
                    checked={color.is_active}
                    onCheckedChange={() => handleToggleActive(color)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteColor(color.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
