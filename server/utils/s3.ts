import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let client: S3Client | null = null

// nuxt.config reads MY_AWS_* / S3_BUCKET at build time, and the Docker build has
// no .env — so fall back to the process env at runtime, letting the container
// use stc-front's .env unchanged.
function readConfig() {
    const cfg = useRuntimeConfig()
    const env = process.env
    return {
        region: (cfg.awsRegion as string) || env.MY_AWS_REGION || '',
        accessKeyId: (cfg.awsAccessKeyId as string) || env.MY_AWS_ACCESS_KEY_ID || '',
        secretAccessKey: (cfg.awsSecretAccessKey as string) || env.MY_AWS_SECRET_ACCESS_KEY || '',
        bucket: (cfg.s3Bucket as string) || env.S3_BUCKET || '',
    }
}

// Same client options as stc-front/server/utils/s3.ts.
export const S3_CLIENT_DEFAULTS = {
    requestChecksumCalculation: 'WHEN_REQUIRED',
} as const

function getClient() {
    if (!client) {
        const { region, accessKeyId, secretAccessKey } = readConfig()
        client = new S3Client({
            region,
            credentials: { accessKeyId, secretAccessKey },
            ...S3_CLIENT_DEFAULTS,
        })
    }
    return client
}

function getBucket() {
    const { bucket } = readConfig()
    if (!bucket) {
        throw createError({ statusCode: 500, statusMessage: 'S3 bucket not configured' })
    }
    return bucket
}

export const PAYMENTS_PREFIX = 'payments/'

export const FILE_KINDS = ['payment', 'contract'] as const
export type FileKind = typeof FILE_KINDS[number]

export const ALLOWED_FILE_MIME: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
}

export const MAX_FILE_BYTES = 15 * 1024 * 1024

// Uploads go through this server rather than a presigned PUT from the browser:
// the bucket's CORS rules only list stc-front's origins.
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await getClient().send(new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
    }))
}

export async function createDownloadUrl(key: string, fileName?: string, expiresIn = 300): Promise<string> {
    const cmd = new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
        ...(fileName ? { ResponseContentDisposition: `inline; filename="${fileName.replace(/["\\]/g, '')}"` } : {}),
    })
    return getSignedUrl(getClient(), cmd, { expiresIn })
}
