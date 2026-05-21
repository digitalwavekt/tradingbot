import * as React from "react"
import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number; max?: number; variant?: "default" | "success" | "warning" | "danger" }
>(({ className, value = 0, max = 100, variant = "default", ...props }, ref) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  const variantStyles = {
    default: "bg-primary",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
  }

  return (
    <div
      ref={ref}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <div
        className={cn("h-full transition-all duration-300", variantStyles[variant])}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
})
Progress.displayName = "Progress"

export { Progress }