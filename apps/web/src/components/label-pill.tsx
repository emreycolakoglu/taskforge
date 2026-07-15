import type { Label } from "@/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CircleIcon, CircleSmallIcon, DotIcon } from "lucide-react";

/** Determines if text should be light or dark based on background luminance. */
function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // Relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55;
}

interface LabelPillProps {
  label: Label;
  className?: string;
  active?: boolean;
  onClick?: () => void;
}

export function LabelPill({
  label,
  className,
  active,
  onClick,
}: LabelPillProps) {
  const textColor = isLightColor(label.color)
    ? "text-[#030404]"
    : "text-[#f7f8f8]";

  return (
    <Badge
      variant={"outline"}
      style={{
        color: textColor,
      }}
      onClick={onClick}
    >
      <CircleSmallIcon
        data-icon="inline-start"
        style={{ color: label.color, fill: label.color }}
      />
      {label.name}
    </Badge>
  );
}
