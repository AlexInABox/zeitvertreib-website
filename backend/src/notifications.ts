import { drizzle } from 'drizzle-orm/d1';
import { notifications } from './db/schema.js';
import type { UserNotificationType } from '@zeitvertreib/types';

interface NotificationInput {
  type: UserNotificationType;
  title: string;
  message: string;
}

export async function appendNotification(env: Env, userId: string, input: NotificationInput): Promise<void> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  await db.insert(notifications).values({
    userId,
    type: input.type,
    title: input.title,
    message: input.message,
    createdAt: Date.now(),
    readAt: null,
  });
}
