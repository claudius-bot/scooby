import { TopNav } from '@/features/layout/top-nav';
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 bg-neutral-100">{children}</main>
    </div>
  );
}
