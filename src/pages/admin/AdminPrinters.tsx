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
import { Plus, Loader2, Trash2, Edit2, AlertTriangle, MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/constants";

interface Printer {
  id: string;
  name: string;
  status: string;
  monthly_premium: number;
  terms_count: number;
  hourly_cost: number;
  created_at: string;
}

export default function AdminPrinters() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null);
  
  const [printerForm, setPrinterForm] = useState({
    name: "",
    status: "active",
    monthly_premium: 0,
    terms_count: 0,
    hourly_cost: 0,
  });

  useEffect(() => {
    fetchPrinters();
  }, []);

  const fetchPrinters = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("printers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setPrinters(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch printers");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingPrinter(null);
    setPrinterForm({
      name: "",
      status: "active",
      monthly_premium: 0,
      terms_count: 0,
      hourly_cost: 0,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (printer: Printer) => {
    setEditingPrinter(printer);
    setPrinterForm({
      name: printer.name,
      status: printer.status,
      monthly_premium: Number(printer.monthly_premium),
      terms_count: printer.terms_count,
      hourly_cost: Number(printer.hourly_cost),
    });
    setDialogOpen(true);
  };

  const handleSavePrinter = async () => {
    if (!printerForm.name.trim()) {
      toast.error("Printer name is required");
      return;
    }

    setIsSaving(true);
    try {
      if (editingPrinter) {
        // Update
        const { error } = await supabase
          .from("printers")
          .update({
            name: printerForm.name,
            status: printerForm.status,
            monthly_premium: printerForm.monthly_premium,
            terms_count: printerForm.terms_count,
            hourly_cost: printerForm.hourly_cost,
          })
          .eq("id", editingPrinter.id);

        if (error) throw error;
        toast.success("Printer updated successfully");
      } else {
        // Insert
        const { error } = await supabase.from("printers").insert({
          name: printerForm.name,
          status: printerForm.status,
          monthly_premium: printerForm.monthly_premium,
          terms_count: printerForm.terms_count,
          hourly_cost: printerForm.hourly_cost,
        });

        if (error) throw error;
        toast.success("Printer added successfully");
      }

      setDialogOpen(false);
      fetchPrinters();
    } catch (error: any) {
      toast.error(error.message || "Failed to save printer");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePrinter = async (id: string) => {
    if (!confirm("Are you sure you want to delete this printer?")) return;

    try {
      const { error } = await supabase.from("printers").delete().eq("id", id);
      if (error) throw error;
      
      toast.success("Printer deleted");
      fetchPrinters();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete printer");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Active</Badge>;
      case "maintenance":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Maintenance</Badge>;
      case "inactive":
      default:
        return <Badge className="bg-slate-400 hover:bg-slate-500 text-white">Inactive</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Printers Fleet</h1>
          <p className="text-muted-foreground">Manage your 3D printers and costs</p>
        </div>
        <Button onClick={handleOpenAdd} className="bg-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />
          Add Printer
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPrinter ? "Edit Printer" : "Add New Printer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="printer-name">Printer Name</Label>
              <Input
                id="printer-name"
                placeholder="e.g. Creality Ender 3 S1"
                value={printerForm.name}
                onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="printer-status">Status</Label>
              <Select
                value={printerForm.status}
                onValueChange={(value) => setPrinterForm({ ...printerForm, status: value })}
              >
                <SelectTrigger id="printer-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="printer-hourly">Hourly Run Cost (LKR)</Label>
                <Input
                  id="printer-hourly"
                  type="number"
                  placeholder="e.g. 50"
                  value={printerForm.hourly_cost || ""}
                  onChange={(e) => setPrinterForm({ ...printerForm, hourly_cost: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="printer-premium">Monthly Premium (LKR)</Label>
                <Input
                  id="printer-premium"
                  type="number"
                  placeholder="e.g. 3000"
                  value={printerForm.monthly_premium || ""}
                  onChange={(e) => setPrinterForm({ ...printerForm, monthly_premium: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="printer-terms">Terms Count (Months for Depreciation)</Label>
              <Input
                id="printer-terms"
                type="number"
                placeholder="e.g. 12"
                value={printerForm.terms_count || ""}
                onChange={(e) => setPrinterForm({ ...printerForm, terms_count: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">Useful to calculate monthly capital recovery cost.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePrinter} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingPrinter ? "Update" : "Add Printer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Fleet Overview</CardTitle>
          <CardDescription>Configure printer rates and amortization settings</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : printers.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <MonitorPlay className="w-12 h-12 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground text-sm">No printers registered in the system yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Printer Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hourly Cost</TableHead>
                  <TableHead>Monthly Premium</TableHead>
                  <TableHead>Terms Count</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printers.map((printer) => (
                  <TableRow key={printer.id}>
                    <TableCell className="font-medium">{printer.name}</TableCell>
                    <TableCell>{getStatusBadge(printer.status)}</TableCell>
                    <TableCell>{formatPrice(Number(printer.hourly_cost))}/hr</TableCell>
                    <TableCell>{formatPrice(Number(printer.monthly_premium))}</TableCell>
                    <TableCell>{printer.terms_count} months</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(printer)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeletePrinter(printer.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
