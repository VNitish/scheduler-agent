import { CalendarEvent, formatTime, isToday, isTomorrow } from '../utils/types';
import { Button } from '@repo/ui';

import {
  CalendarIcon,
  RefreshIcon,
  ClockIcon,
} from '../components/icons';

interface CalendarViewProps {
  user: any; // Using any for simplicity since we don't have the full AuthUser type here
  events: CalendarEvent[];
  eventsLoading: boolean;
  fetchEvents: () => void;
  calendarLoading: boolean;
  connectCalendar: () => void;
}

export const CalendarView = ({
  user,
  events,
  eventsLoading,
  fetchEvents,
  calendarLoading,
  connectCalendar,
}: CalendarViewProps) => {
  const todayEvents = events.filter((e: CalendarEvent) => isToday(e.start));
  const tomorrowEvents = events.filter((e: CalendarEvent) => isTomorrow(e.start));

  return (
    <div className="w-2/5 flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <h2 className="font-medium flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          Your Calendar
        </h2>
        {user.calendarConnected && (
          <Button
            variant="bordered"
            size="sm"
            onClick={fetchEvents}
            disabled={eventsLoading}
          >
            <RefreshIcon className={`w-4 h-4 ${eventsLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {user.calendarConnected ? (
          <div className="space-y-6">
            {/* Today */}
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-foreground" />
                Today
              </h3>
              {eventsLoading ? (
                <div className="border border-border p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-muted-foreground animate-pulse" />
                    <span className="text-sm text-muted-foreground">Loading events...</span>
                  </div>
                </div>
              ) : todayEvents.length > 0 ? (
                <div className="space-y-2">
                  {todayEvents.map((event: CalendarEvent) => (
                    <div
                      key={event.id}
                      className="border border-border p-4 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{event.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <ClockIcon className="w-3 h-3" />
                            <span>
                              {formatTime(event.start)} - {formatTime(event.end)}
                            </span>
                          </div>
                          {event.attendees && event.attendees.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {event.attendees.map((attendee: string, idx: number) => (
                                <p key={idx} className="text-xs text-muted-foreground truncate">
                                  {attendee}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground">No events scheduled</p>
                </div>
              )}
            </div>

            {/* Tomorrow */}
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <span className="w-2 h-2 border border-foreground" />
                Tomorrow
              </h3>
              {tomorrowEvents.length > 0 ? (
                <div className="space-y-2">
                  {tomorrowEvents.map((event: CalendarEvent) => (
                    <div
                      key={event.id}
                      className="border border-border p-4 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{event.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <ClockIcon className="w-3 h-3" />
                            <span>
                              {formatTime(event.start)} - {formatTime(event.end)}
                            </span>
                          </div>
                          {event.attendees && event.attendees.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {event.attendees.map((attendee: string, idx: number) => (
                                <p key={idx} className="text-xs text-muted-foreground truncate">
                                  {attendee}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground">No events scheduled</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center mt-8">
            <div className="w-16 h-16 mx-auto mb-4 border border-border flex items-center justify-center">
              <CalendarIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Connect your calendar to see events</p>
            <Button
              className="mt-4"
              variant="bordered"
              onClick={connectCalendar}
              disabled={calendarLoading}
            >
              {calendarLoading ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};