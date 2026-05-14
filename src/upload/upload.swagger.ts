import { swaggerServerErrorResponse } from 'src/lib/utils/swagger-error-response.utils';

const unauthorizedResponse = {
  401: {
    description: 'Unauthorized',
    content: {
      'application/json': {
        schema: {
          example: {
            message: 'You are not authorized to perform this action',
            error: 'Unauthorized',
            statusCode: 401,
          },
        },
      },
    },
  },
};

const badRequestResponse = (message: string) => ({
  400: {
    description: 'Bad Request',
    content: {
      'application/json': {
        schema: {
          example: {
            message,
            error: 'Bad Request',
            statusCode: 400,
          },
        },
      },
    },
  },
});

export const swaggerInitiateUploadResponse = {
  summary: 'Initiate a multipart upload to S3',
  responses: {
    201: {
      description: 'Upload initiated',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Upload Initiated',
              uploadId: 'vY7.L8mP0zRQW...',
              key: 'portfolios/usr-123/abc_myfile.png',
              presignedUrls: [
                'https://s3.amazonaws.com/growthmind-store/key?partNumber=1&uploadId=...',
                'https://s3.amazonaws.com/growthmind-store/key?partNumber=2&uploadId=...',
              ],
            },
          },
        },
      },
    },
    ...badRequestResponse('Invalid file metadata'),
    ...unauthorizedResponse,
    ...swaggerServerErrorResponse,
  },
};

export const swaggerCompleteUploadResponse = {
  summary: 'Complete multipart upload and save asset metadata',
  responses: {
    200: {
      description: 'File successfully uploaded and metadata saved in database',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Upload completed successfully',
              data: {
                key: 'portfolios/usr-123/abc_myfile.png',
                shortUrl: 'https://gmind.me/abc_myfile.png',
                longUrl:
                  'https://s3.amazonaws.com/growthmind-store/portfolios/usr-123/abc_myfile.png',
              },
            },
          },
        },
      },
    },
    ...badRequestResponse('Invalid uploadId or mismatched parts'),
    ...swaggerServerErrorResponse,
  },
};

export const swaggerAbortUploadResponse = {
  summary: 'Abort an active multipart upload',
  responses: {
    200: {
      description: 'Upload aborted and S3 resources cleaned up',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Upload aborted successfully',
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};
