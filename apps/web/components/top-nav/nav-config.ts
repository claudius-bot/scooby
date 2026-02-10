import {
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  ListChecks,
  Zap,
  Settings,
  Brain,
  Boxes,
  Radio,
  FileText,
  Shield,
  Monitor,
  Link2,
  Bug,
  FolderCog,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: boolean;
}

// Primary navigation - most used
export const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Workspaces', href: '/workspaces', icon: MessagesSquare },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Tasks', href: '/tasks', icon: ListChecks },
];

// Operations - day-to-day management
export const operationsNav: NavItem[] = [
  { name: 'Agents', href: '/agents', icon: FolderCog },
  { name: 'Channels', href: '/channels', icon: Radio },
  { name: 'Skills', href: '/skills', icon: Zap },
  { name: 'Memory', href: '/memory', icon: Brain },
];

// Admin - configuration and monitoring
export const adminNav: NavItem[] = [
  { name: 'Config', href: '/config', icon: Boxes },
  { name: 'Logs', href: '/logs', icon: FileText },
  { name: 'Approvals', href: '/approvals', icon: Shield, badge: true },
];

// Developer - advanced tools
export const developerNav: NavItem[] = [
  { name: 'Instances', href: '/instances', icon: Monitor },
  { name: 'Nodes', href: '/nodes', icon: Link2 },
  { name: 'Debug', href: '/debug', icon: Bug },
];

// Secondary nav (settings, etc.)
export const secondaryNav: NavItem[] = [{ name: 'Settings', href: '/settings', icon: Settings }];

// All navigation items for mobile
export const allMobileNav: NavItem[] = [
  ...navigation,
  ...operationsNav,
  ...adminNav,
  ...developerNav,
];
