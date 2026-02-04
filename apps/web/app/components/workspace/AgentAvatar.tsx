'use client';

interface AgentAvatarProps {
  agent: {
    name: string;
    emoji: string;
  };
  size?: 'sm' | 'md' | 'lg';
}

export function AgentAvatar({ agent, size = 'sm' }: AgentAvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8 text-base',
    md: 'h-10 w-10 text-xl',
    lg: 'h-14 w-14 text-3xl',
  };

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gray-800 ${sizeClasses[size]}`}
      title={agent.name}
    >
      {agent.emoji}
    </div>
  );
}
