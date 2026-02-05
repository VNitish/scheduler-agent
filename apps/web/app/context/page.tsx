'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser } from '@repo/auth';
import { Button } from '@repo/ui';
import { useTheme } from '../components/theme-provider';

// Types
interface UserContextData {
  id?: string;
  displayName?: string;
  location?: string;
  timezone?: string;
  gender?: string;
  summary?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: number[];
  mealTimings?: {
    breakfast?: { start: string; end: string };
    lunch?: { start: string; end: string };
    dinner?: { start: string; end: string };
  };
  otherBlockedTimes?: Array<{
    name: string;
    start: string;
    end: string;
    days?: number[];
  }>;
  preferInPerson?: boolean;
  officeLocation?: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  nicknames: string[];
  relation: string;
  company?: string;
  timezone: string;
  lastMetAt?: string;
}

// SVG Icons
const ArrowLeftIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const UserIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const UsersIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const PlusIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const EditIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const SunIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const XIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ContextIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

export default function ContextPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'contacts'>('profile');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profile state
  const [context, setContext] = useState<UserContextData>({
    workingDays: [1, 2, 3, 4, 5],
  });

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState<Partial<Contact>>({});

  const fetchContext = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    try {
      const response = await fetch('/api/context', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.context) {
          setContext(data.context);
        }
      }
    } catch (error) {
      console.error('Failed to fetch context:', error);
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    try {
      const response = await fetch('/api/contacts', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    }
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(userStr));

    Promise.all([fetchContext(), fetchContacts()]).finally(() => {
      setLoading(false);
    });
  }, [router, fetchContext, fetchContacts]);

  const saveContext = async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    setSaving(true);
    try {
      const response = await fetch('/api/context', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(context),
      });

      if (response.ok) {
        const data = await response.json();
        setContext(data.context);
      }
    } catch (error) {
      console.error('Failed to save context:', error);
    } finally {
      setSaving(false);
    }
  };

  const saveContact = async () => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken || !contactForm.name || !contactForm.email || !contactForm.relation || !contactForm.timezone) return;

    setSaving(true);
    try {
      const url = editingContact ? `/api/contacts/${editingContact.id}` : '/api/contacts';
      const method = editingContact ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactForm),
      });

      if (response.ok) {
        await fetchContacts();
        setShowContactModal(false);
        setEditingContact(null);
        setContactForm({});
      }
    } catch (error) {
      console.error('Failed to save contact:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (id: string) => {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (response.ok) {
        setContacts(contacts.filter(c => c.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete contact:', error);
    }
  };

  const openEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setContactForm(contact);
    setShowContactModal(true);
  };

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({});
    setShowContactModal(true);
  };

  const toggleWorkingDay = (day: number) => {
    const days = context.workingDays || [];
    if (days.includes(day)) {
      setContext({ ...context, workingDays: days.filter(d => d !== day) });
    } else {
      setContext({ ...context, workingDays: [...days, day].sort() });
    }
  };

  if (!user || loading) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} title="Back to Dashboard">
              <ArrowLeftIcon className="w-5 h-5" />
            </Button>
            <ContextIcon className="w-6 h-6" />
            <h1 className="text-lg font-semibold tracking-tight">Context</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
              {theme === 'light' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
            </Button>
            <div className="flex items-center gap-3">
              {user.image && <img src={user.image} alt={user.name} className="w-8 h-8" />}
              <span className="text-sm font-medium">{user.name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-card">
        <div className="px-6 flex gap-4">
          <button
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'profile' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('profile')}
          >
            <span className="flex items-center gap-2"><UserIcon className="w-4 h-4" />Your Profile</span>
          </button>
          <button
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'contacts' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('contacts')}
          >
            <span className="flex items-center gap-2"><UsersIcon className="w-4 h-4" />Contacts ({contacts.length})</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-4xl mx-auto">
        {activeTab === 'profile' ? (
          <div className="space-y-8">
            {/* Basic Info */}
            <section>
              <h2 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-wider">Basic Info</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Display Name</label>
                  <input type="text" value={context.displayName || ''} onChange={(e) => setContext({ ...context, displayName: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="How the agent should address you" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Gender</label>
                  <select value={context.gender || ''} onChange={(e) => setContext({ ...context, gender: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Location</label>
                  <input type="text" value={context.location || ''} onChange={(e) => setContext({ ...context, location: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="City, Country" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Timezone</label>
                  <select value={context.timezone || ''} onChange={(e) => setContext({ ...context, timezone: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select timezone...</option>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-2">Summary (3 lines about you)</label>
                  <textarea value={context.summary || ''} onChange={(e) => setContext({ ...context, summary: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" rows={3} placeholder="Brief description that helps the agent understand your context..." />
                </div>
              </div>
            </section>

            {/* Working Hours */}
            <section>
              <h2 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-wider">Working Hours</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Time</label>
                  <input type="time" value={context.workingHoursStart || '09:00'} onChange={(e) => setContext({ ...context, workingHoursStart: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">End Time</label>
                  <input type="time" value={context.workingHoursEnd || '18:00'} onChange={(e) => setContext({ ...context, workingHoursEnd: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Working Days</label>
                <div className="flex gap-2">
                  {DAYS.map((day, index) => (
                    <button key={day} type="button" onClick={() => toggleWorkingDay(index)} className={`px-3 py-2 text-sm border transition-colors ${(context.workingDays || []).includes(index) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-secondary'}`}>{day}</button>
                  ))}
                </div>
              </div>
            </section>


            {/* Meal Timings */}
            <section>
              <h2 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-wider">Meal Timings (Blocked)</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Breakfast</label>
                  <div className="flex gap-2">
                    <input type="time" value={context.mealTimings?.breakfast?.start || ''} onChange={(e) => setContext({ ...context, mealTimings: { ...context.mealTimings, breakfast: { start: e.target.value, end: context.mealTimings?.breakfast?.end || '' } } })} className="flex-1 px-2 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    <input type="time" value={context.mealTimings?.breakfast?.end || ''} onChange={(e) => setContext({ ...context, mealTimings: { ...context.mealTimings, breakfast: { start: context.mealTimings?.breakfast?.start || '', end: e.target.value } } })} className="flex-1 px-2 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Lunch</label>
                  <div className="flex gap-2">
                    <input type="time" value={context.mealTimings?.lunch?.start || ''} onChange={(e) => setContext({ ...context, mealTimings: { ...context.mealTimings, lunch: { start: e.target.value, end: context.mealTimings?.lunch?.end || '' } } })} className="flex-1 px-2 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    <input type="time" value={context.mealTimings?.lunch?.end || ''} onChange={(e) => setContext({ ...context, mealTimings: { ...context.mealTimings, lunch: { start: context.mealTimings?.lunch?.start || '', end: e.target.value } } })} className="flex-1 px-2 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Dinner</label>
                  <div className="flex gap-2">
                    <input type="time" value={context.mealTimings?.dinner?.start || ''} onChange={(e) => setContext({ ...context, mealTimings: { ...context.mealTimings, dinner: { start: e.target.value, end: context.mealTimings?.dinner?.end || '' } } })} className="flex-1 px-2 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    <input type="time" value={context.mealTimings?.dinner?.end || ''} onChange={(e) => setContext({ ...context, mealTimings: { ...context.mealTimings, dinner: { start: context.mealTimings?.dinner?.start || '', end: e.target.value } } })} className="flex-1 px-2 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
              </div>
            </section>

            {/* Save Button */}
            <div className="pt-4">
              <Button onClick={saveContext} disabled={saving} className="w-full">{saving ? 'Saving...' : 'Save Profile'}</Button>
            </div>
          </div>
        ) : (
          <div>
            {/* Add Contact Button */}
            <div className="flex justify-between items-center mb-6">
              <p className="text-sm text-muted-foreground">Your contacts are used by the agent to schedule meetings. Add nicknames so you can say things like "schedule a call with John".</p>
              <Button onClick={openAddContact}><PlusIcon className="w-4 h-4 mr-2" />Add Contact</Button>
            </div>

            {/* Contacts List */}
            {contacts.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border">
                <UsersIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No contacts yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add your frequent contacts for smarter scheduling</p>
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.map((contact) => (
                  <div key={contact.id} className="border border-border p-4 flex items-start justify-between hover:bg-secondary/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{contact.name}</span>
                        {contact.relation && <span className="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground">{contact.relation}</span>}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {contact.email && <span>{contact.email}</span>}
                        {contact.company && <span> · {contact.company}</span>}
                      </div>
                      {contact.nicknames && contact.nicknames.length > 0 && <div className="text-xs text-muted-foreground mt-1">Nicknames: {contact.nicknames.join(', ')}</div>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditContact(contact)} title="Edit"><EditIcon className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteContact(contact.id)} title="Delete"><TrashIcon className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold">{editingContact ? 'Edit Contact' : 'Add Contact'}</h3>
              <Button variant="ghost" size="icon" onClick={() => { setShowContactModal(false); setEditingContact(null); setContactForm({}); }}><XIcon className="w-5 h-5" /></Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name *</label>
                <input type="text" value={contactForm.name || ''} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Full name" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email *</label>
                <input type="email" value={contactForm.email || ''} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" required />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Nicknames * (comma separated)</label>
                <input type="text" value={(contactForm.nicknames || []).join(', ')} onChange={(e) => setContactForm({ ...contactForm, nicknames: e.target.value.split(',').map(n => n.trim()).filter(Boolean) })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="e.g., John, Johnny, JD" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Relation *</label>
                  <input type="text" value={contactForm.relation || ''} onChange={(e) => setContactForm({ ...contactForm, relation: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="e.g., Colleague, Client, Friend" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Company</label>
                  <input type="text" value={contactForm.company || ''} onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Timezone *</label>
                  <select value={contactForm.timezone || ''} onChange={(e) => setContactForm({ ...contactForm, timezone: e.target.value })} className="w-full px-3 py-2 border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" required>
                    <option value="">Select timezone...</option>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  {/* Empty div to maintain grid layout */}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => { setShowContactModal(false); setEditingContact(null); setContactForm({}); }}>Cancel</Button>
                <Button className="flex-1" onClick={saveContact} disabled={saving || !contactForm.name || !contactForm.email || !contactForm.relation || !contactForm.timezone}>{saving ? 'Saving...' : editingContact ? 'Update' : 'Add Contact'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
