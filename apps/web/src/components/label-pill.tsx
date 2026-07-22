import type { Label } from "@/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CircleIcon, CircleSmallIcon, DotIcon } from "lucide-react";

interface LabelPillProps {
  /** Only name + color are read, so the public task payload can render here too. */
  label: Pick<Label, "name" | "color">;
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
  const textColor = "text-[#f7f8f8]";

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
