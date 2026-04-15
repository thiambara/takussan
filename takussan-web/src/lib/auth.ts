import { apiRequest } from './api';

export type User = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  email_verified_at: string | null;
  bio: string | null;
  type: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type UpdateProfilePayload = {
  first_name: string;
  last_name: string;
  bio?: string;
  avatar?: File | null;
};

export async function register(payload: RegisterPayload): Promise<AuthResponse & { message: string }> {
  return apiRequest('/api/auth/register', { method: 'POST', body: payload });
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiRequest('/api/auth/login', { method: 'POST', body: payload });
}

export async function logout(token: string): Promise<void> {
  return apiRequest('/api/auth/logout', { method: 'POST', token });
}

export async function getMe(token: string): Promise<User> {
  return apiRequest('/api/auth/me', { token });
}

export async function updateProfile(token: string, payload: UpdateProfilePayload): Promise<User> {
  const formData = new FormData();
  formData.append('_method', 'PUT');
  formData.append('first_name', payload.first_name);
  formData.append('last_name', payload.last_name);
  if (payload.bio !== undefined) formData.append('bio', payload.bio);
  if (payload.avatar) formData.append('avatar', payload.avatar);

  return apiRequest('/api/auth/profile', {
    method: 'POST',
    body: formData,
    token,
    formData: true,
  });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return apiRequest('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(payload: {
  token: string;
  email: string;
  password: string;
  password_confirmation: string;
}): Promise<{ message: string }> {
  return apiRequest('/api/auth/reset-password', { method: 'POST', body: payload });
}

export async function resendVerification(token: string): Promise<{ message: string }> {
  return apiRequest('/api/auth/email/resend', { method: 'POST', token });
}
