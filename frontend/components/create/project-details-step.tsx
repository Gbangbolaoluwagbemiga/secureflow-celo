"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Coins } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjectDetailsStepProps {
  formData: {
    projectTitle: string;
    projectDescription: string;
    duration: string;
    totalBudget: string;
    beneficiary: string;
    token: string;
    useNativeToken: boolean;
    isOpenJob: boolean;
  };
  onUpdate: (data: Partial<ProjectDetailsStepProps["formData"]>) => void;
  isContractPaused: boolean;
  whitelistedTokens?: { address: string; name?: string; symbol?: string }[];
  errors?: {
    projectTitle?: string;
    projectDescription?: string;
    duration?: string;
    totalBudget?: string;
    beneficiary?: string;
    tokenAddress?: string;
  };
}

export function ProjectDetailsStep({
  formData,
  onUpdate,
  isContractPaused,
  whitelistedTokens = [],
  errors = {},
}: ProjectDetailsStepProps) {
  return (
    <Card className="glass border-primary/20 p-6">
      <CardHeader>
        <CardTitle>Project Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isContractPaused && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Contract is currently paused. Escrow creation is temporarily
              disabled.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="projectTitle">Project Title *</Label>
            <Input
              id="projectTitle"
              value={formData.projectTitle}
              onChange={(e) => onUpdate({ projectTitle: e.target.value })}
              placeholder="Enter project title"
              required
              minLength={3}
              className={
                errors.projectTitle ? "border-red-500 focus:border-red-500" : ""
              }
            />
            {errors.projectTitle && (
              <p className="text-red-500 text-sm mt-1">{errors.projectTitle}</p>
            )}
          </div>

          <div>
            <Label htmlFor="duration">Duration (days) *</Label>
            <Input
              id="duration"
              type="number"
              value={formData.duration}
              onChange={(e) => onUpdate({ duration: e.target.value })}
              placeholder="e.g., 30"
              min="1"
              max="365"
              required
              className={
                errors.duration ? "border-red-500 focus:border-red-500" : ""
              }
            />
            {errors.duration && (
              <p className="text-red-500 text-sm mt-1">{errors.duration}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="projectDescription">Project Description *</Label>
          <Textarea
            id="projectDescription"
            value={formData.projectDescription}
            onChange={(e) => onUpdate({ projectDescription: e.target.value })}
            placeholder="Describe the project requirements and deliverables..."
            className={`min-h-[120px] ${
              errors.projectDescription
                ? "border-red-500 focus:border-red-500"
                : ""
            }`}
            required
            minLength={50}
          />
          {errors.projectDescription ? (
            <p className="text-red-500 text-sm mt-1">
              {errors.projectDescription}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Minimum 50 characters required
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="totalBudget">Total Budget (tokens) *</Label>
            <Input
              id="totalBudget"
              type="number"
              value={formData.totalBudget}
              onChange={(e) => onUpdate({ totalBudget: e.target.value })}
              placeholder="e.g., 1000"
              min="0.01"
              step="0.01"
              required
              className={
                errors.totalBudget ? "border-red-500 focus:border-red-500" : ""
              }
            />
            {errors.totalBudget ? (
              <p className="text-red-500 text-sm mt-1">{errors.totalBudget}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 0.01 tokens required
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="beneficiary">
              Beneficiary Address {!formData.isOpenJob && "*"}
            </Label>
            <Input
              id="beneficiary"
              value={formData.beneficiary}
              onChange={(e) => onUpdate({ beneficiary: e.target.value })}
              placeholder="0x..."
              disabled={formData.isOpenJob}
              required={!formData.isOpenJob}
              pattern="^0x[a-fA-F0-9]{40}$"
              className={
                errors.beneficiary ? "border-red-500 focus:border-red-500" : ""
              }
            />
            {errors.beneficiary ? (
              <p className="text-red-500 text-sm mt-1">{errors.beneficiary}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                {formData.isOpenJob
                  ? "Leave empty for open job applications"
                  : "Valid address required for direct escrow"}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="useNativeToken"
              checked={formData.useNativeToken}
              onChange={(e) => onUpdate({ useNativeToken: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="useNativeToken">Use Native Token (HSK)</Label>
          </div>

          {!formData.useNativeToken && (
            <div>
              <div className="flex items-center gap-3">
                <Label
                  htmlFor="tokenSelect"
                  className="flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Coins className="h-4 w-4 text-primary" />
                  Custom Token *
                </Label>

                <Select
                  value={formData.token}
                  onValueChange={(value) => onUpdate({ token: value })}
                >
                  <SelectTrigger
                    id="tokenSelect"
                    className={`flex-1 ${
                      errors.tokenAddress
                        ? "border-red-500 focus:border-red-500"
                        : ""
                    }`}
                  >
                    <SelectValue placeholder="Select a token..." />
                  </SelectTrigger>
                  <SelectContent>
                    {whitelistedTokens.length > 0 ? (
                      whitelistedTokens.map((token) => {
                        const displayName = token.name || "Unknown Token";
                        const displaySymbol = token.symbol || "???";
                        const shortAddress = `${token.address.slice(
                          0,
                          6
                        )}...${token.address.slice(-4)}`;

                        return (
                          <SelectItem key={token.address} value={token.address}>
                            <span className="font-medium">{displayName}</span>
                            {token.symbol && (
                              <span className="font-normal">
                                {" "}
                                ({displaySymbol})
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-2">
                              {shortAddress}
                            </span>
                          </SelectItem>
                        );
                      })
                    ) : (
                      <SelectItem value="loading" disabled>
                        Loading tokens...
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {errors.tokenAddress ? (
                <p className="text-red-500 text-sm mt-1">
                  {errors.tokenAddress}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Only admin-whitelisted tokens available
                </p>
              )}
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isOpenJob"
              checked={formData.isOpenJob}
              onChange={(e) => onUpdate({ isOpenJob: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="isOpenJob">Open Job (Allow Applications)</Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
