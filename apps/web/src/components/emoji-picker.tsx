/**
 * EmojiPicker — lightweight emoji selection popover.
 *
 * Uses a curated list of common emojis instead of emoji-mart (which doesn't
 * support React 19 yet). Opens in a Popover, fires onChange with the selected
 * emoji string.
 *
 * design.md: dark theme, Graphite borders, no Lime.
 */

import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES: Record<string, string[]> = {
  Smileys: [
    "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
    "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
    "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
    "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
  ],
  Gestures: [
    "👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙",
    "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋",
    "🤝", "🙏", "✍️", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻",
    "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄",
  ],
  Objects: [
    "⭐", "🌟", "✨", "⚡", "🔥", "💯", "🎯", "🎨", "🎭", "🎬",
    "🎤", "🎧", "🎼", "🎵", "🎹", "🥁", "🎸", "🎺", "🎻", "🎲",
    "🎮", "🎰", "🎳", "🏆", "🥇", "🥈", "🥉", "⚽", "🏀", "🏈",
    "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🏓", "🏸", "🥅",
  ],
  Tech: [
    "💻", "🖥️", "🖨️", "⌨️", "🖱️", "💽", "💾", "💿", "📀", "📷",
    "📸", "📹", "🎥", "📽️", "🎬", "📺", "📻", "🎙️", "📡", "📞",
    "☎️", "📟", "📠", "🔋", "🔌", "💡", "🔦", "🕯️", "🪔", "🧯",
    "🛠️", "🔨", "⛏️", "⚒️", "🛠️", "🔧", "🔩", "⚙️", "🧰", "🔬",
  ],
  Symbols: [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
    "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️",
    "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "☯️", "☦️", "🛐", "♈",
    "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒",
  ],
  Nature: [
    "🌱", "🌿", "☘️", "🍀", "🎍", "🎋", "🍃", "🍂", "🍁", "🍄",
    "🌾", "💐", "🌷", "🌹", "🥀", "🌺", "🌸", "🌼", "🌻", "🌞",
    "🌝", "🌚", "🌛", "🌜", "🌙", "🌎", "🌍", "🌏", "🪐", "⭐",
    "🌟", "✨", "⚡", "☄️", "💥", "🔥", "🌪️", "🌈", "☀️", "⛅",
  ],
};

const CATEGORY_NAMES = Object.keys(EMOJI_CATEGORIES);

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
}

export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [open, setOpen] = useState(false);

  const emojis = useMemo(
    () => EMOJI_CATEGORIES[CATEGORY_NAMES[activeCategory]],
    [activeCategory],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-md text-lg hover:bg-accent transition-colors",
            className,
          )}
          aria-label="Select emoji"
        >
          {value || "⭐"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onCloseAutoFocus={() => setOpen(false)}
      >
        {/* Category tabs */}
        <div className="flex gap-1 border-b border-border p-2 overflow-x-auto">
          {CATEGORY_NAMES.map((cat, i) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(i)}
              className={cn(
                "px-2 py-1 text-xs rounded-md whitespace-nowrap transition-colors",
                i === activeCategory
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        {/* Emoji grid */}
        <div className="grid grid-cols-8 gap-1 p-2 max-h-48 overflow-y-auto">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onChange(emoji);
                setOpen(false);
              }}
              className="flex items-center justify-center rounded-md text-lg hover:bg-accent transition-colors aspect-square"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}