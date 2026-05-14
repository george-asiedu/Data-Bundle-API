export const swaggerServerErrorResponse = {
  500: {
    description: 'Internal Server Error',
    content: {
      'application/json': {
        schema: {
          example: {
            message: 'Something went wrong',
            error: 'Internal Server Error',
            statusCode: 500,
          },
        },
      },
    },
  },
};
