import React, { useState, useEffect } from "react";
import { Search, UserPlus, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import TeamMemberCard from "@/components/settings/TeamMemberCard";
import DeleteAccountDialog from "@/components/settings/DeleteAccountDialog";
import CoverageRequirementsTab from "@/components/settings/CoverageRequirementsTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Settings() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.TeamMember.list("-updated_date", 500);
      setMembers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    setAdding(true);
    try {
      const created = await base44.entities.TeamMember.create({
        name: "New team member",
        employee_id: "",
        is_18_plus: false,
        trained_areas: [],
      });
      setMembers((m) => [created, ...m]);
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  // Optimistic delete: remove immediately, restore on failure.
  const handleDelete = async (member) => {
    setMembers((m) => m.filter((x) => x.id !== member.id));
    try {
      await base44.entities.TeamMember.delete(member.id);
    } catch (e) {
      setMembers((m) => [member, ...m]);
      console.error(e);
    }
  };

  const filtered = members
    .filter(
      (m) =>
        !query ||
        m.name?.toLowerCase().includes(query.toLowerCase()) ||
        (m.employee_id || "").toLowerCase().includes(query.toLowerCase())
    )
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-6 md:py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your team and the minimum coverage required on the floor.
        </p>
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team" className="min-h-[36px]">Team</TabsTrigger>
          <TabsTrigger value="coverage" className="min-h-[36px]">Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-6 mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="mr-auto">
              <h2 className="font-heading text-lg font-semibold">Team members</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Confirm age and tick the areas each person is trained on.
              </p>
            </div>
            <Button onClick={handleAdd} disabled={adding} className="gap-2 min-h-[44px]">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Add member
            </Button>
          </div>

          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search by name or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 min-h-[44px]"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {members.length === 0
                  ? "No team members yet. Add one manually, or upload a roster to auto-detect names."
                  : "No members match your search."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((m) => (
                <TeamMemberCard
                  key={m.id}
                  member={m}
                  onChange={(updated) =>
                    setMembers((list) => list.map((x) => (x.id === updated.id ? updated : x)))
                  }
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
            <h2 className="font-heading text-lg font-semibold">Danger zone</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Permanently delete your account and sign out. This action cannot be undone.
            </p>
            <div className="mt-4">
              <DeleteAccountDialog />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="coverage" className="mt-4">
          <CoverageRequirementsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}