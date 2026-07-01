import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, CheckCircle, XCircle, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  phone_verified: boolean;
  created_at: string;
  roles: string[];
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!profilesError && profiles) {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");

      const usersWithRoles = profiles.map((profile) => ({
        ...profile,
        roles: (roles || [])
          .filter((r) => r.user_id === profile.user_id)
          .map((r) => r.role),
      }));

      setUsers(usersWithRoles);
    }
    setIsLoading(false);
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_user_by_admin" as any, {
        target_user_id: deleteDialog.user_id,
      });

      if (error) throw error;

      toast.success("User deleted successfully");
      setDeleteDialog(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground">View and manage registered users</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>Total: {users.length} registered users</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No users found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.first_name} {user.last_name}
                    </TableCell>
                    <TableCell>{user.phone}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email || "-"}
                    </TableCell>
                    <TableCell>
                      {user.phone_verified ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {user.roles.map((role) => (
                          <Badge
                            key={role}
                            variant={role === "admin" ? "default" : role === "moderator" ? "secondary" : "outline"}
                          >
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {!user.roles.includes("admin") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteDialog(user)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete User
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deleteDialog?.first_name} {deleteDialog?.last_name}?
              This will remove their profile and roles. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
