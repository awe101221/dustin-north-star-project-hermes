import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 focus-visible:outline-1 focus-visible:outline-ring select-none",
  {
    variants: {
      variant: {
        default: "bg-gold text-[#111] hover:bg-gold-strong",
        secondary: "bg-surface-2 text-foreground border border-border hover:bg-surface-3 hover:border-border-strong",
        ghost: "text-foreground-secondary hover:bg-surface-2 hover:text-foreground",
        outline: "border border-border-strong bg-transparent text-foreground hover:bg-surface-2",
        destructive: "bg-neg-soft text-neg border border-transparent hover:border-neg/40",
        link: "text-cyan underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-[12px]",
        xs: "h-6 px-2 text-[11px]",
        lg: "h-9 px-4 text-[13px]",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : type ?? "button"}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
