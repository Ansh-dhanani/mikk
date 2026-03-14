import { cva, type VariantProps } from "class-variance-authority";
import { Slot as SlotPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const Slot = SlotPrimitive.Slot;

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-black/5 hover:shadow-md hover:shadow-black/10",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/10",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border border-border/60 bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 rounded-[var(--radius)]",
        sm: "h-8 px-3 rounded-[calc(var(--radius)-2px)] text-xs",
        lg: "h-11 px-8 rounded-[calc(var(--radius)+2px)] text-base",
        icon: "size-9 rounded-[var(--radius)]",
        "icon-sm": "size-8 rounded-[calc(var(--radius)-2px)]",
        "icon-lg": "size-11 rounded-[calc(var(--radius)+2px)]",
      },
      animation: {
        none: "",
        pulse: "animate-pulse",
        shimmer: "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      animation: "none",
    },
  }
);

function Button({
  className,
  variant,
  size,
  animation,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, animation, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
