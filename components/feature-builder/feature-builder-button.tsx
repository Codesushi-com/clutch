"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"
import { FeatureBuilderModal } from "./feature-builder-modal"

interface FeatureBuilderButtonProps {
  defaultProjectId?: string
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  children?: React.ReactNode
}

export function FeatureBuilderButton({
  defaultProjectId,
  variant = "default",
  size = "default",
  className,
  children,
}: FeatureBuilderButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        {children || "Feature Builder"}
      </Button>

      <FeatureBuilderModal
        open={open}
        onOpenChange={setOpen}
        defaultProjectId={defaultProjectId}
      />
    </>
  )
}
