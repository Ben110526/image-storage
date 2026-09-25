import type { Env, ImageMetadata } from '../types';
import type { AuthTokenSource } from './gdrive';
import { userDriveAuth } from './gdrive';
import { getUserRecord } from './session';

export async function imageAuthSource(env: Env, image: ImageMetadata): Promise<AuthTokenSource> {
  if (image.storage_backend === 'shared' || !image.owner_id) return env;
  // Preserve access to any legacy personal-Drive images; all new uploads use the shared ImgStore Drive.
  const user = await getUserRecord(env.IMGSTORE_META, image.owner_id);
  if (!user?.refreshToken) throw new Error('Legacy image requires its original Drive connection.');
  return userDriveAuth(env, user);
}
