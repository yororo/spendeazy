import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_COLOR_OPTIONS,
  getCategoryColorOption,
  isCategoryColor,
  type CategoryColor,
} from "@/shared/category";

interface CategoryColorPickerProps {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly idPrefix: string;
  readonly onChange: (color: CategoryColor) => void;
  readonly value: CategoryColor;
}

function CategoryColorPicker({
  className,
  disabled = false,
  idPrefix,
  onChange,
  value,
}: CategoryColorPickerProps) {
  const selectedOption = getCategoryColorOption(value);
  const descriptionId = `${idPrefix}-color-description`;

  return (
    <fieldset
      className={cn("grid gap-2", className)}
      aria-describedby={descriptionId}
    >
      <legend className="text-label">Category Color</legend>
      <p id={descriptionId} className="text-xs text-muted-foreground">
        Choose a named swatch. Selected: {selectedOption.label}.
      </p>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(color) => {
          if (isCategoryColor(color)) onChange(color);
        }}
      >
        <SelectTrigger
          aria-label="Category Color"
          aria-describedby={descriptionId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[min(20rem,60vh)]">
          {CATEGORY_COLOR_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="inline-flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-6 shrink-0 border border-foreground",
                    option.className,
                  )}
                />
                {option.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </fieldset>
  );
}

export { CategoryColorPicker };
