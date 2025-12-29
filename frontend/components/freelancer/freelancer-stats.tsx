"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  FileText,
  CheckCircle,
  AlertTriangle,
  Star,
  Award,
} from "lucide-react";

interface FreelancerStatsProps {
  escrows: Array<{
    totalAmount: string;
    releasedAmount: string;
    status: string;
    milestones: Array<{
      status: string;
    }>;
  }>;
  freelancerRating?: {
    averageRating: number;
    totalRatings: number;
  } | null;
  badgeTier?: number | null;
}

export function FreelancerStats({
  escrows,
  freelancerRating,
  badgeTier,
}: FreelancerStatsProps) {
  const totalEarnings = escrows.reduce(
    (sum, escrow) => sum + Number.parseFloat(escrow.releasedAmount),
    0
  );

  const totalValue = escrows.reduce(
    (sum, escrow) => sum + Number.parseFloat(escrow.totalAmount),
    0
  );

  // Helper function to check if an escrow is terminated
  const isEscrowTerminated = (escrow: any) => {
    return escrow.milestones.some(
      (milestone: any) =>
        milestone.status === "disputed" || milestone.status === "rejected"
    );
  };

  const completedProjects = escrows.filter((escrow) => {
    // A project is completed if all milestones are approved
    if (escrow.milestones.length === 0) return false;
    return escrow.milestones.every(
      (milestone) => milestone.status === "approved"
    );
  }).length;

  const activeProjects = escrows.filter((escrow) => {
    // Exclude terminated projects
    if (isEscrowTerminated(escrow)) return false;

    // A project is active if:
    // 1. Escrow status is "active" (work has started), OR
    // 2. Has milestones with at least one submitted/approved milestone (work in progress), OR
    // 3. Has milestones but not all are completed
    if (escrow.status === "active") return true;

    if (escrow.milestones.length === 0) return false;

    // Check if there are any milestones that are submitted, approved, or in progress
    const hasInProgressMilestones = escrow.milestones.some(
      (milestone) =>
        milestone.status === "submitted" ||
        milestone.status === "approved" ||
        milestone.status === "pending"
    );

    // Check if all milestones are approved (completed)
    const allMilestonesApproved = escrow.milestones.every(
      (milestone) => milestone.status === "approved"
    );

    // Active if has milestones in progress but not all are completed
    return hasInProgressMilestones && !allMilestonesApproved;
  }).length;

  const pendingProjects = escrows.filter((escrow) => {
    // Exclude terminated projects
    if (isEscrowTerminated(escrow)) return false;

    // A project is pending if:
    // 1. Escrow status is "pending" (work hasn't started yet), OR
    // 2. Has milestones but all are still pending (no submissions yet)
    if (escrow.status === "pending") return true;

    if (escrow.milestones.length === 0) return false;

    // All milestones are still pending (no submissions, approvals, or disputes)
    return escrow.milestones.every(
      (milestone) => milestone.status === "pending"
    );
  }).length;

  // Count terminated projects (disputed/rejected milestones)
  const terminatedProjects = escrows.filter((escrow) => {
    return isEscrowTerminated(escrow);
  }).length;

  // Get badge tier name
  const getBadgeTierName = (tier: number | null) => {
    if (tier === null || tier === undefined) return "Beginner";
    if (tier === 2) return "Pro";
    if (tier === 1) return "Intermediate";
    return "Beginner";
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 md:gap-6 mb-8">
      <Card className="glass border-primary/20 p-4 md:p-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {(totalEarnings / 1e18).toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground">tokens earned</p>
        </CardContent>
      </Card>

      <Card className="glass border-accent/20 p-4 md:p-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Value</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {(totalValue / 1e18).toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground">tokens in projects</p>
        </CardContent>
      </Card>

      <Card className="glass border-primary/20 p-4 md:p-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completed</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{completedProjects}</div>
          <p className="text-xs text-muted-foreground">projects</p>
        </CardContent>
      </Card>

      <Card className="glass border-destructive/20 p-4 md:p-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Terminated</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{terminatedProjects}</div>
          <p className="text-xs text-muted-foreground">projects</p>
        </CardContent>
      </Card>

      <Card className="glass border-yellow-500/20 p-4 md:p-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Rating</CardTitle>
          <Star className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {freelancerRating && freelancerRating.totalRatings > 0
              ? freelancerRating.averageRating.toFixed(1)
              : "N/A"}
          </div>
          <p className="text-xs text-muted-foreground">
            {freelancerRating && freelancerRating.totalRatings > 0
              ? `${freelancerRating.totalRatings} ratings`
              : "No ratings yet"}
          </p>
        </CardContent>
      </Card>

      <Card className="glass border-purple-500/20 p-4 md:p-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Badge Tier</CardTitle>
          <Award className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {getBadgeTierName(badgeTier ?? null)}
          </div>
          <p className="text-xs text-muted-foreground">
            {badgeTier === 2
              ? "20+ projects"
              : badgeTier === 1
              ? "5-19 projects"
              : "0-4 projects"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
