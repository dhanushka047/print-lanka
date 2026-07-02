import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Trash2, Edit2, AlertTriangle, Layers, History, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatPrice, PRINT_MATERIALS } from "@/lib/constants";

interface Filament {
  id: string;
  name: string;
  material: string;
  color: string;
  brand: string | null;
  cost: number;
  weight_total: number;
  weight_remaining: number;
  low_threshold: number;
  is_over: boolean;
  created_at: string;
  supplier: string | null;
  purchase_date: string;
}

interface FilamentUsage {
  id: string;
  filament_id: string;
  order_item_id: string | null;
  printer_id: string | null;
  weight_used: number;
  print_hours: number;
  notes: string | null;
  created_at: string;
  filaments?: { name: string; material: string };
  printers?: { name: string };
  order_items?: { file_name: string; orders?: { id: string } };
}

export default function AdminFilaments() {
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [usages, setUsages] = useState<FilamentUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFilament, setEditingFilament] = useState<Filament | null>(null);

  const [filamentForm, setFilamentForm] = useState({
    name: "",
    material: "pla",
    color: "Black",
    brand: "",
    cost: 0,
    weight_total: 1000,
    weight_remaining: 1000,
    low_threshold: 200,
    is_over: false,
    supplier: "",
    purchase_date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    fetchFilaments();
    fetchUsages();
  }, []);

  const fetchUsages = async () => {
    try {
      const { data, error } = await supabase
        .from("filament_usages")
        .select(`
          id, filament_id, order_item_id, printer_id, weight_used, print_hours, notes, created_at,
          filaments (name, material),
          printers (name),
          order_items (file_name, order_id)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (data) setUsages(data as unknown as FilamentUsage[]);
    } catch (error: any) {
      console.error("Usages fetch error:", error);
    }
  };

  const fetchFilaments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("filaments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setFilaments(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch filaments");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingFilament(null);
    setFilamentForm({
      name: "",
      material: "pla",
      color: "Black",
      brand: "",
      cost: 0,
      weight_total: 1000,
      weight_remaining: 1000,
      low_threshold: 200,
      is_over: false,
      supplier: "",
      purchase_date: new Date().toISOString().split("T")[0],
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (filament: Filament) => {
    setEditingFilament(filament);
    setFilamentForm({
      name: filament.name,
      material: filament.material,
      color: filament.color,
      brand: filament.brand || "",
      cost: Number(filament.cost),
      weight_total: Number(filament.weight_total),
      weight_remaining: Number(filament.weight_remaining),
      low_threshold: Number(filament.low_threshold),
      is_over: filament.is_over,
      supplier: filament.supplier || "",
      purchase_date: filament.purchase_date ? filament.purchase_date.split("T")[0] : new Date().toISOString().split("T")[0],
    });
    setDialogOpen(true);
  };

  const handleSaveFilament = async () => {
    if (!filamentForm.name.trim()) {
      toast.error("Spool name is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: filamentForm.name,
        material: filamentForm.material,
        color: filamentForm.color,
        brand: filamentForm.brand || null,
        cost: filamentForm.cost,
        weight_total: filamentForm.weight_total,
        weight_remaining: filamentForm.weight_remaining,
        low_threshold: filamentForm.low_threshold,
        is_over: filamentForm.is_over || filamentForm.weight_remaining <= 0,
        supplier: filamentForm.supplier || null,
        purchase_date: filamentForm.purchase_date ? new Date(filamentForm.purchase_date).toISOString() : new Date().toISOString(),
      };

      if (editingFilament) {
        const { error } = await supabase
          .from("filaments")
          .update(payload)
          .eq("id", editingFilament.id);

        if (error) throw error;
        toast.success("Filament spool updated");
      } else {
        const { error } = await supabase.from("filaments").insert(payload);

        if (error) throw error;
        toast.success("Filament spool added");
      }

      setDialogOpen(false);
      fetchFilaments();
    } catch (error: any) {
      toast.error(error.message || "Failed to save filament");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFilament = async (id: string) => {
    if (!confirm("Are you sure you want to delete this filament spool?")) return;

    try {
      const { error } = await supabase.from("filaments").delete().eq("id", id);
      if (error) throw error;
      
      toast.success("Filament spool deleted");
      fetchFilaments();
      fetchUsages();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete filament");
    }
  };

  const handleMarkAsOver = async (filament: Filament) => {
    if (!confirm(`Mark "${filament.name}" as fully depleted/completed?`)) return;

    try {
      const { error } = await supabase
        .from("filaments")
        .update({
          is_over: true,
          weight_remaining: 0,
        })
        .eq("id", filament.id);

      if (error) throw error;
      toast.success("Filament spool marked as depleted");
      fetchFilaments();
    } catch (error: any) {
      toast.error(error.message || "Failed to mark filament");
    }
  };

  const getStockBadge = (filament: Filament) => {
    if (filament.is_over || Number(filament.weight_remaining) <= 0) {
      return <Badge variant="destructive">Depleted</Badge>;
    }
    if (Number(filament.weight_remaining) <= Number(filament.low_threshold)) {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1">
          <AlertTriangle className="w-3 h-3" />
          Low Stock
        </Badge>
      );
    }
    return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">In Stock</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Filament Spools</h1>
          <p className="text-muted-foreground">Manage filament inventory and spool parameters</p>
        </div>
        <Button onClick={handleOpenAdd} className="bg-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />
          Add Spool
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingFilament ? "Edit Spool" : "Add Spool"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="spool-name">Spool Name</Label>
              <Input
                id="spool-name"
                placeholder="e.g. eSUN PLA+ Black Spool A"
                value={filamentForm.name}
                onChange={(e) => setFilamentForm({ ...filamentForm, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="spool-material">Material</Label>
                <Select
                  value={filamentForm.material}
                  onValueChange={(val) => setFilamentForm({ ...filamentForm, material: val })}
                >
                  <SelectTrigger id="spool-material">
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINT_MATERIALS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="spool-color">Color</Label>
                <Input
                  id="spool-color"
                  placeholder="e.g. Black, White"
                  value={filamentForm.color}
                  onChange={(e) => setFilamentForm({ ...filamentForm, color: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="spool-brand">Brand</Label>
                <Input
                  id="spool-brand"
                  placeholder="e.g. eSUN, Creality"
                  value={filamentForm.brand}
                  onChange={(e) => setFilamentForm({ ...filamentForm, brand: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="spool-cost">Cost (LKR)</Label>
                <Input
                  id="spool-cost"
                  type="number"
                  placeholder="e.g. 5000"
                  value={filamentForm.cost || ""}
                  onChange={(e) => setFilamentForm({ ...filamentForm, cost: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="spool-total">Total Weight (g)</Label>
                <Input
                  id="spool-total"
                  type="number"
                  value={filamentForm.weight_total || ""}
                  onChange={(e) => setFilamentForm({ ...filamentForm, weight_total: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="spool-remaining">Remaining (g)</Label>
                <Input
                  id="spool-remaining"
                  type="number"
                  value={filamentForm.weight_remaining || ""}
                  onChange={(e) => setFilamentForm({ ...filamentForm, weight_remaining: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="spool-threshold">Alert At (g)</Label>
                <Input
                  id="spool-threshold"
                  type="number"
                  value={filamentForm.low_threshold || ""}
                  onChange={(e) => setFilamentForm({ ...filamentForm, low_threshold: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="spool-supplier">Supplier</Label>
                <Input
                  id="spool-supplier"
                  placeholder="e.g. Daraz, Local Shop"
                  value={filamentForm.supplier}
                  onChange={(e) => setFilamentForm({ ...filamentForm, supplier: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="spool-purchase-date">Purchase Date</Label>
                <Input
                  id="spool-purchase-date"
                  type="date"
                  value={filamentForm.purchase_date}
                  onChange={(e) => setFilamentForm({ ...filamentForm, purchase_date: e.target.value })}
                />
              </div>
            </div>

            {editingFilament && (
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="spool-over"
                  checked={filamentForm.is_over}
                  onChange={(e) => setFilamentForm({ ...filamentForm, is_over: e.target.checked })}
                  className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                />
                <Label htmlFor="spool-over" className="cursor-pointer">Mark as completely depleted (over)</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFilament} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingFilament ? "Update" : "Add Spool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="spools" className="space-y-6">
        <TabsList>
          <TabsTrigger value="spools" className="gap-2">
            <Layers className="w-4 h-4" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="usages" className="gap-2">
            <History className="w-4 h-4" />
            Usage Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spools">
          <Card>
            <CardHeader>
              <CardTitle>Spool Management</CardTitle>
              <CardDescription>Track remaining spool weights and trigger low reminders</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : filaments.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground text-sm">No filaments in stock.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Spool Name</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Remaining / Total Weight</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filaments.map((f) => {
                      const pct = Math.max(0, Math.min(100, Math.round((Number(f.weight_remaining) / Number(f.weight_total)) * 100)));
                      return (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">
                            <div>{f.name}</div>
                            {f.supplier && (
                              <div className="text-xs text-muted-foreground">
                                Supplier: {f.supplier}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="uppercase">{f.material}</TableCell>
                          <TableCell>{f.color}</TableCell>
                          <TableCell>
                            <div>{f.brand || "-"}</div>
                            {f.purchase_date && (
                              <div className="text-xs text-muted-foreground">
                                Bought: {new Date(f.purchase_date).toLocaleDateString()}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm font-semibold">
                                {f.weight_remaining}g / {f.weight_total}g ({pct}%)
                              </div>
                              <div className="w-24 bg-secondary h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    pct <= 20 ? 'bg-destructive' : pct <= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`} 
                                  style={{ width: `${pct}%` }} 
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{formatPrice(Number(f.cost))}</TableCell>
                          <TableCell>{getStockBadge(f)}</TableCell>
                          <TableCell className="text-right space-x-1">
                            {!f.is_over && Number(f.weight_remaining) > 0 && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border-amber-200"
                                onClick={() => handleMarkAsOver(f)}
                              >
                                Mark Over
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(f)}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteFilament(f.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usages">
          <Card>
            <CardHeader>
              <CardTitle>Usage History</CardTitle>
              <CardDescription>Filament and printer time tracking for cost recovery audits</CardDescription>
            </CardHeader>
            <CardContent>
              {usages.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground text-sm">No print logs recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Spool Used</TableHead>
                      <TableHead>Printer Used</TableHead>
                      <TableHead>Weight Used</TableHead>
                      <TableHead>Print Hours</TableHead>
                      <TableHead>Source Details</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usages.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(u.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {u.filaments?.name || "Deleted Spool"} 
                          <span className="text-xs text-muted-foreground block uppercase">
                            {u.filaments?.material}
                          </span>
                        </TableCell>
                        <TableCell>{u.printers?.name || "Deleted Printer"}</TableCell>
                        <TableCell className="font-semibold">{u.weight_used}g</TableCell>
                        <TableCell>{u.print_hours} hr</TableCell>
                        <TableCell className="text-xs">
                          {u.order_items ? (
                            <div>
                              <span className="font-mono text-muted-foreground block">
                                Order #{u.order_items.order_id?.slice(0, 8)}
                              </span>
                              <span>{u.order_items.file_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Manual log</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={u.notes || ""}>
                          {u.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
