import { useStore } from '../store/useStore';
import ReportsPanel from './ReportsPanel';

export default function Reports() {
  const { dailyStats, projects, activities, manualEntries, settings } = useStore();
  return (
    <ReportsPanel
      dailyStatsOldestFirst={dailyStats}
      projects={projects}
      activities={activities}
      manualEntries={manualEntries}
      settings={settings}
    />
  );
}
