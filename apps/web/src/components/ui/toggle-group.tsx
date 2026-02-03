import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const ToggleGroup = ToggleGroupPrimitive.Root;

const ToggleGroupItem = forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold",
      "border border-stroke/60 text-ink/70 transition data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-white",
      className
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
