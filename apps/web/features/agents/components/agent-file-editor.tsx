'use client';

import { useState, useEffect } from 'react';
import { useGateway, useInvalidate } from '@scooby/api-client/react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { Save, RotateCcw } from 'lucide-react';

interface AgentFileEditorProps {
  agentId: string;
  fileName: 'identity' | 'soul' | 'tools';
  initialContent: string;
}

const FILE_LABELS: Record<string, string> = {
  identity: 'IDENTITY.md',
  soul: 'SOUL.md',
  tools: 'TOOLS.md',
};

export function AgentFileEditor({ agentId, fileName, initialContent }: AgentFileEditorProps) {
  const [content, setContent] = useState(initialContent);
  const invalidate = useInvalidate();
  const updateFileMutation = useGateway.agents.updateFile();

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent, agentId, fileName]);

  const isDirty = content !== initialContent;

  const handleSave = () => {
    updateFileMutation.mutate(
      { id: agentId, fileName, content },
      {
        onSuccess: () => {
          toast.success(`${FILE_LABELS[fileName]} saved`);
          invalidate.agentFiles(agentId);
        },
        onError: (err) => {
          toast.error(`Failed to save: ${err.message}`);
        },
      },
    );
  };

  const handleReset = () => {
    setContent(initialContent);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
          {FILE_LABELS[fileName]}
        </span>
        {isDirty && (
          <span className="text-[11px] text-accent-600 font-medium">Unsaved changes</span>
        )}
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[420px] font-mono text-[13px] leading-relaxed resize-y bg-white border-neutral-200 focus:border-neutral-300"
        placeholder={`${FILE_LABELS[fileName]} content...`}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!isDirty || updateFileMutation.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          {updateFileMutation.isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleReset}
          disabled={!isDirty}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3.5 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}
