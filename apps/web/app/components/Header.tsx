'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser } from '@repo/auth';
import { useTheme } from '../components/theme-provider';

import {
  CalendarIcon,
  ContextIcon,
  EvalIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
} from '../components/icons';

interface HeaderProps {
  user: AuthUser;
  handleLogout: () => void;
}

export const Header = ({ user, handleLogout }: HeaderProps) => {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    {
      label: 'Context',
      icon: <ContextIcon className="w-4 h-4" />,
      onClick: () => {
        router.push('/context');
        setIsDropdownOpen(false);
      },
    },
    {
      label: 'Eval',
      icon: <EvalIcon className="w-4 h-4" />,
      onClick: () => {
        router.push('/eval');
        setIsDropdownOpen(false);
      },
    },
    {
      label: theme === 'light' ? 'Dark Mode' : 'Light Mode',
      icon: theme === 'light' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />,
      onClick: () => {
        toggleTheme();
        setIsDropdownOpen(false);
      },
    },
    {
      label: 'Logout',
      icon: <LogOutIcon className="w-4 h-4" />,
      onClick: () => {
        handleLogout();
        setIsDropdownOpen(false);
      },
    },
  ];

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-6 h-6" />
          <h1 className="text-lg font-semibold tracking-tight">Smart Scheduler</h1>
        </div>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center justify-center overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all hover:opacity-80"
          >
            {user.image ? (
              <img
                src={user.image}
                alt={user.name}
                className="w-9 h-9 object-cover"
              />
            ) : (
              <div className="w-9 h-9 bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-card shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <div className="py-1">
                {menuItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};