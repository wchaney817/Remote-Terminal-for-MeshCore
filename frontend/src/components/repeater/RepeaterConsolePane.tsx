import { useState, useCallback, useRef, useEffect, useMemo, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const CLI_DOCS_URL = 'https://docs.meshcore.io/cli_commands/';

export function ConsolePane({
  history,
  loading,
  onSend,
}: {
  history: Array<{ command: string; response: string; timestamp: number; outgoing: boolean }>;
  loading: boolean;
  onSend: (command: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevLoadingRef = useRef(loading);

  // Session-only command history for up/down-arrow recall (Cisco-CLI-style).
  const commandHistory = useMemo(
    () => history.filter((entry) => entry.outgoing).map((entry) => entry.command),
    [history]
  );
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const draftRef = useRef('');

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  // Refocus input after command completes
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      inputRef.current?.focus();
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = input.trimStart();
      if (!trimmed || loading) return;
      setInput('');
      setHistoryIndex(null);
      draftRef.current = '';
      await onSend(trimmed);
    },
    [input, loading, onSend]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (commandHistory.length === 0) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex === null) {
          draftRef.current = input;
        }
        const nextIndex =
          historyIndex === null ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIndex);
        setInput(commandHistory[nextIndex]);
      } else if (e.key === 'ArrowDown') {
        if (historyIndex === null) return;
        e.preventDefault();
        const nextIndex = historyIndex + 1;
        if (nextIndex >= commandHistory.length) {
          setHistoryIndex(null);
          setInput(draftRef.current);
        } else {
          setHistoryIndex(nextIndex);
          setInput(commandHistory[nextIndex]);
        }
      }
    },
    [commandHistory, historyIndex, input]
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden col-span-full">
      <div className="px-3 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Console</h3>
        <a
          href={CLI_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          CLI docs ↗
        </a>
      </div>
      <div
        ref={outputRef}
        className="h-48 overflow-y-auto p-3 font-mono text-xs bg-console-bg/50 text-console space-y-1"
      >
        {history.length === 0 && (
          <p className="text-muted-foreground italic">Type a CLI command below...</p>
        )}
        {history.map((entry, i) =>
          entry.outgoing ? (
            <div key={i} className="text-console-command">
              &gt; {entry.command}
            </div>
          ) : (
            <div key={i} className="text-console/80 whitespace-pre-wrap">
              {entry.response}
            </div>
          )
        )}
        {loading && <div className="text-muted-foreground animate-pulse">...</div>}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 p-2 border-t border-border">
        <Input
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          name="console-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setHistoryIndex(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="CLI command..."
          aria-label="Console command"
          disabled={loading}
          className="flex-1 font-mono text-sm"
        />
        <Button type="submit" size="sm" disabled={loading || !input.trimStart()}>
          Send
        </Button>
      </form>
    </div>
  );
}
