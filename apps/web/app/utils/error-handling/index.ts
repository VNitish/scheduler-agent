// Error handling utilities for the dashboard page

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const handleApiError = (error: any, context: string): ApiError => {
  console.error(`[${context}] Error:`, error);

  if (error instanceof ApiError) {
    return error;
  }

  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;
    const message = data?.message || `API request failed with status ${status}`;
    return new ApiError(message, status, data);
  } else if (error.request) {
    // Request was made but no response received
    return new ApiError('Network error: Unable to reach server', 0);
  } else {
    // Something else happened
    return new ApiError(error.message || 'An unexpected error occurred', 500);
  }
};

export const safeFetch = async (
  input: RequestInfo,
  init?: RequestInit,
  context: string = 'API_CALL'
): Promise<Response> => {
  try {
    const response = await fetch(input, init);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `HTTP error! status: ${response.status}`,
        response.status,
        errorData
      );
    }
    
    return response;
  } catch (error) {
    const apiError = handleApiError(error, context);
    throw apiError;
  }
};