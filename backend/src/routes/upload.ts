import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createResponse } from '../utils.js';

export async function handleFileUpload(
    request: Request,
    env: Env,
): Promise<Response> {
    const origin = request.headers.get('Origin');

    try {
        // Check if request has a file
        const contentType = request.headers.get('content-type') || '';

        if (!contentType.includes('multipart/form-data')) {
            return createResponse(
                { error: 'Content-Type must be multipart/form-data' },
                400,
                origin,
            );
        }

        // Parse form data
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return createResponse(
                { error: 'No file provided. Use "file" as the form field name.' },
                400,
                origin,
            );
        }

        // Generate random filename
        const randomName = crypto.randomUUID();
        const extension = file.name.split('.').pop() || '';
        const filename = extension ? `${randomName}.${extension}` : randomName;

        // Initialize S3 client for MinIO
        const s3Client = new S3Client({
            region: 'eu-west', // MinIO doesn't require a specific region, but SDK needs one
            endpoint: 'https://s3.zeitvertreib.vip',
            credentials: {
                accessKeyId: env.MINIO_ACCESS_KEY,
                secretAccessKey: env.MINIO_SECRET_KEY,
            },
            forcePathStyle: true, // Required for MinIO
        });

        // Convert file to ArrayBuffer
        const fileBuffer = await file.arrayBuffer();

        // Upload to S3/MinIO
        const uploadCommand = new PutObjectCommand({
            Bucket: 'test',
            Key: filename,
            Body: new Uint8Array(fileBuffer),
            ContentType: file.type || 'application/octet-stream',
        });

        await s3Client.send(uploadCommand);

        // Return success with file URL
        const fileUrl = `https://s3.zeitvertreib.vip/test/${filename}`;

        return createResponse(
            {
                success: true,
                filename,
                url: fileUrl,
                size: file.size,
                type: file.type,
            },
            200,
            origin,
        );
    } catch (error) {
        console.error('File upload error:', error);
        return createResponse(
            {
                error: 'Failed to upload file',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            500,
            origin,
        );
    }
}
