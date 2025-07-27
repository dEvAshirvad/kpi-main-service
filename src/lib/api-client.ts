import env from '@/configs/env';
import axios, { AxiosHeaders, AxiosResponse } from 'axios';

// Types for the session response
export interface Session {
  id: string;
  expiresAt: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  ipAddress: string;
  userAgent: string;
  userId: string;
  impersonatedBy: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: string;
  image: string;
  createdAt: string;
  updatedAt: string;
  role: string;
  banned: boolean;
  banReason: string;
  banExpires: string;
}

export interface GetSessionResponse {
  session: Session;
  user: User;
}

export interface ErrorResponse {
  message: string;
}

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: env.AUTH_URL,
  timeout: 10000,
  withCredentials: true, // Important for session cookies
});

/**
 * Get current session information
 * @returns Promise with session and user data
 */
export const getSession = async (
  headers: AxiosHeaders
): Promise<GetSessionResponse> => {
  try {
    const response: AxiosResponse<GetSessionResponse> = await apiClient.get(
      '/api/auth/get-session',
      {
        headers,
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 400) {
        throw new Error((error.response.data as ErrorResponse).message);
      }
      throw new Error(`Request failed: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Generic function to make authenticated requests
 * @param endpoint - API endpoint
 * @param options - Request options
 * @returns Promise with response data
 */
export const apiRequest = async <T = any>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    data?: any;
    params?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<T> => {
  const { method = 'GET', data, params, headers = {} } = options;

  try {
    const response: AxiosResponse<T> = await apiClient.request({
      method,
      url: endpoint,
      data,
      params,
      headers,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 400) {
        throw new Error((error.response.data as ErrorResponse).message);
      }
      throw new Error(`Request failed: ${error.message}`);
    }
    throw error;
  }
};

export default apiClient;
