"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy invite code"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.05] text-[var(--label-secondary)] transition-colors active:bg-black/[0.1]"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-green-600" strokeWidth={2.5} />
        : <Copy className="h-3.5 w-3.5" strokeWidth={2} />
      }
    </button>
  );
}
