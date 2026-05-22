import { swaggerServerErrorResponse } from '../lib/utils/swagger-error-response.utils';

export const swaggerRegisterResponse = {
  summary: 'This endpoint is only to be used on the register page',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Please check your email to verify ',
            },
          },
        },
      },
    },
    400: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Email already exist',
              error: 'Bad Request',
              statusCode: 400,
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};

export const swaggerVerifyEmailResponse = {
  summary:
    'This endpoint is to be used after creating account to verify the email used before access to the system',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Email is verified',
            },
          },
        },
      },
    },
    400: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Token is invalid',
              error: 'Bad Request',
              statusCode: 400,
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};

export const swaggerVerifyMfaResponse = {
  summary:
    'This endpoint is to be used after login to verify the 6-digit MFA code',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'MFA verification successful, you are now logged in',
              data: {
                user: {
                  id: 'CR1001',
                  fullName: null,
                  email: '<EMAIL>',
                  role: 'CONTENT_CREATOR',
                  accountStatus: 'VERIFIED',
                  imageUrl: null,
                },
                token: {
                  accessToken: 'your-access-token',
                  refreshToken: 'your-refresh-token',
                },
              },
            },
          },
        },
      },
    },
    400: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Invalid MFA session',
              error: 'Bad Request',
              statusCode: 400,
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};

export const swaggerCheckEmailResponse = {
  summary:
    'This endpoint is only to be used only when registering to verify if the provided email in the input field is not taken',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Email can be used',
            },
          },
        },
      },
    },
    400: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Email already taken',
              error: 'Bad Request',
              statusCode: 400,
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};

export const swaggerRequestPasswordReset = {
  summary:
    'This endpoint is only to be used on the forgot password page to request a password reset',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Please check your email and password',
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};

export const swaggerResetPasswordResponse = {
  summary:
    'This endpoint is only to be used on the reset-password page to change user password',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'You have successfully changed your password',
            },
          },
        },
      },
    },
    400: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Access token',
              error: 'Bad Request',
              statusCode: 400,
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};

export const swaggerVerifyTokenResponse = {
  summary:
    'This endpoint is only to be used on the reset password page but before loading the screen to verify if the token provided by the user is valid or not',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Valid token',
            },
          },
        },
      },
    },
    400: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Invalid token',
              error: 'Bad Request',
              statusCode: 400,
            },
          },
        },
      },
    },
  },
};

export const swaggerLoginResponse = {
  summary: 'This endpoint is only to be used when a user wants to login',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'You are logged-in successfully',
              data: {
                user: {
                  id: 'CR1001',
                  fullName: null,
                  email: 'example@mail.com',
                  role: 'CONTENT_CREATOR',
                  accountStatus: 'VERIFIED',
                  imageUrl: null,
                },
                token: {
                  accessToken: '**********',
                  refreshToken: '**********',
                },
              },
            },
          },
        },
      },
    },
    400: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Invalid email and or password',
              error: 'Bad Request',
              statusCode: 400,
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};

export const swaggerGetAuthenticatedUserResponse = {
  summary: 'This endpoint is only to be used to get the authenticated user',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              data: {
                id: 'CR1001',
                fullName: null,
                email: 'example@mail.com',
                role: 'CONTENT_CREATOR',
                accountStatus: 'VERIFIED',
                imageUrl: null,
              },
            },
          },
        },
      },
    },
    401: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Access denied',
              error: 'Unauthorized',
              statusCode: 401,
            },
          },
        },
      },
    },
  },
};

export const swaggerRefreshAccessTokenResponse = {
  summary: 'This endpoint is only to be used to request a new access token',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            example: {
              data: {
                token: '*****',
              },
            },
          },
        },
      },
    },
    401: {
      description: 'Error',
      content: {
        'application/json': {
          schema: {
            example: {
              message: 'Access denied',
              error: 'Unauthorized',
              statusCode: 401,
            },
          },
        },
      },
    },
    ...swaggerServerErrorResponse,
  },
};
