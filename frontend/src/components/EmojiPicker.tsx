import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { QUICK_EMOJIS, SMILEYS, GESTURES, HEARTS, OBJECTS } from '../utils/meshcoreOpenPayloads';
import { cn } from '@/lib/utils';

interface EmojiCategory {
  label: string;
  emojis: readonly string[];
}

// Reuses the meshcore-open reaction emoji tables — categorized there for
// wire-index compatibility, but that grouping happens to also make a
// perfectly good picker layout. Order within a category doesn't matter here.
const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  { label: 'Quick', emojis: QUICK_EMOJIS },
  { label: 'Smileys', emojis: SMILEYS },
  { label: 'Gestures', emojis: GESTURES },
  { label: 'Hearts', emojis: HEARTS },
  { label: 'Objects', emojis: OBJECTS },
];

/**
 * A button that opens a categorized emoji picker popover. Selecting an emoji
 * calls `onSelect` and leaves the popover open, so several can be picked in a
 * row; it closes on a click/tap anywhere outside it.
 */
export function EmojiPicker({
  onSelect,
  disabled,
}: {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close emoji picker' : 'Insert emoji'}
        aria-expanded={open}
        title="Insert emoji"
      >
        <span aria-hidden="true">😀</span>
      </Button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-72 rounded-md border border-border bg-card shadow-lg">
          <div className="flex overflow-x-auto border-b border-border">
            {EMOJI_CATEGORIES.map((category, i) => (
              <button
                key={category.label}
                type="button"
                className={cn(
                  'flex-1 whitespace-nowrap px-2 py-1.5 text-xs font-medium transition-colors',
                  i === activeCategory
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setActiveCategory(i)}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto p-2">
            {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                type="button"
                className="rounded p-1 text-lg leading-none transition-colors hover:bg-accent"
                onClick={() => onSelect(emoji)}
                aria-label={`Insert ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
