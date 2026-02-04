'use client';

interface HeaderProps {
  title?: string;
}

export function Header({ title = 'Scooby' }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-gray-800 bg-gray-950 px-4">
      <h1 className="text-lg font-bold text-white">{title}</h1>
    </header>
  );
}
