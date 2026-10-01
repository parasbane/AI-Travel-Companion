"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  AuthUser,
  UserProfile,
  LoginData,
  SignUpData,
  BudgetPreference,
  TravelGroupPreference,
} from "@/lib/types/auth";

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isConfigured: boolean;
  signIn: (data: LoginData) => Promise<{ success: boolean; error?: string }>;
  signUp: (data: SignUpData) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  updatePreferences: (
    styles: string[],
    budget: BudgetPreference,
    group: TravelGroupPreference
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_USER_KEY = "ai_travel_user";
const LOCAL_STORAGE_PROFILE_KEY = "ai_travel_profile";
const LOCAL_STORAGE_USERS_DB_KEY = "ai_travel_users_db";

function setAuthCookie(value: string | null) {
  if (typeof document === "undefined") return;
  if (value) {
    document.cookie = `ai_travel_session=${encodeURIComponent(
      value
    )}; path=/; max-age=604800; SameSite=Lax`;
  } else {
    document.cookie = "ai_travel_session=; path=/; max-age=0; SameSite=Lax";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const configured = isSupabaseConfigured();

  // Load existing session on initial render
  useEffect(() => {
    async function initSession() {
      setIsLoading(true);

      if (configured) {
        try {
          const supabase = createClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.user) {
            const authUser: AuthUser = {
              id: session.user.id,
              email: session.user.email ?? "",
              name: session.user.user_metadata?.name ?? session.user.email?.split("@")[0] ?? "Traveler",
            };
            setUser(authUser);

            // Fetch profile
            const { data: profileData } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", session.user.id)
              .single();

            if (profileData) {
              setProfile(profileData as UserProfile);
            } else {
              // Default fallback profile
              setProfile({
                id: session.user.id,
                name: authUser.name,
                email: authUser.email,
                travel_styles: [],
                budget_preference: "balanced",
                travel_group_preference: "solo",
              });
            }
          } else {
            setUser(null);
            setProfile(null);
          }
        } catch {
          setUser(null);
          setProfile(null);
        }
      } else {
        // Fallback for local development / testing without live keys
        try {
          const storedUser = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
          const storedProfile = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);

          if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            setAuthCookie(parsedUser.id);
            if (storedProfile) {
              setProfile(JSON.parse(storedProfile));
            }
          } else {
            setUser(null);
            setProfile(null);
            setAuthCookie(null);
          }
        } catch {
          setUser(null);
          setProfile(null);
        }
      }

      setIsLoading(false);
    }

    initSession();

    if (configured) {
      const supabase = createClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email ?? "",
            name: session.user.user_metadata?.name ?? session.user.email?.split("@")[0] ?? "Traveler",
          };
          setUser(authUser);
        } else {
          setUser(null);
          setProfile(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [configured]);

  const signUp = useCallback(
    async (data: SignUpData): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);

      if (configured) {
        try {
          const supabase = createClient();
          const { data: authData, error } = await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
              data: {
                name: data.name,
              },
            },
          });

          if (error) {
            setIsLoading(false);
            return { success: false, error: error.message };
          }

          if (authData.user) {
            const authUser: AuthUser = {
              id: authData.user.id,
              email: authData.user.email ?? data.email,
              name: data.name,
            };
            const newProfile: UserProfile = {
              id: authData.user.id,
              name: data.name,
              email: data.email,
              travel_styles: [],
              budget_preference: "balanced",
              travel_group_preference: "solo",
            };

            // Attempt to create profile row if tables exist
            await supabase.from("profiles").upsert(newProfile);

            setUser(authUser);
            setProfile(newProfile);
            setAuthCookie(authUser.id);
          }

          setIsLoading(false);
          return { success: true };
        } catch (err: unknown) {
          setIsLoading(false);
          const message = err instanceof Error ? err.message : "Failed to sign up";
          return { success: false, error: message };
        }
      } else {
        // Local mode simulation with localStorage
        try {
          const rawDb = localStorage.getItem(LOCAL_STORAGE_USERS_DB_KEY);
          const usersDb: Record<string, { password: string; name: string }> = rawDb
            ? JSON.parse(rawDb)
            : {};

          if (usersDb[data.email.toLowerCase()]) {
            setIsLoading(false);
            return {
              success: false,
              error: "An account with this email already exists.",
            };
          }

          usersDb[data.email.toLowerCase()] = {
            password: data.password,
            name: data.name,
          };
          localStorage.setItem(LOCAL_STORAGE_USERS_DB_KEY, JSON.stringify(usersDb));

          const newId = `user_${Date.now()}`;
          const authUser: AuthUser = {
            id: newId,
            email: data.email,
            name: data.name,
          };
          const newProfile: UserProfile = {
            id: newId,
            name: data.name,
            email: data.email,
            travel_styles: [],
            budget_preference: "balanced",
            travel_group_preference: "solo",
          };

          localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(authUser));
          localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newProfile));
          setAuthCookie(authUser.id);

          setUser(authUser);
          setProfile(newProfile);
          setIsLoading(false);
          return { success: true };
        } catch {
          setIsLoading(false);
          return { success: false, error: "Failed to store user profile." };
        }
      }
    },
    [configured]
  );

  const signIn = useCallback(
    async (data: LoginData): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);

      if (configured) {
        try {
          const supabase = createClient();
          const { data: authData, error } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password,
          });

          if (error) {
            setIsLoading(false);
            return { success: false, error: error.message };
          }

          if (authData.user) {
            const authUser: AuthUser = {
              id: authData.user.id,
              email: authData.user.email ?? data.email,
              name:
                authData.user.user_metadata?.name ??
                authData.user.email?.split("@")[0] ??
                "Traveler",
            };
            setUser(authUser);
            setAuthCookie(authUser.id);

            const { data: profileData } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", authData.user.id)
              .single();

            if (profileData) {
              setProfile(profileData as UserProfile);
            } else {
              setProfile({
                id: authData.user.id,
                name: authUser.name,
                email: authUser.email,
                travel_styles: [],
                budget_preference: "balanced",
                travel_group_preference: "solo",
              });
            }
          }

          setIsLoading(false);
          return { success: true };
        } catch (err: unknown) {
          setIsLoading(false);
          const message = err instanceof Error ? err.message : "Failed to sign in";
          return { success: false, error: message };
        }
      } else {
        // Local mode check
        try {
          const rawDb = localStorage.getItem(LOCAL_STORAGE_USERS_DB_KEY);
          const usersDb: Record<string, { password: string; name: string }> = rawDb
            ? JSON.parse(rawDb)
            : {};

          const existingUser = usersDb[data.email.toLowerCase()];
          if (!existingUser || existingUser.password !== data.password) {
            setIsLoading(false);
            return {
              success: false,
              error: "Invalid email or password. Please check your credentials.",
            };
          }

          const authUser: AuthUser = {
            id: `user_${data.email.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
            email: data.email,
            name: existingUser.name,
          };

          const rawProfile = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
          const existingProfile: UserProfile = rawProfile
            ? JSON.parse(rawProfile)
            : {
                id: authUser.id,
                name: existingUser.name,
                email: data.email,
                travel_styles: [],
                budget_preference: "balanced",
                travel_group_preference: "solo",
              };

          localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(authUser));
          localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(existingProfile));
          setAuthCookie(authUser.id);

          setUser(authUser);
          setProfile(existingProfile);
          setIsLoading(false);
          return { success: true };
        } catch {
          setIsLoading(false);
          return { success: false, error: "Failed to sign in." };
        }
      }
    },
    [configured]
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    if (configured) {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // Ignore signout error
      }
    }

    try {
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
      setAuthCookie(null);
    } catch {
      // Ignore
    }

    setUser(null);
    setProfile(null);
    setIsLoading(false);
  }, [configured]);

  const updatePreferences = useCallback(
    async (
      styles: string[],
      budget: BudgetPreference,
      group: TravelGroupPreference
    ) => {
      if (!profile) return;

      const updated: UserProfile = {
        ...profile,
        travel_styles: styles,
        budget_preference: budget,
        travel_group_preference: group,
        updated_at: new Date().toISOString(),
      };

      setProfile(updated);

      if (configured) {
        try {
          const supabase = createClient();
          await supabase.from("profiles").upsert(updated);
        } catch {
          // Ignore
        }
      } else {
        try {
          localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore
        }
      }
    },
    [configured, profile]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isConfigured: configured,
        signIn,
        signUp,
        signOut,
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
