export interface IResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: Date;
}

export interface IErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: Date;
}

export type ISuccessResponse<T> = {
  success: true;
  data: T;
  timestamp: Date;
};
