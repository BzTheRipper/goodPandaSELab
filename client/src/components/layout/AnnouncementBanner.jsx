import { settingsApi } from '../../api/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { Alert } from '../ui/index.js';
import styles from './AnnouncementBanner.module.css';

/** Platform-wide banner from Admin → Settings. Renders nothing when there is no active message. */
export default function AnnouncementBanner() {
  const { data } = useAsync(() => settingsApi.public(), []);
  const announcement = data?.announcement;
  if (!announcement?.message || announcement.active === false) return null;
  return (
    <div className={styles.wrap}>
      <Alert tone={announcement.tone || 'info'}>{announcement.message}</Alert>
    </div>
  );
}
