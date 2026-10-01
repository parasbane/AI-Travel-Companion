export type BudgetPreference = "budget" | "balanced" | "luxury";
export type TravelGroupPreference = "solo" | "couple" | "family" | "friends";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  travel_styles: string[];
  budget_preference: BudgetPreference;
  travel_group_preference: TravelGroupPreference;
  created_at?: string;
  updated_at?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface SignUpData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: AuthUser;
}
