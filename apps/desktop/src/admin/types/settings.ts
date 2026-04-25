export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  idleThreshold: number;
  syncEnabled: boolean;
  calendarIntegration: boolean;
  menuBarWidget: boolean;
  showProductivityInMenuBar: boolean;
  defaultHourlyRate: number;
  currency: string;
  workingHoursStart: number;
  workingHoursEnd: number;
  trackingEnabled: boolean;
  exclusionList: string[];
}
