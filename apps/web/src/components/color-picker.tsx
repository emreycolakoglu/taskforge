import { PREDEFINED_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2 p-2">
      {PREDEFINED_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            'w-7 h-7 rounded-md cursor-pointer border-2 transition-all',
            value === color
              ? 'border-foreground'
              : 'border-transparent hover:scale-105'
          )}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  )
}