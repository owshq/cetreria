import type { User } from '@shared/types';
import { getUserInitials } from '@shared/types';
import { cx } from '@/lib/cx';
import styles from './UserAvatar.module.css';

type UserAvatarProps = {
  user: Pick<User, 'name' | 'avatarUrl'>;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

export default function UserAvatar({ user, className, size = 'md' }: UserAvatarProps) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className={cx(styles.avatarImage, styles[size], className)}
      />
    );
  }

  return (
    <div className={cx(styles.avatar, styles[size], className)} aria-hidden>
      {getUserInitials(user.name)}
    </div>
  );
}
