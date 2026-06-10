import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import type { DocumentStorage } from './types.js';

function createS3Client(): S3Client {
  const { region, endpoint, accessKeyId, secretAccessKey } = config.s3;
  const clientConfig: ConstructorParameters<typeof S3Client>[0] = { region };

  if (endpoint) {
    clientConfig.endpoint = endpoint;
    clientConfig.forcePathStyle = true;
  }

  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
    };
  }

  return new S3Client(clientConfig);
}

export function isS3Configured(): boolean {
  return Boolean(config.s3.bucket);
}

export function createS3DocumentStorage(): DocumentStorage {
  const client = createS3Client();
  const bucket = config.s3.bucket;

  return {
    driver: 's3',
    async upload(key, body, contentType = 'application/pdf') {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async download(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        if (!response.Body) return null;
        return await response.Body.transformToByteArray();
      } catch (err) {
        const code = (err as { name?: string }).name;
        if (code === 'NoSuchKey' || code === 'NotFound') return null;
        throw err;
      }
    },
    async delete(key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    },
    async getViewUrl(key) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
        { expiresIn: config.s3.presignExpiresSeconds },
      );
    },
  };
}
